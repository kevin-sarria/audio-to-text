import { WarningHint } from "../WarningHints.js";
import { AuthRule, CodeFacts, CodeTrap, Endpoint, EntityInfo } from "./types.js";

/**
 * Convierte los hechos del código en texto: el bloque «=== CÓDIGO» del prompt (con
 * archivo:línea para que el modelo cite), los bloques «Del código» del contexto y las
 * trampas como pistas. Nunca incluye valores de configuración.
 */

const ref = (x: { path: string; line: number }) => `${x.path}:${x.line}`;
const list = (xs: string[], max = 12) => (xs.length > max ? `${xs.slice(0, max).join(", ")}, … (${xs.length - max} más)` : xs.join(", "));

function authLine(a: AuthRule): string {
  const parts: string[] = [];
  if (a.roles.length) parts.push(`roles: ${a.roles.join(", ")}`);
  if (a.policy) parts.push(`política: ${a.policy}`);
  if (a.claim) parts.push(`claim: ${a.claim}`);
  if (a.anonymous) parts.push("anónimo");
  if (!parts.length) parts.push("solo usuarios autenticados");
  return `${a.target} → ${parts.join(" · ")} (${a.via}; fuente: ${ref(a)})`;
}

function endpointLine(e: Endpoint): string {
  const access = e.anonymous
    ? "anónimo"
    : e.roles.length
      ? e.roles.join(", ")
      : e.policy
        ? `política ${e.policy}`
        : e.method === "PANTALLA"
          ? ""
          : e.authorized
            ? "autenticado"
            : "sin autorización declarada";
  return `${e.method} ${e.route}${access ? ` [${access}]` : ""} (fuente: ${ref(e)})`;
}

function entityLine(e: EntityInfo): string {
  const kind = [e.abstract ? "abstracta" : "", e.base ? `hereda de ${e.base}` : "", e.table ? `tabla ${e.table}` : ""].filter(Boolean).join(", ");
  const fields = e.fields.length ? ` — campos: ${list(e.fields, 10)}` : "";
  return `${e.name}${kind ? ` (${kind})` : ""}${fields} (fuente: ${ref(e)})`;
}

const TRAP_ORDER: Record<CodeTrap["kind"], number> = { "permisos-distintos": 0, seguridad: 1, entorno: 2, "sin-autorizacion": 3, decision: 4 };
const MAX_TRAP_HINTS = 20;

export function sortedTraps(facts: CodeFacts): CodeTrap[] {
  return [...facts.traps].sort((a, b) => TRAP_ORDER[a.kind] - TRAP_ORDER[b.kind]);
}

/** Las trampas del código entran a las mismas pistas que las de los documentos. */
export function codeTrapsAsHints(facts: CodeFacts): WarningHint[] {
  return sortedTraps(facts)
    .slice(0, MAX_TRAP_HINTS)
    .map((t) => ({ path: t.path, line: t.line, text: t.text, kind: "codigo" as const }));
}

interface Section {
  title: string;
  lines: string[];
}

function sections(facts: CodeFacts): Section[] {
  const out: Section[] = [];
  const roles = [
    ...facts.roleSets.map((r) => `- Roles \`${r.name}\`: ${r.values.join(", ")} (fuente: ${ref(r)})`),
    ...facts.auth.map((a) => `- ${authLine(a)}`),
    ...facts.permissionModels.map((p) => `- \`${p.repo}\` decide los permisos ${p.detail} (fuente: ${ref(p)})`),
    ...facts.globalAuth.map((g) => `- \`${g.repo}\`: autorización global para todos los endpoints (fuente: ${ref(g)})`)
  ];
  out.push({ title: "Roles y acceso", lines: roles });
  out.push({ title: "Endpoints y pantallas", lines: facts.endpoints.map((e) => `- \`${e.repo}\`: ${endpointLine(e)}`) });
  out.push({
    title: "Entidades y enumeraciones",
    lines: [
      ...facts.entities.map((e) => `- \`${e.repo}\`: ${entityLine(e)}`),
      ...facts.enums.map((e) => `- Enum \`${e.name}\`: ${e.values.join(", ")} (fuente: ${ref(e)})`)
    ]
  });
  out.push({ title: "Esquema de la base", lines: facts.schema.map((s) => `- \`${s.repo}\`: ${s.mechanism} — ${s.detail} (fuente: ${ref(s)})`) });

  const byFile = new Map<string, string[]>();
  for (const e of facts.i18n) byFile.set(`${e.path} (${e.locale})`, [...(byFile.get(`${e.path} (${e.locale})`) ?? []), `${e.key}=«${e.value}»`]);
  out.push({
    title: "Textos de pantalla (i18n y pantallas)",
    lines: [
      ...[...byFile].map(([file, entries]) => `- \`${file}\`: ${entries.join(" · ")}`),
      ...facts.screens.map((s) => `- \`${s.path}\` muestra: ${s.texts.map((t) => `«${t}»`).join(" · ")}`)
    ]
  });
  const keysByRepo = new Map<string, string[]>();
  for (const k of facts.configKeys) keysByRepo.set(k.repo, [...(keysByRepo.get(k.repo) ?? []), `${k.key} (${ref(k)})`]);
  out.push({ title: "Claves de configuración que lee el código (solo nombres; los valores no se leen)", lines: [...keysByRepo].map(([repo, keys]) => `- \`${repo}\`: ${list(keys, 25)}`) });
  out.push({ title: "Pruebas", lines: facts.tests.map(testLine) });
  return out;
}

export function testLine(t: CodeFacts["tests"][number]): string {
  const parts: string[] = [];
  if (t.projects.length) parts.push(`${t.projects.length} proyecto(s) de pruebas (${t.projects.join(", ")})`);
  if (t.frameworks.length) parts.push(`framework: ${t.frameworks.join(", ")}`);
  if (!parts.length) parts.push("sin framework ni proyecto de pruebas");
  return `- \`${t.repo}\`: ${parts.join("; ")}; ${t.testFiles} archivo(s) de prueba`;
}

/** Bloque del prompt. Si no cabe, recorta desde las secciones menos importantes. */
export function describeCodeForPrompt(facts: CodeFacts, maxChars: number): string {
  const trapLines = sortedTraps(facts).map((t) => `- ${ref(t)} [${t.kind}] ${t.text}`);
  const all: Section[] = [{ title: "Posibles trampas en el código", lines: trapLines }, ...sections(facts)];
  const render = (secs: Section[]) =>
    secs
      .filter((s) => s.lines.length)
      .map((s) => `${s.title}:\n${s.lines.join("\n")}`)
      .join("\n\n");

  let text = render(all);
  // Orden de recorte (índices de `all`): configuración, textos, endpoints, entidades, roles, trampas.
  const cutOrder = [6, 5, 2, 3, 1, 0, 4, 7];
  for (const idx of cutOrder) {
    if (text.length <= maxChars) break;
    const sec = all[idx];
    if (!sec || sec.lines.length <= 3) continue;
    const original = sec.lines.length;
    let excess = text.length - maxChars + 40;
    while (sec.lines.length > 3 && excess > 0) excess -= sec.lines.pop()!.length + 1;
    sec.lines.push(`- … (${original - sec.lines.length} más sin mostrar)`);
    text = render(all);
  }
  const header = `Archivos de código leídos: ${facts.filesRead}${facts.filesNotRead ? ` (${facts.filesNotRead} sin leer por tamaño)` : ""}.`;
  return `${header}\n\n${text.slice(0, maxChars)}`;
}

/** Cada hecho del código con su archivo y línea, para que el verificador confirme citas del bloque CÓDIGO. */
export function codeEvidence(facts: CodeFacts): Array<{ path: string; line: number; text: string }> {
  return [
    ...facts.roleSets.map((r) => ({ path: r.path, line: r.line, text: `Roles ${r.name}: ${r.values.join(", ")}` })),
    ...facts.enums.map((e) => ({ path: e.path, line: e.line, text: `Enum ${e.name}: ${e.values.join(", ")}` })),
    ...facts.auth.map((a) => ({ path: a.path, line: a.line, text: authLine(a) })),
    ...facts.endpoints.map((e) => ({ path: e.path, line: e.line, text: endpointLine(e) })),
    ...facts.entities.map((e) => ({ path: e.path, line: e.line, text: entityLine(e) })),
    ...facts.schema.map((s) => ({ path: s.path, line: s.line, text: `${s.mechanism} — ${s.detail}` })),
    ...facts.traps.map((t) => ({ path: t.path, line: t.line, text: t.text })),
    ...facts.permissionModels.map((p) => ({ path: p.path, line: p.line, text: `decide los permisos ${p.detail}` })),
    ...facts.i18n.map((e) => ({ path: e.path, line: e.line, text: `${e.key}=«${e.value}»` })),
    ...facts.screens.map((s) => ({ path: s.path, line: s.line, text: s.texts.join(" · ") }))
  ];
}

/** Nombres reales del código: entidades, enums con sus valores y conjuntos de roles. */
export function codeNames(facts: CodeFacts): string[] {
  return [
    ...facts.entities.flatMap((e) => [e.name, e.table ?? ""]),
    ...facts.enums.flatMap((e) => [e.name, ...e.values]),
    ...facts.roleSets.flatMap((r) => [r.name, ...r.values])
  ].filter(Boolean);
}

/** Subtipos de una entidad (clases que heredan de ella), para el glosario. */
export function subtypesOf(name: string, facts: CodeFacts | undefined): string[] {
  if (!facts) return [];
  // «Incidencia», «Incidencia (o TipoIncidencia)», «Incidencia / Ticket»: vale el primer nombre con subtipos.
  const candidates = name.replace(/[`'"()]/g, " ").split(/\s+(?:o|y|or|and)\s+|[,/]|\s+/).map((n) => n.trim()).filter(Boolean);
  for (const c of candidates) {
    const subs = facts.entities.filter((e) => e.base === c).map((e) => e.name).sort();
    if (subs.length) return subs;
  }
  return [];
}

/** Bloque «Del código» de cada sección del contexto. */
export function codeBlockFor(key: string, facts: CodeFacts | undefined): string[] {
  if (!facts) return [];
  switch (key) {
    case "roles_permisos":
      return [
        ...facts.roleSets.map((r) => `- Roles \`${r.name}\`: ${r.values.join(", ")} (fuente: ${ref(r)})`),
        ...facts.auth.filter((a) => a.via !== "User.IsInRole").slice(0, 12).map((a) => `- ${authLine(a)}`),
        ...facts.permissionModels.map((p) => `- \`${p.repo}\` decide los permisos ${p.detail} (fuente: ${ref(p)})`)
      ];
    case "capas_estructura": {
      const repos = [...new Set([...facts.entities.map((e) => e.repo), ...facts.endpoints.map((e) => e.repo)])];
      return repos.map((repo) => {
        const ents = facts.entities.filter((e) => e.repo === repo).map((e) => e.name);
        const api = facts.endpoints.filter((e) => e.repo === repo && e.method !== "PANTALLA").map((e) => `${e.method} ${e.route}`);
        const screens = facts.endpoints.filter((e) => e.repo === repo && e.method === "PANTALLA").map((e) => e.route);
        const parts = [
          ents.length ? `entidades ${list(ents, 15)}` : "",
          api.length ? `endpoints ${list(api, 6)}` : "",
          screens.length ? `pantallas ${list(screens, 6)}` : ""
        ].filter(Boolean);
        return `- \`${repo}\`: ${parts.join(" · ")}`;
      });
    }
    case "cambios_base_datos":
      return facts.schema.map((s) => `- \`${s.repo}\`: ${s.detail} (fuente: ${ref(s)})`);
    case "verificacion":
      return facts.tests.map(testLine);
    default:
      return [];
  }
}
