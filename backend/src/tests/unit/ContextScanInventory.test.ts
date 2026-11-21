import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { buildInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import { GitignoreMatcher } from "../../infrastructure/analysis/contextScan/ScanIgnore.js";

describe("ContextScan - Inventario Determinístico", () => {
  let tmpDirs: string[] = [];

  const getCleanFixture = (name: string): string => {
    const dir = copyFixture(name);
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {}
    }
    tmpDirs = [];
  });

  it("analiza correctamente el fixture tres-repos (multi-repo)", () => {
    const root = getCleanFixture("tres-repos");

    // Crear una carpeta node_modules ficticia en el tmp antes de escanear
    const nmDir = path.join(root, "frontend-app", "node_modules", "some-pkg");
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, "index.js"), "module.exports = {};");

    const inv = buildInventory(root, { useGit: false });

    // 3 repos y layout multi-repo
    expect(inv.layout).toBe("multi-repo");
    expect(inv.repositories).toHaveLength(3);

    const feRepo = inv.repositories.find((r) => r.path === "frontend-app");
    const beRepo = inv.repositories.find((r) => r.path === "backend-api");
    const mobRepo = inv.repositories.find((r) => r.path === "mobile-app");

    expect(feRepo).toBeDefined();
    expect(feRepo?.headCommit).toBe("1111111111111111111111111111111111111111");
    expect(beRepo?.headCommit).toBe("2222222222222222222222222222222222222222");
    expect(mobRepo?.headCommit).toBe("3333333333333333333333333333333333333333");

    // frontend-app: sin npm test, con npm run build
    const feCommands = inv.commands.filter((c) => c.repo === "frontend-app");
    const hasFeTest = feCommands.some((c) => c.runAs === "npm test");
    const hasFeBuild = feCommands.some((c) => c.runAs === "npm run build");
    expect(hasFeTest).toBe(false);
    expect(hasFeBuild).toBe(true);

    // backend-api: con dotnet test y net8.0
    const beCommands = inv.commands.filter((c) => c.repo === "backend-api");
    const hasBeTest = beCommands.some((c) => c.runAs === "dotnet test");
    expect(hasBeTest).toBe(true);

    const beManifest = inv.manifests.find((m) => m.path === "backend-api/Api.csproj");
    expect(beManifest).toBeDefined();
    expect(beManifest?.frameworks).toContain("net8.0");

    // Despliegue: workflow y nginx con listen 80
    const nginxDeploy = inv.deployment.find((d) => d.kind === "nginx");
    expect(nginxDeploy).toBeDefined();
    expect(nginxDeploy?.facts.some((f) => f.includes("listen 80"))).toBe(true);

    const workflowDeploy = inv.deployment.find((d) => d.kind === "github-workflow");
    expect(workflowDeploy).toBeDefined();

    // Dominio
    expect(inv.domain.entities).toContain("backend-api/Models/Entities/CostCenter.cs");
    expect(inv.domain.controllers.some((c) => c.includes("CostCentersController"))).toBe(true);
    expect(inv.domain.migrations.some((m) => m.includes("001_create_cost_centers.sql"))).toBe(true);

    // Documentos ordenados: CLAUDE.md prioridad 1 antes que README
    expect(inv.documents.length).toBeGreaterThan(0);
    const firstDoc = inv.documents[0];
    expect(firstDoc?.priority).toBe(1);
    expect(firstDoc?.path).toContain("CLAUDE.md");

    // appsettings.json, .env y local-notes.md en skipped y NUNCA en documents ni tree
    const skippedSecrets = inv.skipped.filter((s) => s.reason === "secret");
    const skippedGitignore = inv.skipped.filter((s) => s.reason === "gitignore");

    expect(skippedSecrets.some((s) => s.path.includes("appsettings.json"))).toBe(true);
    expect(skippedSecrets.some((s) => s.path.includes(".env"))).toBe(true);
    expect(skippedGitignore.some((s) => s.path.includes("local-notes.md"))).toBe(true);

    expect(inv.documents.some((d) => d.path.includes("appsettings.json"))).toBe(false);
    expect(inv.documents.some((d) => d.path.includes(".env"))).toBe(false);
    expect(inv.documents.some((d) => d.path.includes("local-notes.md"))).toBe(false);

    expect(inv.tree.some((t) => t.includes("node_modules"))).toBe(false);
  });

  it("analiza correctamente el fixture monorepo", () => {
    const root = getCleanFixture("monorepo");
    const inv = buildInventory(root, { useGit: false });

    expect(inv.layout).toBe("monorepo");
    expect(inv.repositories).toHaveLength(1);
    expect(inv.workspaceManifests).toContain("package.json");
  });

  it("analiza correctamente el fixture sin-git", () => {
    const root = getCleanFixture("sin-git");
    const inv = buildInventory(root, { useGit: false });

    expect(inv.layout).toBe("no-git");
    expect(inv.repositories).toHaveLength(0);

    const cmdTest = inv.commands.find((c) => c.runAs === "make test");
    const cmdLint = inv.commands.find((c) => c.runAs === "make lint");
    expect(cmdTest).toBeDefined();
    expect(cmdLint).toBeDefined();

    const dockerDeploy = inv.deployment.find((d) => d.kind === "dockerfile");
    expect(dockerDeploy).toBeDefined();
    expect(dockerDeploy?.facts.some((f) => f.includes("EXPOSE 8000"))).toBe(true);
  });

  it("GitignoreMatcher maneja correctamente los patrones especificados", () => {
    const gitignoreContent = `
# Comentario
*.log
/build
docs/**/draft.md
tmp/
!negacion.txt
`;
    const matcher = GitignoreMatcher.parse(gitignoreContent);

    expect(matcher.ignores("app.log", false)).toBe(true);
    expect(matcher.ignores("logs/nested.log", false)).toBe(true);
    expect(matcher.ignores("build", true)).toBe(true);
    expect(matcher.ignores("build/bundle.js", false)).toBe(true);
    expect(matcher.ignores("sub/build", true)).toBe(false); // /build está anclado a la raíz
    expect(matcher.ignores("docs/draft.md", false)).toBe(true);
    expect(matcher.ignores("docs/2026/draft.md", false)).toBe(true);
    expect(matcher.ignores("tmp", true)).toBe(true);
    expect(matcher.ignores("tmp", false)).toBe(false); // tmp/ solo aplica a directorios
  });
});
