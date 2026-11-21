import { CodeFacts, SourceFile } from "./types.js";
import { isCommentLine, joinRoute, lineAt, roleNames, stringLiterals } from "./sourceText.js";

/**
 * TypeScript / JavaScript: rutas de Express (app/router.get…), controladores de Nest
 * (@Controller + @Get, @Roles, @Public), comprobaciones de rol en middleware, conjuntos
 * de roles (enum, union type, arreglo constante), entidades de TypeORM y Mongoose, y en
 * React las rutas (<Route path>) y los textos visibles de cada pantalla.
 */

const ROLE_TYPE_NAME = /^(?:Rol|Role|Roles|UserRole|UserRoles|Perfil|Perfiles|TipoUsuario|UserType|ROLES|ROLS?)$/;
const EXPRESS_RE = /\b(app|router|\w*[Rr]outer|routes?|api|server)\.(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\3([^\n]*)/;
const ROLE_CHECK_RE =
  /\b(requireRoles?|hasRoles?|hasAnyRole|checkRoles?|authorize|authorizeRoles?|allowRoles?|permitRoles?|roleGuard|withRoles?|onlyRoles?|restrictTo|requirePermission|requireRol(?:es)?)\s*\(([^)]*)\)/;
const NEST_HTTP_RE = /@(Get|Post|Put|Patch|Delete|All)\s*\(\s*(?:(['"`])([^'"`]*)\2)?\s*\)/;
const PAGE_DIR_RE = /(?:^|\/)(?:pages|views|screens|app)\//i;

function roleSets(file: SourceFile, text: string, facts: CodeFacts): void {
  let m: RegExpExecArray | null;
  const enumRe = /\benum\s+(\w+)\s*\{([^}]*)\}/g;
  while ((m = enumRe.exec(text)) !== null) {
    const values = m[2]!
      .split(",")
      .map((v) => v.replace(/\/\/.*$/gm, "").split("=")[0]!.trim())
      .filter((v) => /^\w+$/.test(v));
    const info = { repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[1]!, values };
    if (ROLE_TYPE_NAME.test(m[1]!)) facts.roleSets.push(info);
    else if (values.length) facts.enums.push(info);
  }
  const unionRe = /\btype\s+(\w+)\s*=\s*((?:\s*\|?\s*(['"])[\w-]+\3)+)\s*;?/g;
  while ((m = unionRe.exec(text)) !== null) {
    if (!ROLE_TYPE_NAME.test(m[1]!)) continue;
    facts.roleSets.push({ repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[1]!, values: stringLiterals(m[2]!) });
  }
  const arrRe = /\b(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;
  while ((m = arrRe.exec(text)) !== null) {
    if (!ROLE_TYPE_NAME.test(m[1]!)) continue;
    const values = stringLiterals(m[2]!);
    if (values.length) facts.roleSets.push({ repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[1]!, values });
  }
}

function expressRoutes(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    const m = raw.match(EXPRESS_RE);
    if (!m || !m[4]!.startsWith("/")) return;
    const args = `${m[5] ?? ""} ${lines[i + 1] ?? ""}`;
    const check = args.match(ROLE_CHECK_RE);
    const roles = check ? roleNames(check[2]!) : [];
    const authorized = Boolean(check) || /\b(?:auth\w*|requireAuth\w*|isAuthenticated|verifyToken|jwt\w*|passport\.authenticate|protect)\b/i.test(m[5] ?? "");
    facts.endpoints.push({
      repo: file.repo,
      path: file.path,
      line: i + 1,
      method: m[2]!.toUpperCase(),
      route: m[4]!,
      roles,
      authorized
    });
    if (check) {
      facts.auth.push({ repo: file.repo, path: file.path, line: i + 1, target: `${m[2]!.toUpperCase()} ${m[4]}`, roles, via: `${check[1]}()` });
    }
  });
}

function roleChecks(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    if (isCommentLine(raw) || EXPRESS_RE.test(raw)) return;
    const check = raw.match(ROLE_CHECK_RE);
    if (check) {
      const roles = roleNames(check[2]!);
      if (roles.length) facts.auth.push({ repo: file.repo, path: file.path, line: i + 1, target: "middleware o comprobación en código", roles, via: `${check[1]}()` });
    }
  });
}

function nest(file: SourceFile, lines: string[], facts: CodeFacts): void {
  let base: string | null = null;
  let classRoles: string[] = [];
  let classPublic = false;
  let pending: { roles: string[]; isPublic: boolean; guard: boolean } = { roles: [], isPublic: false, guard: false };

  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    const ctrl = raw.match(/@Controller\s*\(\s*(?:(['"`])([^'"`]*)\1)?/);
    if (ctrl) base = ctrl[2] ?? "";
    const roles = raw.match(/@Roles\s*\(([^)]*)\)/);
    if (roles) pending.roles.push(...roleNames(roles[1]!));
    if (/@Public\s*\(\s*\)|@AllowAnonymous\s*\(/.test(raw)) pending.isPublic = true;
    if (/@UseGuards\s*\(/.test(raw)) pending.guard = true;

    if (/\bclass\s+\w+/.test(raw) && base !== null) {
      classRoles = pending.roles;
      classPublic = pending.isPublic;
      if (classRoles.length) facts.auth.push({ repo: file.repo, path: file.path, line: i + 1, target: base || "/", roles: classRoles, via: "@Roles" });
      pending = { roles: [], isPublic: false, guard: false };
      return;
    }
    const http = raw.match(NEST_HTTP_RE);
    if (http && base !== null) {
      const route = joinRoute(base, http[3] ?? "");
      const allRoles = [...new Set([...classRoles, ...pending.roles])];
      const isPublic = pending.isPublic || classPublic;
      // Los decoradores de método pueden ir antes o después de @Get: se miran las 3 líneas siguientes.
      const after = lines.slice(i + 1, i + 4).join(" ");
      const afterRoles = after.match(/@Roles\s*\(([^)]*)\)/);
      const roles = afterRoles ? [...new Set([...allRoles, ...roleNames(afterRoles[1]!)])] : allRoles;
      facts.endpoints.push({
        repo: file.repo,
        path: file.path,
        line: i + 1,
        method: http[1]!.toUpperCase(),
        route,
        roles,
        anonymous: isPublic || undefined,
        authorized: !isPublic && (roles.length > 0 || pending.guard)
      });
      if (roles.length && roles.length !== classRoles.length) {
        facts.auth.push({ repo: file.repo, path: file.path, line: i + 1, target: `${http[1]!.toUpperCase()} ${route}`, roles, via: "@Roles" });
      }
      pending = { roles: [], isPublic: false, guard: false };
    }
  });
}

function entities(file: SourceFile, text: string, facts: CodeFacts): void {
  let m: RegExpExecArray | null;
  const typeorm = /@Entity\s*\(\s*(?:(['"`])([^'"`]+)\1|\{[^}]*name\s*:\s*(['"`])([^'"`]+)\3[^}]*\})?\s*\)\s*(?:@\w+\([^)]*\)\s*)*export\s+(?:default\s+)?class\s+(\w+)/g;
  while ((m = typeorm.exec(text)) !== null) {
    const body = text.slice(m.index, m.index + 4000);
    const fields = [...body.matchAll(/@(?:\w*Column|PrimaryGeneratedColumn|PrimaryColumn|ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\([^)]*\)\s*(\w+)/g)].map((f) => f[1]!).slice(0, 15);
    facts.entities.push({ repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[5]!, source: "typeorm", table: m[2] ?? m[4], fields });
  }
  const mongoose = /\b(?:mongoose\.)?model\s*(?:<[^>]*>)?\s*\(\s*(['"`])(\w+)\1/g;
  while ((m = mongoose.exec(text)) !== null) {
    if (!/mongoose|Schema\s*\(/.test(text)) break;
    facts.entities.push({ repo: file.repo, path: file.path, line: lineAt(text, m.index), name: m[2]!, source: "mongoose", fields: [] });
  }
}

/** Textos que ve el usuario: contenido de etiquetas JSX y props title/label/placeholder. */
function screenTexts(file: SourceFile, text: string, facts: CodeFacts): void {
  if (!/\.[jt]sx$/.test(file.path) || !PAGE_DIR_RE.test(file.path)) return;
  const texts = new Set<string>();
  // Texto humano: tiene letras y empieza en mayúscula o lleva espacios (no `x.y` ni `=>`).
  const human = (t: string) => /\p{L}{3}/u.test(t) && (/^\p{Lu}/u.test(t) || /\s/.test(t)) && !/[=;()]|=>/.test(t);
  for (const m of text.matchAll(/>\s*([^<>{}\n]{2,120}?)\s*</g)) {
    const t = m[1]!.trim();
    if (human(t)) texts.add(t);
  }
  for (const m of text.matchAll(/\b(?:title|label|placeholder|header|headerName)\s*=\s*["']([^"']{3,80})["']/g)) {
    if (human(m[1]!)) texts.add(m[1]!);
  }
  const list = [...texts].slice(0, 8);
  if (list.length) facts.screens.push({ repo: file.repo, path: file.path, line: 1, texts: list });
}

function reactRoutes(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    const m = raw.match(/<Route\b[^>]*?\bpath\s*=\s*["']([^"']+)["']/);
    if (!m || isCommentLine(raw)) return;
    const screen = (raw.match(/\belement\s*=\s*\{\s*<\s*(\w+)/) ?? raw.match(/\bcomponent\s*=\s*\{\s*(\w+)/) ?? [])[1];
    facts.endpoints.push({
      repo: file.repo,
      path: file.path,
      line: i + 1,
      method: "PANTALLA",
      route: `${m[1]}${screen ? ` → ${screen}` : ""}`,
      roles: [],
      authorized: false
    });
  });
}

export function extractJs(file: SourceFile, facts: CodeFacts): void {
  if (file.isTest) return;
  const lines = file.text.split(/\r?\n/);
  roleSets(file, file.text, facts);
  expressRoutes(file, lines, facts);
  roleChecks(file, lines, facts);
  nest(file, lines, facts);
  entities(file, file.text, facts);
  screenTexts(file, file.text, facts);
  reactRoutes(file, lines, facts);
}
