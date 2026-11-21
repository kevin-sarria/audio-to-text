/**
 * Heurística general para distinguir un DATO de un TEMA.
 *
 * Un dato responde la pregunta: trae al menos un elemento comprobable
 * (identificador de código, ruta, número, nombre propio, comando, URL o texto
 * citado). Un tema solo la nombra («Aprobador de pull requests», «Estrategia de
 * migraciones») y no le sirve a quien redacta issues.
 *
 * Es una función pura, sin conocimiento de ningún proyecto concreto.
 */

export type ConcreteSignal =
  | "cita"
  | "url"
  | "comando"
  | "ruta"
  | "numero"
  | "identificador"
  | "nombre_propio";

// Siglas genéricas que no identifican nada por sí solas.
const GENERIC_ACRONYMS = new Set([
  "PR", "PRS", "API", "APIS", "UI", "UX", "BD", "DB", "CI", "CD", "SQL", "URL", "JSON",
  "HTTP", "HTTPS", "IA", "AI", "QA", "ID", "IDS", "CRUD", "REST", "MD", "OK", "TI", "SO",
  "UTF", "CSV", "PDF", "MVP", "KPI"
]);

// Carpetas comunes: una ruta de 2 segmentos sin extensión cuenta si empieza por una de estas.
const COMMON_DIRS = new Set([
  "src", "app", "apps", "lib", "libs", "docs", "doc", "test", "tests", "spec", "scripts",
  "db", "database", "config", "configs", "api", "server", "client", "packages", "public",
  "assets", "migrations", "prisma", "infra", "deploy", "tools", "components", "pages",
  "controllers", "services", "models", "entities", "domain", "core", "shared", "modules"
]);

const BRANCH_NAMES = new Set([
  "main", "master", "develop", "development", "dev", "staging", "stage", "qa", "test",
  "prod", "production", "release", "trunk"
]);
const BRANCH_PREFIX = /^(feature|feat|hotfix|release|bugfix|fix|chore)\/[\w.-]+$/i;

const FILE_EXT =
  /\.(md|mdx|json|jsonc|ts|tsx|js|jsx|mjs|cjs|cs|csproj|sln|sql|ya?ml|py|go|rs|java|kt|xml|toml|txt|env|example|config|conf|prisma|resx|ps1|sh|bat|lock|gradle|php|rb|vue|svelte|html|css|scss|ini)$/i;

const COMMAND_RE =
  /\b(?:npm|pnpm|yarn|npx|dotnet|make|mvn|gradle|\.\/gradlew|composer|pip|python|node|git|docker|docker-compose|kubectl|expo|eas|pm2|cargo|go)\s+[\w:@./=-]+/i;

/** Quita la cola que agrega el render: «(fuente: …)», «_(sin confirmar)_» y similares. */
export function stripRenderNoise(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s*_\((?:sin confirmar|deducido[^)]*)\)_\s*$/i, "")
    .replace(/\s*\((?:fuente|fuentes)\s*:[^)]*\)\s*$/i, "")
    .trim();
}

function isPathToken(raw: string): boolean {
  const t = raw.replace(/^[(\[`'"«“]+|[)\],.;:`'"»”]+$/g, "");
  if (!t) return false;
  if (BRANCH_PREFIX.test(t)) return true;
  // Nombre de archivo suelto: CLAUDE.md, appsettings.json, 001_init.sql
  if (!t.includes("/") && !t.includes("\\")) {
    return /^[\w.@-]+$/.test(t) && FILE_EXT.test(t) && !/^\d+(\.\d+)+$/.test(t);
  }
  const segments = t.split(/[\\/]/);
  const nonEmpty = segments.filter(Boolean);
  if (nonEmpty.length === 0) return false;
  if (!nonEmpty.every((s) => /^[\w.@*-]+$/.test(s))) return false;
  if (t.endsWith("/") || t.endsWith("\\")) return true;
  if (nonEmpty.some((s) => FILE_EXT.test(s))) return true;
  if (nonEmpty.length >= 3) return true;
  // «CI/CD», «React/Vite», «lectura/escritura» no son rutas.
  return COMMON_DIRS.has(nonEmpty[0]!.toLowerCase());
}

function isSentenceStart(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  if (i < 0) return true;
  return /[.:;!?¿¡(\-—"«“\[|]/.test(text[i]!);
}

export interface ConcretenessOptions {
  /**
   * Nombres que solo dicen el ALCANCE de la línea, no la respuesta: los repos y
   * carpetas del propio proyecto. «Comando de pruebas en campo-api» sigue siendo
   * un tema aunque nombre el repo.
   */
  scopeNames?: string[];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quita el alcance: nombres del proyecto y referencias entre paréntesis como «(RN-02)». */
function removeScope(text: string, scopeNames: string[]): string {
  let out = text.replace(/\(\s*(?:[A-Z]{1,5}-\d+[A-Za-z]?\s*[,;y]?\s*)+\)/g, " ");
  const names = [...new Set(scopeNames.map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length
  );
  for (const name of names) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRe(name)}(?![\\p{L}\\p{N}_-])`, "giu"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

export function concreteSignals(rawText: string, options: ConcretenessOptions = {}): ConcreteSignal[] {
  const signals = new Set<ConcreteSignal>();
  const text = removeScope(stripRenderNoise(rawText), options.scopeNames ?? []);
  if (!text) return [];

  if (/`[^`]+`/.test(text) || /"[^"]{2,}"/.test(text) || /«[^»]{2,}»/.test(text) || /“[^”]{2,}”/.test(text)) {
    signals.add("cita");
  }
  if (/https?:\/\/\S+/i.test(text)) signals.add("url");
  if (COMMAND_RE.test(text)) signals.add("comando");

  const plain = text.replace(/https?:\/\/\S+/gi, " ");
  const tokens = plain.split(/\s+/).filter(Boolean);
  if (tokens.some(isPathToken)) signals.add("ruta");

  if (/\d/.test(plain)) signals.add("numero");

  const identifierPatterns = [
    /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/, // PascalCase: CostCenter, EnsureCreated
    /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/, // camelCase: useAuth, maxFailedAttempts
    /\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/, // snake_case / SCREAMING_CASE
    /(?<![\p{L}\p{N}-])[a-z][a-z0-9]*(?:-[a-z0-9]+)+(?![\p{L}\p{N}-])/u, // kebab-case: campo-api, frontend-app
    /\b\w+\.\w+\(/, // llamada a miembro: db.Database.EnsureCreated(
    /\[[A-Z]\w+(?:\([^)]*\))?\]/, // atributo: [Authorize(Roles = "...")]
    /(?:^|\s)@[A-Za-z]\w+/, // decorador o usuario: @Get, @laura
    /\b\w+<\w+>/ // genérico: DbSet<Usuario>
  ];
  if (identifierPatterns.some((re) => re.test(plain))) signals.add("identificador");

  for (const tok of tokens) {
    // «CI/CD» son dos siglas genéricas, no una sigla «CICD».
    for (const part of tok.split(/[\/\\]/)) {
      const clean = part.replace(/[^\p{L}\p{N}]/gu, "");
      if (/^[A-Z][A-Z0-9]{1,}$/.test(clean) && !GENERIC_ACRONYMS.has(clean)) {
        signals.add("identificador");
      }
    }
    if (BRANCH_NAMES.has(tok.replace(/[^\w/-]/g, "").toLowerCase()) && /`|\bram(a|as)\b/i.test(text)) {
      signals.add("identificador");
    }
  }

  const properRe = /(\p{Lu}[\p{Ll}]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = properRe.exec(plain)) !== null) {
    const before = m.index > 0 ? plain[m.index - 1]! : "";
    if (before && /[\p{L}\p{N}]/u.test(before)) continue; // está dentro de otra palabra
    if (isSentenceStart(plain, m.index)) continue;
    signals.add("nombre_propio");
    break;
  }

  return [...signals];
}

export function isConcrete(text: string, options: ConcretenessOptions = {}): boolean {
  return concreteSignals(text, options).length > 0;
}
