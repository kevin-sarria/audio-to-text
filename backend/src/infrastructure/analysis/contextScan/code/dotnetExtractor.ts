import { CodeFacts, SourceFile } from "./types.js";
import { isCommentLine, joinRoute, roleNames, stringLiterals } from "./sourceText.js";

/**
 * C# / ASP.NET Core / EF Core: controladores con [Route]/[HttpX], [Authorize(Roles|Policy)],
 * [AllowAnonymous], minimal APIs (MapGet…RequireAuthorization), políticas (AddPolicy),
 * User.IsInRole, enums, entidades (DbSet y clases de carpetas de dominio) y cómo se crea el esquema.
 */

const ROLE_ENUM_NAME = /^(?:rol|role|roles|roles?enum|userroles?|perfil|perfiles|tipousuario|usertype|tiporol)$/i;
const ENTITY_DIR_RE = /(?:^|\/)(?:entities|entity|domain|models?)\//i;
const HTTP_ATTR_RE = /\[\s*Http(Get|Post|Put|Patch|Delete|Head|Options)\s*(?:\(\s*(?:"([^"]*)")?[^)]*\))?\s*\]/;
const MAP_RE = /\.Map(Get|Post|Put|Patch|Delete|Methods)\s*\(\s*"([^"]*)"/;

interface Pending {
  routes: string[];
  roles: string[];
  policy?: string;
  authorize: boolean;
  anonymous: boolean;
  http?: { method: string; route: string };
  line: number;
}

const emptyPending = (): Pending => ({ routes: [], roles: [], authorize: false, anonymous: false, line: 0 });

function readAttributes(line: string, p: Pending, lineNo: number): void {
  const route = line.match(/\[\s*Route\s*\(\s*"([^"]*)"/);
  if (route) p.routes.push(route[1]!);
  const auth = line.match(/\[\s*Authorize\s*(?:\(([^)]*)\))?\s*\]/);
  if (auth) {
    p.authorize = true;
    const args = auth[1] ?? "";
    const rolesArg = args.match(/Roles\s*=\s*("[^"]*"|[\w.]+(?:\s*\+\s*(?:"[^"]*"|[\w.]+))*)/);
    if (rolesArg) {
      const expr = rolesArg[1]!;
      const names = roleNames(expr);
      // Constantes (`Roles = RoleNames.Admin`): se muestra el nombre de la constante.
      p.roles.push(...(names.length ? names : expr.split(/\s*\+\s*/).map((s) => s.split(".").pop()!)));
    }
    const policy = args.match(/Policy\s*=\s*"([^"]+)"/) ?? args.match(/^\s*"([^"]+)"\s*$/);
    if (policy) p.policy = policy[1];
    if (!p.line) p.line = lineNo;
  }
  if (/\[\s*AllowAnonymous\s*\]/.test(line)) p.anonymous = true;
  const http = line.match(HTTP_ATTR_RE);
  if (http) p.http = { method: http[1]!.toUpperCase(), route: http[2] ?? "" };
}

function controllers(file: SourceFile, lines: string[], facts: CodeFacts): void {
  let pending = emptyPending();
  let cls: { name: string; route: string; p: Pending } | null = null;

  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    const lineNo = i + 1;
    readAttributes(raw, pending, lineNo);

    const classMatch = raw.match(/\bclass\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1]!;
      const isController = /Controller$/.test(name) || /:\s*(?:Controller|ControllerBase|ApiController)\b/.test(raw);
      if (isController) {
        const base = name.replace(/Controller$/, "");
        const route = (pending.routes[0] ?? "").replace(/\[controller\]/gi, base).replace(/\[action\]/gi, "");
        cls = { name, route, p: pending };
        if (pending.authorize || pending.anonymous) {
          facts.auth.push({
            repo: file.repo,
            path: file.path,
            line: pending.line || lineNo,
            target: route || name,
            roles: pending.roles,
            policy: pending.policy,
            anonymous: pending.anonymous || undefined,
            via: "[Authorize]"
          });
        }
      }
      pending = emptyPending();
      return;
    }

    const method = raw.match(/\bpublic\s+(?:async\s+)?[\w<>[\],.?\s]+?\s+(\w+)\s*\(/);
    if (method && cls) {
      if (pending.http || pending.routes.length) {
        const sub = (pending.http?.route || pending.routes[0] || "").replace(/\[action\]/gi, method[1]!);
        const roles = [...new Set([...cls.p.roles, ...pending.roles])];
        const policy = pending.policy ?? cls.p.policy;
        const anonymous = pending.anonymous || (cls.p.anonymous && !pending.authorize);
        facts.endpoints.push({
          repo: file.repo,
          path: file.path,
          line: lineNo,
          method: pending.http?.method ?? "ANY",
          route: joinRoute(cls.route, sub),
          roles,
          policy,
          anonymous: anonymous || undefined,
          authorized: !anonymous && (cls.p.authorize || pending.authorize)
        });
        if (pending.authorize && (pending.roles.length || pending.policy)) {
          facts.auth.push({
            repo: file.repo,
            path: file.path,
            line: pending.line || lineNo,
            target: `${joinRoute(cls.route, sub)} (${method[1]})`,
            roles: pending.roles,
            policy: pending.policy,
            via: "[Authorize]"
          });
        }
      }
      pending = emptyPending();
      return;
    }
    if (raw.trim() && !/^\s*\[/.test(raw)) pending = emptyPending();
  });
}

function minimalApis(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    const m = raw.match(MAP_RE);
    if (!m || isCommentLine(raw)) return;
    const tail = lines.slice(i, i + 4).join(" ");
    const req = tail.match(/\.RequireAuthorization\s*\(([^)]*)\)/);
    const anonymous = /\.AllowAnonymous\s*\(/.test(tail);
    const policy = req ? stringLiterals(req[1]!)[0] : undefined;
    facts.endpoints.push({
      repo: file.repo,
      path: file.path,
      line: i + 1,
      method: m[1] === "Methods" ? "ANY" : m[1]!.toUpperCase(),
      route: m[2]!,
      roles: [],
      policy,
      anonymous: anonymous || undefined,
      authorized: Boolean(req)
    });
  });
}

function policies(file: SourceFile, text: string, lines: string[], facts: CodeFacts): void {
  const re = /AddPolicy\s*\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = text.indexOf(";", m.index);
    const body = text.slice(m.index, end > 0 ? Math.min(end, m.index + 600) : m.index + 600);
    const roles = (body.match(/RequireRole\s*\(([^)]*)\)/) ?? [])[1];
    const claim = (body.match(/RequireClaim\s*\(\s*"([^"]+)"/) ?? [])[1];
    facts.auth.push({
      repo: file.repo,
      path: file.path,
      line: text.slice(0, m.index).split("\n").length,
      target: `política ${m[1]}`,
      roles: roles ? roleNames(roles) : [],
      policy: m[1],
      claim,
      via: "AddPolicy"
    });
  }
  lines.forEach((raw, i) => {
    const r = raw.match(/\bIsInRole\s*\(\s*("[^"]+"|\w+\.\w+)/);
    if (r && !isCommentLine(raw)) {
      facts.auth.push({ repo: file.repo, path: file.path, line: i + 1, target: "comprobación en código", roles: roleNames(r[1]!), via: "User.IsInRole" });
    }
  });
}

function enumsAndEntities(file: SourceFile, text: string, facts: CodeFacts): void {
  const enumRe = /\benum\s+(\w+)\s*(?::\s*\w+\s*)?\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(text)) !== null) {
    const values = m[2]!
      .split(",")
      .map((v) => v.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\[[^\]]*\]/g, "").split("=")[0]!.trim())
      .filter((v) => /^\w+$/.test(v));
    const info = { repo: file.repo, path: file.path, line: text.slice(0, m.index).split("\n").length, name: m[1]!, values };
    if (ROLE_ENUM_NAME.test(m[1]!)) facts.roleSets.push(info);
    else if (values.length) facts.enums.push(info);
  }

  const dbSetRe = /\bDbSet\s*<\s*(\w+)\s*>\s*(\w+)/g;
  while ((m = dbSetRe.exec(text)) !== null) {
    if (facts.entities.some((e) => e.repo === file.repo && e.name === m![1])) continue;
    facts.entities.push({
      repo: file.repo,
      path: file.path,
      line: text.slice(0, m.index).split("\n").length,
      name: m[1]!,
      source: "ef-dbset",
      table: m[2],
      fields: []
    });
  }

  if (!ENTITY_DIR_RE.test(file.path)) return;
  const classRe = /(?:\[Table\s*\(\s*"([^"]+)"[^\]]*\]\s*)?\bpublic\s+(abstract\s+|sealed\s+|partial\s+)*(?:class|record)\s+(\w+)(?:\s*:\s*([\w<>, .]+))?/g;
  while ((m = classRe.exec(text)) !== null) {
    const name = m[3]!;
    if (/(?:Dto|ViewModel|Request|Response|Command|Query|Handler|Validator|Configuration|Mapping|Profile|Exception)$/.test(name)) continue;
    const after = text.slice(m.index);
    const end = after.search(/\n\}/);
    const body = end > 0 ? after.slice(0, end) : after.slice(0, 4000);
    const fields = [...body.matchAll(/\bpublic\s+(?:virtual\s+|required\s+)*[\w<>[\],.?]+\s+(\w+)\s*\{\s*get/g)].map((f) => f[1]!).slice(0, 15);
    const existing = facts.entities.find((e) => e.repo === file.repo && e.name === name);
    const base = m[4]?.split(",")[0]?.trim();
    if (existing) {
      existing.fields = fields;
      continue;
    }
    facts.entities.push({
      repo: file.repo,
      path: file.path,
      line: text.slice(0, m.index).split("\n").length,
      name,
      source: "clase",
      table: m[1],
      fields,
      abstract: /abstract/.test(m[2] ?? "") || undefined,
      base: base && !/^I[A-Z]/.test(base) ? base : undefined
    });
  }
}

function schema(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    if (/\.EnsureCreated(?:Async)?\s*\(/.test(raw)) {
      facts.schema.push({ repo: file.repo, path: file.path, line: i + 1, mechanism: "EnsureCreated", detail: "el esquema se crea al arrancar con EnsureCreated (no aplica migraciones a una base existente)" });
    } else if (/\.Database\.Migrate(?:Async)?\s*\(/.test(raw)) {
      facts.schema.push({ repo: file.repo, path: file.path, line: i + 1, mechanism: "Migrate", detail: "aplica las migraciones de EF Core al arrancar (Database.Migrate)" });
    }
  });
}

export function extractDotnet(file: SourceFile, facts: CodeFacts): void {
  if (file.isTest) return;
  const lines = file.text.split(/\r?\n/);
  controllers(file, lines, facts);
  minimalApis(file, lines, facts);
  policies(file, file.text, lines, facts);
  enumsAndEntities(file, file.text, facts);
  schema(file, lines, facts);
}
