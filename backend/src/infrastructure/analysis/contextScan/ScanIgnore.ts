import fs from "node:fs";
import path from "node:path";

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "release",
  "bin",
  "obj",
  "out",
  "vendor",
  "target",
  "coverage",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  ".idea",
  ".vscode",
  ".venv",
  "venv",
  "tmp",
  "temp"
]);

const SECRET_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".pfx",
  ".p12",
  ".crt",
  ".cer",
  ".jks",
  ".keystore",
  ".ppk"
]);

const BINARY_EXTENSIONS = new Set([
  // Imágenes
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff", ".psd",
  // Audio
  ".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".wma",
  // Video
  ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm",
  // Comprimidos
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  // Binarios / Ejecutables
  ".exe", ".dll", ".so", ".dylib", ".bin",
  // Wasm
  ".wasm",
  // Bases de datos
  ".db", ".sqlite", ".sqlite3",
  // Documentos binarios
  ".pdf",
  // Fuentes
  ".ttf", ".otf", ".woff", ".woff2", ".eot"
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".cs", ".java", ".kt", ".py", ".go", ".rs", ".rb", ".php", ".swift", ".scala", ".vue", ".svelte"
]);

export function isSecretFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const fileName = path.posix.basename(normalized);
  const lowerName = fileName.toLowerCase();

  // .env y .env.* excepto .env.example, .env.sample, .env.template
  if (lowerName === ".env" || lowerName.startsWith(".env.")) {
    if (
      lowerName === ".env.example" ||
      lowerName === ".env.sample" ||
      lowerName === ".env.template"
    ) {
      return false;
    }
    return true;
  }

  // Extensiones secretas
  const ext = path.posix.extname(normalized).toLowerCase();
  if (SECRET_EXTENSIONS.has(ext)) {
    return true;
  }

  // id_rsa*, id_ed25519*
  if (lowerName.startsWith("id_rsa") || lowerName.startsWith("id_ed25519")) {
    return true;
  }

  // credentials.json, secrets.json, .npmrc, .pypirc
  if (
    lowerName === "credentials.json" ||
    lowerName === "secrets.json" ||
    lowerName === ".npmrc" ||
    lowerName === ".pypirc"
  ) {
    return true;
  }

  // *.tfvars
  if (lowerName.endsWith(".tfvars")) {
    return true;
  }

  // appsettings.json y appsettings.*.json excepto appsettings.Template.json / *.example.json / *.template.json
  if (lowerName === "appsettings.json" || lowerName.startsWith("appsettings.")) {
    if (lowerName.endsWith(".json")) {
      if (
        lowerName === "appsettings.template.json" ||
        lowerName.endsWith(".example.json") ||
        lowerName.endsWith(".template.json")
      ) {
        return false;
      }
      return true;
    }
  }

  // *secret* salvo que contenga template o example
  // Solo archivos de datos o configuración: el código fuente (SecretVault.ts, secret_manager.py…)
  // no guarda secretos por llamarse así y debe aparecer en el árbol.
  if (lowerName.includes("secret") && !CODE_EXTENSIONS.has(ext)) {
    if (lowerName.includes("template") || lowerName.includes("example")) {
      return false;
    }
    return true;
  }

  return false;
}

export function isBinaryFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const ext = path.posix.extname(normalized).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

interface GitignoreRule {
  regex: RegExp;
  dirOnly: boolean;
}

export class GitignoreMatcher {
  private rules: GitignoreRule[] = [];

  constructor(rules: GitignoreRule[]) {
    this.rules = rules;
  }

  public static load(dir: string): GitignoreMatcher | null {
    const gitignorePath = path.join(dir, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      return GitignoreMatcher.parse(content);
    } catch {
      return null;
    }
  }

  public static parse(content: string): GitignoreMatcher {
    const rules: GitignoreRule[] = [];
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      // !negación: se ignora la regla
      if (line.startsWith("!")) {
        continue;
      }

      let dirOnly = false;
      if (line.endsWith("/")) {
        dirOnly = true;
        line = line.slice(0, -1);
      }

      let anchored = false;
      if (line.startsWith("/")) {
        anchored = true;
        line = line.slice(1);
      } else if (line.includes("/")) {
        // Si contiene slash intermedio, gitignore lo trata como anclado al directorio
        anchored = true;
      }

      const regexStr = GitignoreMatcher.globToRegex(line, anchored);
      rules.push({
        regex: new RegExp(regexStr),
        dirOnly
      });
    }

    return new GitignoreMatcher(rules);
  }

  private static globToRegex(glob: string, anchored: boolean): string {
    let re = "";
    let i = 0;
    while (i < glob.length) {
      const c = glob[i];
      if (c === "*") {
        if (glob[i + 1] === "*") {
          // **
          if (glob[i + 2] === "/") {
            re += "(?:.*\\/)?";
            i += 3;
          } else {
            re += ".*";
            i += 2;
          }
        } else {
          re += "[^/]*";
          i += 1;
        }
      } else if (c === "?") {
        re += "[^/]";
        i += 1;
      } else if (c === "." || c === "+" || c === "^" || c === "$" || c === "{" || c === "}" || c === "(" || c === ")" || c === "[" || c === "]" || c === "|" || c === "\\") {
        re += `\\${c}`;
        i += 1;
      } else {
        re += c;
        i += 1;
      }
    }

    if (anchored) {
      return `^${re}(?:$|\\/)`;
    } else {
      return `(?:^|\\/)${re}(?:$|\\/)`;
    }
  }

  public ignores(relPathFromThatDir: string, isDir: boolean): boolean {
    const normalized = relPathFromThatDir.replace(/\\/g, "/").replace(/^\/+/, "");
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) {
        continue;
      }
      if (rule.regex.test(normalized)) {
        return true;
      }
    }
    return false;
  }
}
