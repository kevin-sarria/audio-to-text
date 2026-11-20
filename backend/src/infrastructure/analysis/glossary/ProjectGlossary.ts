/**
 * Datos estructurados de la CAPA 3 (glosario) y de las decisiones de alcance pendientes.
 *
 * Fuente única: el prompt (MeetingAnalysisPrompts) renderiza este glosario como texto y los
 * validadores deterministas usan las mismas listas. Así el glosario desplegado en el prompt y
 * el que usan los validadores nunca divergen (fallo detectado en v7: "aislamientos" estaba en
 * el documento de mejoras pero no en el prompt desplegado).
 */

export interface GlossaryPerson {
  name: string;
  role?: string;
  /** true = persona externa al equipo de desarrollo (sus pendientes son gestión externa). */
  external?: boolean;
  /** true = nunca debe figurar como responsable de un ítem. */
  neverResponsible?: boolean;
}

export interface AsrCorrection {
  heard: string[];
  correct: string;
}

export interface PendingScopeDecision {
  /** Raíz del tema (minúsculas, sin tildes opcionales) que se busca en títulos de issues. */
  topic: string;
  /** Repos en los que NO se debe crear issue mientras la decisión siga pendiente. */
  disallowedRepos: Array<"backend" | "panel" | "app">;
  description: string;
}

export const GLOSSARY_PEOPLE: GlossaryPerson[] = [
  { name: "Isa" },
  { name: "Cristian" },
  { name: "Juan", role: "revisor de PR y líder del proceso" },
  { name: "Juan Esteban", role: "módulo de formularios" },
  { name: "Alexis", role: "usuario de QA, no responsable", neverResponsible: true },
  { name: "Leo" },
  { name: "Lady", role: "fuente de usuarios; externa", external: true },
  { name: "Diego Meléndez", role: "API de Tri", external: true },
  { name: "María" },
  { name: "Valeria" },
  { name: "Suzuki" }
];

export const GLOSSARY_MATRIX_STATES = ["Abierto", "En corrección", "Validar Diamante", "Cerrado"];

export const GLOSSARY_DOMAIN_TERMS = [
  "aislamientos",
  "novedades (quejas del servicio)",
  "solicitudes",
  "llamados",
  "marcaciones",
  "dimensionamiento",
  "mantenimiento (= sede/cliente)",
  "centro de costo",
  "rutinas",
  "sábana de usuarios"
];

export const GLOSSARY_PLACES = [
  "Hospital San Vicente Fundación",
  "Cubrimientos Cali (lectura dudosa: Escali / Scali)",
  "Bicitrack",
  "Sociedad Portuaria"
];

export const GLOSSARY_FILES = [
  "matriz de maquinaria",
  '"máquina descripción" (archivo de la carpeta compartida con columna rendimiento)'
];

export const ASR_CORRECTIONS: AsrCorrection[] = [
  { heard: ["Lexus"], correct: "Alexis" },
  { heard: ["prón", "pront"], correct: "prompt" },
  { heard: ["valida de amante", "validar de amate"], correct: "Validar Diamante" },
  { heard: ["RAME", "TRAME", "derame"], correct: "derrame" },
  { heard: ["al EC"], correct: "Excel" },
  { heard: ["LRP"], correct: "ERP" },
  { heard: ["Bcirat"], correct: "Bicitrack" }
];

/** Terceros: un ítem cuya acción depende de ellos es gestion_externa o seguimiento (regla 22). */
export const EXTERNAL_PARTIES = ["crm", "lady", "diego meléndez", "diego melendez", "api de tri", "certificaciones"];

/**
 * Decisiones pendientes de Kevin (v8). Mientras sigan pendientes, el alcance por defecto es el
 * mínimo y no se crean issues en los repos indicados.
 */
export const PENDING_SCOPE_DECISIONS: PendingScopeDecision[] = [
  {
    topic: "dimensionamiento",
    disallowedRepos: ["panel", "app"],
    description:
      "Alcance de dimensionamiento: por defecto solo inyectar la matriz con rendimiento y ajustar el prompt (backend, 6–8 h). Pantalla de carga/visualización en el panel o endpoints móviles = PROPUESTO, sin issue hasta confirmar."
  },
  {
    topic: "reprogram",
    disallowedRepos: ["app"],
    description:
      "Reprogramación: no hay base en la transcripción para un issue de app. Canal por defecto = panel; preguntar NO BLOQUEANTE si también va en la app."
  }
];

/** Términos del glosario (minúsculas) que nunca deben tratarse como ruido o vocabulario dudoso. */
export const GLOSSARY_TERMS: string[] = [
  "aislamientos",
  "san vicente",
  "hospital san vicente fundación",
  "bicitrack",
  "matriz de maquinaria",
  "máquina descripción",
  "cubrimientos cali",
  "sociedad portuaria",
  "dimensionamiento",
  "sábana de usuarios",
  "centro de costo",
  "validar diamante"
];

/** Siglas y formas correctas aceptadas aunque no aparezcan literales en la transcripción. */
export function glossaryAcceptedForms(): Set<string> {
  const forms = new Set<string>();
  for (const c of ASR_CORRECTIONS) forms.add(c.correct.toLowerCase());
  for (const p of GLOSSARY_PEOPLE) forms.add(p.name.toLowerCase());
  for (const t of GLOSSARY_TERMS) forms.add(t.toLowerCase());
  return forms;
}

export function renderGlossaryLayer(): string {
  const people = GLOSSARY_PEOPLE.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(", ");
  const corrections = ASR_CORRECTIONS.map(
    (c) => `- ${c.heard.map((h) => `"${h}"`).join(" / ")} → "${c.correct}"`
  ).join("\n");
  const pending = PENDING_SCOPE_DECISIONS.map((d) => `- ${d.description}`).join("\n");

  return `[CAPA 3 — GLOSARIO]
Personas: ${people}
Estados de la matriz de hallazgos: ${GLOSSARY_MATRIX_STATES.join(", ")}
Términos del dominio: ${GLOSSARY_DOMAIN_TERMS.join(", ")}
Lugares/clientes: ${GLOSSARY_PLACES.join(", ")}
Archivos: ${GLOSSARY_FILES.join(", ")}
Terceros (sus pendientes son gestion_externa, nunca issue de código): CRM, Lady, Diego Meléndez (API de Tri), certificaciones
Errores típicos del ASR → forma correcta (corregir en silencio):
${corrections}

DECISIONES DE ALCANCE PENDIENTES (PROPUESTO hasta que se confirmen):
${pending}`;
}
