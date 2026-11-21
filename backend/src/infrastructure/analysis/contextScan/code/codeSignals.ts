import { CodeFacts, CodeTrap, SourceFile } from "./types.js";
import { codeSnippet, commentAbove, commentText, isCommentLine, trailingComment } from "./sourceText.js";

/**
 * Señales que no dependen del framework: ajustes de seguridad conocidos, ramas por
 * entorno, comentarios que explican una decisión, claves de configuración (solo el
 * nombre) y cómo se deciden los permisos. Todo con archivo y línea.
 */

/** Ajustes de frameworks que cambian lo que le pasa a un usuario (bloqueos, expiración, límites). */
const SECURITY_SETTING_RE = new RegExp(
  [
    String.raw`\bMaxFailedAccessAttempts\s*=`,
    String.raw`\bDefaultLockoutTimeSpan\s*=`,
    String.raw`\bLockout\.AllowedForNewUsers\s*=`,
    String.raw`\bPassword\.Require\w*\s*=`,
    String.raw`\bExpireTimeSpan\s*=`,
    String.raw`\bSlidingExpiration\s*=`,
    String.raw`\b(?:AccessTokenLifetime|RefreshTokenLifetime|TokenLifetime|ExpiresIn|expiresIn|expires_in)\s*[:=]`,
    String.raw`\bPermitLimit\s*=`,
    String.raw`\bAddRateLimiter\b`,
    String.raw`\b(?:rateLimit|RateLimit)\s*\(`,
    String.raw`\b(?:windowMs|maxRequests)\s*:`,
    String.raw`\bWithOrigins\s*\(`,
    String.raw`\b(?:MultipartBodyLengthLimit|MaxRequestBodySize|MaxRequestLength)\s*=`,
    String.raw`\bfileSize\s*:\s*\d`,
    String.raw`\b\w*(?:[Aa]ttempts?|[Ii]ntentos?|ATTEMPTS?|INTENTOS?)\w*\s*[:=]\s*\d+`
  ].join("|")
);

const ENV_BRANCH_RE =
  /\.Is(?:Development|Production|Staging)\s*\(\s*\)|\.IsEnvironment\s*\(|process\.env\.NODE_ENV|import\.meta\.env\.(?:DEV|PROD|MODE)\b|__DEV__/;
/** Ramas por entorno que son plantilla del framework, no una decisión del proyecto. */
const ENV_NOISE_RE =
  /swagger|developerexceptionpage|usehsts|useexceptionhandler|migrationsendpoint|devtools|console\.|logger|\.log\(|strictmode|sourcemap|\bhmr\b|hot\s*reload|useBrowserLink|mode\s*:\s*['"]development/i;

/** Comentario que explica una decisión o advierte algo (no un TODO ni código comentado). */
const DECISION_UPPER_RE = /\b(?:NO|NUNCA|SIEMPRE|SOLO|NOT|NEVER|ALWAYS|ONLY|IMPORTANT|IMPORTANTE|OJO|CUIDADO|WARNING|ATENCI[OÓ]N)\b/;
const DECISION_RE =
  /⚠|\bno usa\b|\bno se usa\b|\ben vez de\b|\ben lugar de\b|\binstead of\b|\ba diferencia de\b|\bunlike\b|\bhack\b|\bworkaround\b|\bpor compatibilidad\b|\blegacy\b|\bnunca\b|\bcuidado\b|\bojo\b|\bdo not\b|\bdon'?t\b|\bnever\b/i;
const NOT_DECISION_RE = /\b(?:TODO|FIXME|XXX)\b|eslint|prettier|@ts-|copyright|license|licencia|istanbul|c8 ignore|nolint|resharper|pragma/i;

const MAX_DECISIONS_PER_REPO = 8;

function looksLikeCode(text: string): boolean {
  return /[;{}]\s*$|=>|^\s*(?:return|if|var|let|const|public|private|import|using)\b|\w+\([^)]*\)\s*;?$/.test(text);
}

function pushTrap(facts: CodeFacts, trap: CodeTrap): void {
  const dupe = facts.traps.some((t) => t.path === trap.path && Math.abs(t.line - trap.line) <= 3);
  if (!dupe) facts.traps.push(trap);
}

function securitySettings(file: SourceFile, lines: string[], facts: CodeFacts): void {
  let group: { start: number; snippets: string[]; comment: string } | null = null;
  const flush = () => {
    if (!group) return;
    const code = group.snippets.map((s) => `\`${s}\``).join(" · ");
    pushTrap(facts, {
      repo: file.repo,
      path: file.path,
      line: group.start + 1,
      kind: "seguridad",
      text: group.comment ? `${group.comment} — código: ${code}` : `código: ${code}`
    });
    group = null;
  };
  lines.forEach((raw, i) => {
    if (isCommentLine(raw) || !SECURITY_SETTING_RE.test(raw)) return;
    if (group && i - group.start > 3) flush();
    const comment = trailingComment(raw) || commentAbove(lines, i);
    if (!group) group = { start: i, snippets: [], comment };
    else if (!group.comment) group.comment = comment;
    group.snippets.push(codeSnippet(raw.replace(/\s*\/\/.*$/, "")));
  });
  flush();
}

function environmentBranches(file: SourceFile, lines: string[], facts: CodeFacts): void {
  if (/(?:^|\/)[^/]*config\.[cm]?[jt]s$/i.test(file.path)) return;
  lines.forEach((raw, i) => {
    if (isCommentLine(raw) || !ENV_BRANCH_RE.test(raw)) return;
    const windowText = lines.slice(i, i + 4).join("\n");
    if (ENV_NOISE_RE.test(windowText)) return;
    const comment = trailingComment(raw) || commentAbove(lines, i);
    const body = /^\s*(?:if|else)\b.*\)\s*\{?\s*$/.test(raw) ? codeSnippet(`${raw.trim()} ${lines[i + 1]?.trim() ?? ""}`) : codeSnippet(raw);
    pushTrap(facts, {
      repo: file.repo,
      path: file.path,
      line: i + 1,
      kind: "entorno",
      text: `${comment ? `${comment} — ` : "Cambia según el entorno — "}código: \`${body}\``
    });
  });
}

function decisionComments(file: SourceFile, lines: string[], facts: CodeFacts): void {
  let count = facts.traps.filter((t) => t.repo === file.repo && t.kind === "decision").length;
  // Bloques de comentario consecutivo, leídos como una sola frase. Un TODO o una línea de
  // código comentado corta el bloque y no entra.
  let block: { start: number; parts: string[] } | null = null;
  const flush = () => {
    if (!block || count >= MAX_DECISIONS_PER_REPO) return void (block = null);
    const text = block.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text.length >= 20 && text.length <= 400 && (DECISION_UPPER_RE.test(text) || DECISION_RE.test(text))) {
      pushTrap(facts, { repo: file.repo, path: file.path, line: block.start + 1, kind: "decision", text: codeSnippet(text, 240) });
      count++;
    }
    block = null;
  };
  lines.forEach((raw, i) => {
    if (!isCommentLine(raw)) return flush();
    const t = commentText(raw);
    if (!t) return;
    if (NOT_DECISION_RE.test(t) || looksLikeCode(t)) return flush();
    if (!block) block = { start: i, parts: [] };
    block.parts.push(t);
  });
  flush();
}

const CONFIG_KEY_RES: RegExp[] = [
  /\bConfiguration\s*\[\s*"([^"]+)"\s*\]/g,
  /\bGetSection\s*\(\s*"([^"]+)"/g,
  /\bGetValue\s*<[^>]+>\s*\(\s*"([^"]+)"/g,
  /\bGetConnectionString\s*\(\s*"([^"]+)"/g,
  /\bGetEnvironmentVariable\s*\(\s*"([^"]+)"/g,
  /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /\bprocess\.env\[\s*['"]([^'"]+)['"]/g,
  /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /\bos\.environ(?:\.get)?\s*[[(]\s*['"]([^'"]+)['"]/g
];
const IGNORED_CONFIG_KEYS = new Set(["NODE_ENV", "DEV", "PROD", "MODE", "SSR", "BASE_URL", "ASPNETCORE_ENVIRONMENT"]);

function configKeys(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    for (const re of CONFIG_KEY_RES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        const key = m[1]!;
        if (IGNORED_CONFIG_KEYS.has(key)) continue;
        if (facts.configKeys.some((k) => k.repo === file.repo && k.key === key)) continue;
        facts.configKeys.push({ repo: file.repo, path: file.path, line: i + 1, key });
      }
    }
  });
}

const CLAIM_ACCESS_RE =
  /\b(?:claims?|decoded|payload|jwtPayload|tokenPayload|tokenClaims)\??\.(\w+)|\bHasClaim\s*\(\s*"([^"]+)"|\bRequireClaim\s*\(\s*"([^"]+)"|\bFindFirst(?:Value)?\s*\(\s*"([^"]+)"/;
const ROLE_CLAIMS = /^(?:role|roles|rol|sub|name|email|exp|iat|iss|aud|nbf|jti)$/i;
const ROLE_MAP_RE =
  /\b(?:const|let|var|readonly|static)\s+(?:readonly\s+)?(?:[\w<>,[\]\s]+\s+)?(\w*?(?:PERMIS|PERMISSION|ACCES|CAPAB|CAPACIDAD)\w*?_?(?:POR|BY|PER|FOR)_?ROL\w*|\w*?ROLES?_?(?:PERMISSIONS?|ACCESS|CAPABILITIES)\w*|\w*?ROL_?(?:PERMISOS?|ACCESOS?)\w*)\b/i;

function permissionModels(file: SourceFile, lines: string[], facts: CodeFacts): void {
  const has = (model: string) => facts.permissionModels.some((p) => p.repo === file.repo && p.model === model);
  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    const claim = raw.match(CLAIM_ACCESS_RE);
    const claimName = claim ? claim[1] ?? claim[2] ?? claim[3] ?? claim[4] ?? "" : "";
    if (claimName && !ROLE_CLAIMS.test(claimName) && !has("por-claims")) {
      facts.permissionModels.push({
        repo: file.repo,
        path: file.path,
        line: i + 1,
        model: "por-claims",
        detail: `por claims del token (\`${claimName}\`)`
      });
    }
    const map = raw.match(ROLE_MAP_RE);
    if (map && !has("por-rol")) {
      facts.permissionModels.push({
        repo: file.repo,
        path: file.path,
        line: i + 1,
        model: "por-rol",
        detail: `por rol, con una lista fija (\`${map[1]}\`)`
      });
    }
  });
}

const GLOBAL_AUTH_RE =
  /MapControllers\s*\(\s*\)\s*\.RequireAuthorization|FallbackPolicy\s*=|new\s+AuthorizeFilter\s*\(|provide\s*:\s*APP_GUARD|app\.use\(\s*(?:\w*[Aa]uth\w*|passport\.authenticate|requireAuth\w*|jwt\w*)\b/;

function globalAuth(file: SourceFile, lines: string[], facts: CodeFacts): void {
  lines.forEach((raw, i) => {
    if (!isCommentLine(raw) && GLOBAL_AUTH_RE.test(raw) && !facts.globalAuth.some((g) => g.repo === file.repo)) {
      facts.globalAuth.push({ repo: file.repo, path: file.path, line: i + 1 });
    }
  });
}

/** Señales comunes a cualquier archivo de código (no a pruebas ni a textos de pantalla). */
export function extractCodeSignals(file: SourceFile, facts: CodeFacts): void {
  if (file.isTest) return;
  const lines = file.text.split(/\r?\n/);
  securitySettings(file, lines, facts);
  environmentBranches(file, lines, facts);
  decisionComments(file, lines, facts);
  configKeys(file, lines, facts);
  permissionModels(file, lines, facts);
  globalAuth(file, lines, facts);
}
