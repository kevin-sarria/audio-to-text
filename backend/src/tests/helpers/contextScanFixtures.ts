import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function copyFixture(name: string): string {
  const fixturesDir = path.resolve(
    process.cwd(),
    "src/tests/fixtures/context-scan",
    name
  );
  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`El fixture no existe: ${fixturesDir}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `context-scan-${name}-`));

  // Leer dates.json si existe
  const datesFile = path.join(fixturesDir, "dates.json");
  let datesMap: Record<string, string> = {};
  if (fs.existsSync(datesFile)) {
    try {
      datesMap = JSON.parse(fs.readFileSync(datesFile, "utf-8"));
    } catch {}
  }

  // Copiar recursivamente renombrando dot-git, dot-env, dot-gitignore
  const copyDir = (src: string, dest: string, relBase = "") => {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === "dates.json" && src === fixturesDir) {
        continue;
      }
      if (entry.name === "expected.json" && src === fixturesDir) {
        continue;
      }

      let destName = entry.name;
      if (destName === "dot-git") {
        destName = ".git";
      } else if (destName === "dot-env") {
        destName = ".env";
      } else if (destName.startsWith("dot-env.")) {
        destName = destName.replace(/^dot-env\./, ".env.");
      } else if (destName === "dot-gitignore") {
        destName = ".gitignore";
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, destName);
      const entryRel = relBase ? `${relBase}/${destName}` : destName;

      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, entryRel);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);

        // Aplicar fecha de dates.json si coincide
        const dateStr = datesMap[entryRel] || datesMap[entryRel.replace(/\//g, "\\")];
        if (dateStr) {
          const d = new Date(dateStr);
          fs.utimesSync(destPath, d, d);
        }
      }
    }
  };

  copyDir(fixturesDir, tmpDir, "");

  return tmpDir;
}
