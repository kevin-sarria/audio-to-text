import fs from "node:fs";
import path from "node:path";

export class RepoContextScanner {
  public static scanRepositoryStructure(repoPath: string): string {
    const ignoredDirs = new Set([
      "node_modules", ".git", "dist", "build", "release", "bin", "obj",
      ".idea", ".vscode", "vendor", "target", "__pycache__", "coverage",
      ".next", ".nuxt", "out", ".turbo", "temp", "tmp"
    ]);

    const ignoredFilePatterns = [
      /\.env(\..+)?$/i,
      /\.(key|pem|pfx|p12|bin|exe|dll|so|wasm|iso|db|sqlite|sqlite3|wav|mp3|m4a|png|jpg|jpeg|gif|ico|svg|zip|tar|gz)$/i,
      /secret/i,
      /password/i
    ];

    const treeLines: string[] = [];
    const keyFileContents: { path: string; content: string }[] = [];
    let totalCharsCollected = 0;
    const MAX_TOTAL_CHARS = 35000;
    const MAX_FILE_CHARS = 5000;

    const keyFileNames = new Set([
      "readme.md", "readme", "readme.txt",
      "package.json", "tsconfig.json", "tsconfig.base.json",
      "docker-compose.yml", "docker-compose.yaml", "dockerfile",
      "pom.xml", "build.gradle", "settings.gradle",
      "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod",
      "architecture.md", "contributing.md", "claude.md", "agents.md",
      ".cursorrules", ".windsurfrules"
    ]);

    const walk = (currentDir: string, currentDepth: number) => {
      if (currentDepth > 4) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name.toLowerCase())) continue;
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoPath, fullPath);
          if (treeLines.length < 80) {
            treeLines.push(`[DIR]  ${relPath}`);
          }
          walk(fullPath, currentDepth + 1);
        } else if (entry.isFile()) {
          const lowerName = entry.name.toLowerCase();
          if (ignoredFilePatterns.some((pattern) => pattern.test(lowerName))) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoPath, fullPath);
          if (treeLines.length < 80) {
            treeLines.push(`[FILE] ${relPath}`);
          }

          const isKeyManifest = keyFileNames.has(lowerName) || lowerName.endsWith(".csproj") || lowerName.endsWith(".sln");
          const isDocFile = (relPath.toLowerCase().startsWith("docs" + path.sep) || relPath.toLowerCase().startsWith("doc" + path.sep)) && lowerName.endsWith(".md");

          if ((isKeyManifest || isDocFile) && totalCharsCollected < MAX_TOTAL_CHARS) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const truncated = content.slice(0, MAX_FILE_CHARS);
              keyFileContents.push({ path: relPath, content: truncated });
              totalCharsCollected += truncated.length;
            } catch {}
          }
        }
      }
    };

    walk(repoPath, 0);

    let output = "=== ÁRBOL DE DIRECTORIOS Y ARCHIVOS ===\n" + treeLines.join("\n") + "\n\n";
    output += "=== CONTENIDO DE ARCHIVOS CLAVE DE CONFIGURACIÓN Y DOCUMENTACIÓN ===\n";
    for (const file of keyFileContents) {
      output += `--- ARCHIVO: ${file.path} ---\n${file.content}\n\n`;
    }

    return output;
  }
}
