import path from "node:path";

/**
 * Qué archivos de código lee el escáner (Fase 5) y en qué orden. Solo se listan aquí;
 * el contenido lo leen los extractores de `code/`, que nunca envían código crudo.
 */

const CODE_EXTENSIONS = new Set([".cs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".prisma", ".resx"]);
const I18N_DIR_RE = /(?:^|\/)(?:locales?|i18n|lang|langs|translations?|messages)\//i;
const GENERATED_RE =
  /(?:\.d\.ts|\.min\.js|\.designer\.cs|\.g\.cs|\.g\.i\.cs|assemblyinfo\.cs|modelsnapshot\.cs|\.bundle\.js|\.chunk\.js)$/i;
const GENERATED_DIR_RE = /(?:^|\/)(?:dist|build|out|bin|obj|coverage|wwwroot\/lib|public\/build|\.next|\.nuxt|generated)\//i;

export const MAX_CODE_FILE_BYTES = 512 * 1024;
export const MAX_CODE_FILES = 5000;

/** ¿Es un archivo de código o de textos de pantalla que conviene leer? */
export function isCodeScanFile(relPath: string, sizeBytes: number): boolean {
  const norm = relPath.replace(/\\/g, "/");
  if (sizeBytes > MAX_CODE_FILE_BYTES || sizeBytes === 0) return false;
  if (GENERATED_RE.test(norm) || GENERATED_DIR_RE.test(norm)) return false;
  const ext = path.posix.extname(norm).toLowerCase();
  if (ext === ".json") return I18N_DIR_RE.test(norm);
  // Las migraciones de EF son código generado: el mecanismo se deduce de la carpeta.
  if (ext === ".cs" && /(?:^|\/)migrations\//i.test(norm)) return false;
  return CODE_EXTENSIONS.has(ext);
}

export function isTestFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/").toLowerCase();
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(norm) ||
    /(?:^|\/)__tests__\//.test(norm) ||
    /(?:^|\/)(?:e2e|cypress|playwright)\//.test(norm) ||
    /(?:^|\/)[^/]*\.tests?\//.test(norm) ||
    /(?:^|\/)tests?\/.*\.cs$/.test(norm) ||
    /tests?\.cs$/.test(norm)
  );
}

/**
 * Menor número = se lee antes. Primero lo que define acceso, arranque y datos; al final
 * las pruebas (solo se cuentan) y el resto de la interfaz.
 */
const ACCESS_TOKEN_RE =
  /^(?:auth\w*|authori[sz]\w*|perm\w*|roles?|rol|roles|acl|polic\w*|guards?|claims?|capab\w*|capacidad\w*|access|acceso\w*|sessions?|sesion\w*|login|identity)$/;

/** Palabras de la ruta, separando camelCase: «PermisosPanel.ts» → permisos, panel, ts. */
function pathTokens(relPath: string): string[] {
  return relPath
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function codeFilePriority(relPath: string): number {
  const lower = relPath.replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(lower);
  if (isTestFile(lower)) return 9;
  if (pathTokens(relPath).some((t) => ACCESS_TOKEN_RE.test(t))) return 1;
  if (/^(?:program|startup|main|app|server|index)\.(?:cs|[cm]?[jt]sx?)$/.test(base) || base.endsWith(".module.ts")) return 2;
  if (/(?:controller|\/routes?\/|\.routes?\.|router|endpoint|\/api\/)/.test(lower)) return 3;
  if (/(?:dbcontext|\/entities\/|\/entity\/|\/models?\/|\/domain\/|\.entity\.ts$|\.prisma$|\/enums?\/)/.test(lower)) return 3;
  if (/(?:\/services?\/|storage|upload|config|settings)/.test(lower)) return 4;
  if (I18N_DIR_RE.test(lower) || lower.endsWith(".resx")) return 4;
  if (/(?:\/pages\/|\/views\/|\/screens\/)/.test(lower)) return 5;
  return 6;
}
