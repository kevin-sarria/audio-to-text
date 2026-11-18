import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDesktop = path.resolve(__dirname, "..");

// Plugin para resolver imports ESM con extensión .js a archivos .ts de TypeScript
const tsResolvePlugin = {
  name: "ts-resolve-plugin",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.importer && args.path.startsWith(".")) {
        const resolvedTs = path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
        if (fs.existsSync(resolvedTs)) {
          return { path: resolvedTs };
        }
      }
    });
  }
};

const forbiddenModules = ["@prisma/client", "bullmq", "ioredis", "argon2"];

async function build() {
  console.log("[build-main] Compilando proceso principal y preload con esbuild...");

  // 1. Proceso Main (incluye servidor Express y Clean Architecture desktop)
  const mainResult = await esbuild.build({
    entryPoints: [path.join(rootDesktop, "src/main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    outfile: path.join(rootDesktop, "dist/main.cjs"),
    external: ["electron", "pdfkit"],
    metafile: true,
    plugins: [tsResolvePlugin],
    sourcemap: true
  });

  // 2. Proceso Preload
  await esbuild.build({
    entryPoints: [path.join(rootDesktop, "src/preload.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    outfile: path.join(rootDesktop, "dist/preload.cjs"),
    external: ["electron"],
    plugins: [tsResolvePlugin]
  });

  // 3. Auditoría de dependencias prohibidas en el bundle de escritorio
  if (mainResult.metafile) {
    const inputs = Object.keys(mainResult.metafile.inputs);
    const violations = [];

    for (const forbidden of forbiddenModules) {
      const found = inputs.filter((input) => input.includes(forbidden));
      if (found.length > 0) {
        violations.push({ forbidden, files: found });
      }
    }

    if (violations.length > 0) {
      console.error(
        "[build-main] ERROR: Se detectaron dependencias prohibidas en el grafo de imports de escritorio:"
      );
      console.error(JSON.stringify(violations, null, 2));
      process.exit(1);
    }
  }

  console.log("[build-main] Compilación completada con éxito sin dependencias prohibidas.");
}

build().catch((err) => {
  console.error("[build-main] Error fatal en la compilación:", err);
  process.exit(1);
});
