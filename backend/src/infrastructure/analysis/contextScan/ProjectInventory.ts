import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  IGNORED_DIRS,
  isSecretFile,
  isBinaryFile,
  GitignoreMatcher
} from "./ScanIgnore.js";

export type DateSource = "git" | "mtime";

export interface InventoryFileInfo {
  path: string;
  sizeBytes: number;
  lastModified: string;
  dateSource: DateSource;
}

export interface RepoInfo {
  path: string;
  name: string;
  hasGit: boolean;
  headCommit: string | null;
  remoteUrl: string | null;
}

export type ManifestKind =
  | "npm"
  | "dotnet"
  | "dotnet-sln"
  | "maven"
  | "gradle"
  | "pip"
  | "pyproject"
  | "go"
  | "cargo"
  | "composer"
  | "gem";

export interface ManifestInfo {
  path: string;
  repo: string;
  kind: ManifestKind;
  name: string | null;
  version: string | null;
  frameworks: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  workspaces: string[];
}

export interface CommandInfo {
  repo: string;
  source: string;
  name: string;
  command: string;
  runAs: string;
}

export type DeploymentKind =
  | "github-workflow"
  | "gitlab-ci"
  | "azure-pipelines"
  | "dockerfile"
  | "docker-compose"
  | "nginx"
  | "procfile"
  | "pm2";

export interface DeploymentFileInfo {
  path: string;
  repo: string;
  kind: DeploymentKind;
  facts: string[];
}

export type DocumentCategory =
  | "agent-instructions"
  | "business-docs"
  | "templates"
  | "config-templates";

export interface DocumentRef {
  path: string;
  repo: string;
  category: DocumentCategory;
  priority: 1 | 2 | 3 | 4;
  sizeBytes: number;
  lastModified: string;
  dateSource: DateSource;
}

export interface DomainNames {
  entities: string[];
  migrations: string[];
  controllers: string[];
  routes: string[];
  pages: string[];
  i18n: string[];
}

export type RepoLayout = "single-repo" | "multi-repo" | "monorepo" | "no-git";

export interface SkippedFile {
  path: string;
  reason: "secret" | "gitignore" | "binary" | "too-large";
}

export interface ProjectInventory {
  rootPath: string;
  generatedAt: string;
  layout: RepoLayout;
  workspaceManifests: string[];
  repositories: RepoInfo[];
  manifests: ManifestInfo[];
  commands: CommandInfo[];
  deployment: DeploymentFileInfo[];
  tree: string[];
  domain: DomainNames;
  documents: DocumentRef[];
  files: Record<string, InventoryFileInfo>;
  skipped: SkippedFile[];
}

export interface InventoryOptions {
  maxDepth?: number;
  treeDepth?: number;
  maxTreeLines?: number;
  useGit?: boolean;
}

export function buildInventory(
  rootPath: string,
  options?: InventoryOptions
): ProjectInventory {
  const maxDepth = options?.maxDepth ?? 6;
  const treeDepth = options?.treeDepth ?? 3;
  const maxTreeLines = options?.maxTreeLines ?? 400;
  const useGit = options?.useGit ?? true;

  const repositories: RepoInfo[] = [];
  const manifests: ManifestInfo[] = [];
  const commands: CommandInfo[] = [];
  const deployment: DeploymentFileInfo[] = [];
  const tree: string[] = [];
  const domain: DomainNames = {
    entities: [],
    migrations: [],
    controllers: [],
    routes: [],
    pages: [],
    i18n: []
  };
  const documents: DocumentRef[] = [];
  const files: Record<string, InventoryFileInfo> = {};
  const skipped: SkippedFile[] = [];
  const workspaceManifests: string[] = [];

  let treeTruncated = 0;

  // 1. Detectar repositorios
  const findRepos = (currentDir: string, currentRel: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasGitEntry = entries.some((e) => e.name === ".git");
    if (hasGitEntry) {
      const repoRel = currentRel || ".";
      const repoName =
        repoRel === "."
          ? path.basename(path.resolve(rootPath))
          : path.posix.basename(repoRel);

      let headCommit: string | null = null;
      let remoteUrl: string | null = null;

      if (useGit) {
        try {
          const out = execFileSync("git", ["-C", currentDir, "rev-parse", "HEAD"], {
            encoding: "utf-8",
            timeout: 5000,
            windowsHide: true,
            stdio: ["pipe", "pipe", "ignore"]
          }).trim();
          if (out) headCommit = out;
        } catch {}

        try {
          const out = execFileSync(
            "git",
            ["-C", currentDir, "config", "--get", "remote.origin.url"],
            {
              encoding: "utf-8",
              timeout: 5000,
              windowsHide: true,
              stdio: ["pipe", "pipe", "ignore"]
            }
          ).trim();
          if (out) remoteUrl = out;
        } catch {}
      }

      // Si git falló o useGit=false, leer .git/HEAD y .git/config
      const gitPath = path.join(currentDir, ".git");
      try {
        const gitStat = fs.lstatSync(gitPath);
        if (gitStat.isDirectory()) {
          if (!headCommit) {
            const headFile = path.join(gitPath, "HEAD");
            if (fs.existsSync(headFile)) {
              const headContent = fs.readFileSync(headFile, "utf-8").trim();
              if (headContent.startsWith("ref: ")) {
                const refRel = headContent.slice(5).trim();
                const refFile = path.join(gitPath, refRel);
                if (fs.existsSync(refFile)) {
                  headCommit = fs.readFileSync(refFile, "utf-8").trim();
                } else {
                  // packed-refs
                  const packedFile = path.join(gitPath, "packed-refs");
                  if (fs.existsSync(packedFile)) {
                    const packed = fs.readFileSync(packedFile, "utf-8");
                    for (const line of packed.split(/\r?\n/)) {
                      if (line.includes(refRel)) {
                        headCommit = line.split(" ")[0] || null;
                        break;
                      }
                    }
                  }
                }
              } else if (/^[0-9a-f]{40}$/i.test(headContent)) {
                headCommit = headContent;
              }
            }
          }

          if (!remoteUrl) {
            const configFile = path.join(gitPath, "config");
            if (fs.existsSync(configFile)) {
              const configText = fs.readFileSync(configFile, "utf-8");
              const m = configText.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*([^\r\n]+)/i);
              if (m && m[1]) {
                remoteUrl = m[1].trim();
              }
            }
          }
        }
      } catch {}

      // Limpiar credenciales de remoteUrl: https://user:token@host -> https://host
      if (remoteUrl) {
        remoteUrl = remoteUrl.replace(
          /^(https?:\/\/)[^/@]+@([^\s]+)$/i,
          "$1$2"
        );
      }

      repositories.push({
        path: repoRel,
        name: repoName,
        hasGit: true,
        headCommit,
        remoteUrl
      });
    }

    for (const e of entries) {
      if (e.isDirectory()) {
        const lower = e.name.toLowerCase();
        if (IGNORED_DIRS.has(lower) || e.name === ".git") continue;
        const subDir = path.join(currentDir, e.name);
        const subRel = currentRel ? `${currentRel}/${e.name}` : e.name;
        findRepos(subDir, subRel, depth + 1);
      }
    }
  };

  findRepos(rootPath, "", 0);

  // Helper para asignar repo a una ruta
  const resolveRepoForPath = (relPath: string): string => {
    if (repositories.length === 0) return ".";
    // Ordenar repos de mayor profundidad a menor
    const sorted = [...repositories].sort((a, b) => b.path.length - a.path.length);
    for (const r of sorted) {
      if (r.path === ".") return ".";
      if (relPath === r.path || relPath.startsWith(`${r.path}/`)) {
        return r.path;
      }
    }
    return ".";
  };

  // 2. Recorrido de directorios y archivos respetando .gitignore apilados
  interface GitignoreStackEntry {
    dirRel: string;
    matcher: GitignoreMatcher;
  }

  const isIgnoredByGitignoreStack = (
    relPath: string,
    isDir: boolean,
    stack: GitignoreStackEntry[]
  ): boolean => {
    for (const { dirRel, matcher } of stack) {
      const relFromDir =
        dirRel === ""
          ? relPath
          : relPath.startsWith(`${dirRel}/`)
          ? relPath.slice(dirRel.length + 1)
          : null;

      if (relFromDir !== null && matcher.ignores(relFromDir, isDir)) {
        return true;
      }
    }
    return false;
  };

  const walk = (
    currentDir: string,
    currentRel: string,
    depth: number,
    gitignoreStack: GitignoreStackEntry[]
  ) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Verificar si hay .gitignore en este directorio
    const localStack = [...gitignoreStack];
    const localMatcher = GitignoreMatcher.load(currentDir);
    if (localMatcher) {
      localStack.push({ dirRel: currentRel, matcher: localMatcher });
    }

    for (const entry of entries) {
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      // Symlinks: no seguir
      try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
          continue;
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (IGNORED_DIRS.has(lowerName) || entry.name === ".git") {
          continue;
        }

        if (isIgnoredByGitignoreStack(entryRel, true, localStack)) {
          skipped.push({ path: entryRel, reason: "gitignore" });
          continue;
        }

        // Árbol
        if (depth < treeDepth) {
          if (tree.length < maxTreeLines) {
            tree.push(`${entryRel}/`);
          } else {
            treeTruncated++;
          }
        }

        walk(fullPath, entryRel, depth + 1, localStack);
      } else if (entry.isFile()) {
        const isSecret = isSecretFile(entryRel);
        if (isSecret) {
          skipped.push({ path: entryRel, reason: "secret" });
          continue;
        }

        if (isIgnoredByGitignoreStack(entryRel, false, localStack)) {
          skipped.push({ path: entryRel, reason: "gitignore" });
          continue;
        }

        const isBin = isBinaryFile(entryRel);
        if (isBin) {
          skipped.push({ path: entryRel, reason: "binary" });
          continue;
        }

        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        // Árbol
        if (depth < treeDepth) {
          if (tree.length < maxTreeLines) {
            tree.push(entryRel);
          } else {
            treeTruncated++;
          }
        }

        const sizeBytes = stat.size;
        const repo = resolveRepoForPath(entryRel);

        // Nombres del dominio
        collectDomainNames(entryRel, domain);

        // Manifiestos
        const manifest = parseManifest(entryRel, fullPath, repo, currentDir);
        if (manifest) {
          manifests.push(manifest.info);
          for (const cmd of manifest.commands) {
            commands.push(cmd);
          }
          if (manifest.isWorkspace) {
            workspaceManifests.push(entryRel);
          }
        }

        // Comandos de Makefile
        if (entry.name === "Makefile" || entry.name === "makefile") {
          try {
            const makeContent = fs.readFileSync(fullPath, "utf-8");
            const targetRegex = /^([A-Za-z0-9_.-]+):/gm;
            let tm: RegExpExecArray | null;
            while ((tm = targetRegex.exec(makeContent)) !== null) {
              const target = tm[1];
              if (target && !target.startsWith(".")) {
                commands.push({
                  repo,
                  source: entryRel,
                  name: target,
                  command: `make ${target}`,
                  runAs: `make ${target}`
                });
              }
            }
          } catch {}
        }

        // Despliegue
        const deployInfo = parseDeploymentFile(entryRel, fullPath, repo);
        if (deployInfo) {
          deployment.push(deployInfo);
        }

        // Documentos
        const docRef = classifyDocument(entryRel, repo, sizeBytes);
        if (docRef) {
          if (sizeBytes > 2 * 1024 * 1024) {
            skipped.push({ path: entryRel, reason: "too-large" });
          } else {
            documents.push(docRef);
          }
        }
      }
    }
  };

  walk(rootPath, "", 0, []);

  if (treeTruncated > 0) {
    tree.push(`… (${treeTruncated} entradas más no listadas)`);
  }

  // 3. Determinar layout
  let layout: RepoLayout = "single-repo";
  if (repositories.length === 0) {
    layout = "no-git";
  } else {
    // Si hay manifiesto de workspace en la raíz de un repo -> "monorepo"
    const hasRootWorkspace = workspaceManifests.some((wm) => {
      const repoOfWm = resolveRepoForPath(wm);
      const relToRepo =
        repoOfWm === "." ? wm : path.posix.relative(repoOfWm, wm);
      return !relToRepo.includes("/");
    });

    if (hasRootWorkspace) {
      layout = "monorepo";
    } else if (repositories.length >= 2) {
      layout = "multi-repo";
    } else {
      layout = "single-repo";
    }
  }

  // 4. Fechas de manifiestos, despliegue y documentos
  const filesToDate = new Set<string>();
  for (const m of manifests) filesToDate.add(m.path);
  for (const d of deployment) filesToDate.add(d.path);
  for (const doc of documents) filesToDate.add(doc.path);

  // Recolectar fechas por repo con git log
  const gitDatesByRepo: Record<string, Record<string, string>> = {};

  if (useGit) {
    for (const repo of repositories) {
      const repoDir = repo.path === "." ? rootPath : path.join(rootPath, repo.path);
      try {
        const logOut = execFileSync(
          "git",
          ["-C", repoDir, "log", "--format=@@%cI", "--name-only", "--no-renames", "-n", "3000"],
          {
            encoding: "utf-8",
            timeout: 5000,
            windowsHide: true,
            stdio: ["pipe", "pipe", "ignore"]
          }
        );

        const repoFileDates: Record<string, string> = {};
        let currentDate: string | null = null;
        for (const line of logOut.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("@@")) {
            currentDate = trimmed.slice(2);
          } else if (currentDate) {
            const normPath = trimmed.replace(/\\/g, "/");
            if (!repoFileDates[normPath]) {
              repoFileDates[normPath] = currentDate;
            }
          }
        }
        gitDatesByRepo[repo.path] = repoFileDates;
      } catch {}
    }
  }

  for (const filePath of filesToDate) {
    const repo = resolveRepoForPath(filePath);
    const relToRepo =
      repo === "." ? filePath : path.posix.relative(repo, filePath);

    let lastModified: string | null = null;
    let dateSource: DateSource = "mtime";

    if (useGit && gitDatesByRepo[repo] && gitDatesByRepo[repo][relToRepo]) {
      lastModified = gitDatesByRepo[repo][relToRepo];
      dateSource = "git";
    }

    const fullPath = path.join(rootPath, filePath);
    let sizeBytes = 0;
    try {
      const stat = fs.statSync(fullPath);
      sizeBytes = stat.size;
      if (!lastModified) {
        lastModified = stat.mtime.toISOString();
        dateSource = "mtime";
      }
    } catch {
      if (!lastModified) {
        lastModified = new Date().toISOString();
      }
    }

    files[filePath] = {
      path: filePath,
      sizeBytes,
      lastModified,
      dateSource
    };
  }

  // Asignar fechas actualizadas a documents
  for (const doc of documents) {
    const fInfo = files[doc.path];
    if (fInfo) {
      doc.lastModified = fInfo.lastModified;
      doc.dateSource = fInfo.dateSource;
      doc.sizeBytes = fInfo.sizeBytes;
    }
  }

  // Ordenar documentos: prioridad (1..4) asc, luego ruta asc
  documents.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.path.localeCompare(b.path);
  });

  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    layout,
    workspaceManifests,
    repositories,
    manifests,
    commands,
    deployment,
    tree,
    domain,
    documents,
    files,
    skipped
  };
}

// Helpers para parsing
function collectDomainNames(relPath: string, domain: DomainNames): void {
  const norm = relPath.replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  const base = path.posix.basename(norm);

  // entidades/modelos: carpetas entities|entity|models|model|domain o *.entity.ts o prisma/schema.prisma
  if (
    lower.includes("/entities/") ||
    lower.includes("/entity/") ||
    lower.includes("/models/") ||
    lower.includes("/model/") ||
    lower.includes("/domain/") ||
    lower.startsWith("entities/") ||
    lower.startsWith("models/") ||
    lower.startsWith("domain/") ||
    lower.endsWith(".entity.ts") ||
    lower.endsWith("prisma/schema.prisma")
  ) {
    if (domain.entities.length < 80 && !domain.entities.includes(norm)) {
      domain.entities.push(norm);
    }
  }

  // migraciones/SQL: migrations/** o *.sql
  if (lower.includes("/migrations/") || lower.startsWith("migrations/") || lower.endsWith(".sql")) {
    if (domain.migrations.length < 80 && !domain.migrations.includes(norm)) {
      domain.migrations.push(norm);
    }
  }

  // controladores: *Controller.*, *controller.*, carpetas controllers
  if (
    lower.includes("controller") ||
    lower.includes("/controllers/") ||
    lower.startsWith("controllers/")
  ) {
    if (domain.controllers.length < 80 && !domain.controllers.includes(norm)) {
      domain.controllers.push(norm);
    }
  }

  // rutas: routes/**, *.routes.*, *router*
  if (
    lower.includes("/routes/") ||
    lower.startsWith("routes/") ||
    lower.includes(".routes.") ||
    lower.includes("router")
  ) {
    if (domain.routes.length < 80 && !domain.routes.includes(norm)) {
      domain.routes.push(norm);
    }
  }

  // páginas: pages/**, views/**, screens/**, app/**/page.tsx
  if (
    lower.includes("/pages/") ||
    lower.startsWith("pages/") ||
    lower.includes("/views/") ||
    lower.startsWith("views/") ||
    lower.includes("/screens/") ||
    lower.startsWith("screens/") ||
    (lower.includes("/app/") && base.startsWith("page."))
  ) {
    if (domain.pages.length < 80 && !domain.pages.includes(norm)) {
      domain.pages.push(norm);
    }
  }

  // i18n: locales/**/*.json, i18n/**, *.resx
  if (
    (lower.includes("/locales/") || lower.startsWith("locales/")) &&
    lower.endsWith(".json")
  ) {
    if (domain.i18n.length < 80 && !domain.i18n.includes(norm)) {
      domain.i18n.push(norm);
    }
  } else if (
    lower.includes("/i18n/") ||
    lower.startsWith("i18n/") ||
    lower.endsWith(".resx")
  ) {
    if (domain.i18n.length < 80 && !domain.i18n.includes(norm)) {
      domain.i18n.push(norm);
    }
  }
}

interface ParsedManifest {
  info: ManifestInfo;
  commands: CommandInfo[];
  isWorkspace: boolean;
}

function parseManifest(
  relPath: string,
  fullPath: string,
  repo: string,
  manifestDir: string
): ParsedManifest | null {
  const norm = relPath.replace(/\\/g, "/");
  const fileName = path.posix.basename(norm);
  const lowerName = fileName.toLowerCase();

  // 1. package.json
  if (lowerName === "package.json") {
    let name: string | null = null;
    let version: string | null = null;
    let dependencies: Record<string, string> = {};
    let devDependencies: Record<string, string> = {};
    let workspaces: string[] = [];
    const commands: CommandInfo[] = [];

    // Determinar package manager
    const hasPnpm = fs.existsSync(path.join(manifestDir, "pnpm-lock.yaml"));
    const hasYarn = fs.existsSync(path.join(manifestDir, "yarn.lock"));
    const pkgManager = hasPnpm ? "pnpm" : hasYarn ? "yarn" : "npm";

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const json = JSON.parse(raw);
      name = typeof json.name === "string" ? json.name : null;
      version = typeof json.version === "string" ? json.version : null;
      if (json.dependencies && typeof json.dependencies === "object") {
        dependencies = json.dependencies;
      }
      if (json.devDependencies && typeof json.devDependencies === "object") {
        devDependencies = json.devDependencies;
      }
      if (Array.isArray(json.workspaces)) {
        workspaces = json.workspaces;
      } else if (json.workspaces && Array.isArray(json.workspaces.packages)) {
        workspaces = json.workspaces.packages;
      }

      if (json.scripts && typeof json.scripts === "object") {
        for (const [scriptName, scriptCmd] of Object.entries(json.scripts)) {
          let runAs: string;
          if (scriptName === "test") {
            runAs = `${pkgManager} test`;
          } else if (scriptName === "start") {
            runAs = `${pkgManager} start`;
          } else {
            runAs = `${pkgManager} run ${scriptName}`;
          }
          commands.push({
            repo,
            source: relPath,
            name: scriptName,
            command: String(scriptCmd),
            runAs
          });
        }
      }
    } catch {}

    const frameworks: string[] = [];
    for (const dep of Object.keys({ ...dependencies, ...devDependencies })) {
      const depLower = dep.toLowerCase();
      if (
        [
          "react",
          "vue",
          "angular",
          "next",
          "vite",
          "express",
          "nest",
          "@nestjs/core",
          "fastify",
          "prisma",
          "@prisma/client",
          "typeorm",
          "expo",
          "react-native",
          "svelte"
        ].includes(depLower)
      ) {
        if (!frameworks.includes(dep)) frameworks.push(dep);
      }
    }

    return {
      info: {
        path: relPath,
        repo,
        kind: "npm",
        name,
        version,
        frameworks,
        dependencies,
        devDependencies,
        workspaces
      },
      commands,
      isWorkspace: workspaces.length > 0
    };
  }

  // 2. *.csproj
  if (lowerName.endsWith(".csproj")) {
    let name: string | null = fileName.replace(/\.csproj$/i, "");
    const frameworks: string[] = [];
    const dependencies: Record<string, string> = {};
    const commands: CommandInfo[] = [];

    commands.push({
      repo,
      source: relPath,
      name: "build",
      command: "dotnet build",
      runAs: "dotnet build"
    });

    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      // TargetFramework / TargetFrameworks
      const tfMatch = text.match(/<TargetFramework>(.*?)<\/TargetFramework>/i);
      if (tfMatch && tfMatch[1]) {
        frameworks.push(tfMatch[1].trim());
      }
      const tfsMatch = text.match(/<TargetFrameworks>(.*?)<\/TargetFrameworks>/i);
      if (tfsMatch && tfsMatch[1]) {
        for (const f of tfsMatch[1].split(";")) {
          const tr = f.trim();
          if (tr && !frameworks.includes(tr)) frameworks.push(tr);
        }
      }

      // PackageReference Include="X" Version="Y"
      const pkgRefRegex = /<PackageReference\s+[^>]*Include="([^"]+)"(?:\s+Version="([^"]+)")?[^>]*\/?>/gi;
      let pm: RegExpExecArray | null;
      let hasTestPkg = false;
      while ((pm = pkgRefRegex.exec(text)) !== null) {
        const pkgName = pm[1];
        if (!pkgName) continue;
        const pkgVer = pm[2] || "*";
        dependencies[pkgName] = pkgVer;
        const lowerPkg = pkgName.toLowerCase();
        if (
          lowerPkg.includes("xunit") ||
          lowerPkg.includes("nunit") ||
          lowerPkg.includes("mstest") ||
          lowerPkg.includes("microsoft.net.test.sdk")
        ) {
          hasTestPkg = true;
        }
      }

      if (hasTestPkg) {
        commands.push({
          repo,
          source: relPath,
          name: "test",
          command: "dotnet test",
          runAs: "dotnet test"
        });
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "dotnet",
        name,
        version: null,
        frameworks,
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands,
      isWorkspace: false
    };
  }

  // 3. *.sln
  if (lowerName.endsWith(".sln")) {
    const workspaces: string[] = [];
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const projRegex = /Project\([^)]+\)\s*=\s*"([^"]+)",\s*"([^"]+\.csproj)"/gi;
      let m: RegExpExecArray | null;
      while ((m = projRegex.exec(text)) !== null) {
        if (m[2]) {
          workspaces.push(m[2].replace(/\\/g, "/"));
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "dotnet-sln",
        name: fileName.replace(/\.sln$/i, ""),
        version: null,
        frameworks: [],
        dependencies: {},
        devDependencies: {},
        workspaces
      },
      commands: [],
      isWorkspace: workspaces.length >= 2
    };
  }

  // 4. pom.xml
  if (lowerName === "pom.xml") {
    let name: string | null = null;
    let version: string | null = null;
    const dependencies: Record<string, string> = {};
    const frameworks: string[] = [];
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const artMatch = text.match(/<artifactId>(.*?)<\/artifactId>/i);
      if (artMatch && artMatch[1]) name = artMatch[1].trim();
      const verMatch = text.match(/<version>(.*?)<\/version>/i);
      if (verMatch && verMatch[1]) version = verMatch[1].trim();

      const depRegex = /<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>(?:[\s\S]*?<version>(.*?)<\/version>)?[\s\S]*?<\/dependency>/gi;
      let dm: RegExpExecArray | null;
      while ((dm = depRegex.exec(text)) !== null) {
        if (dm[1] && dm[2]) {
          const depName = `${dm[1].trim()}:${dm[2].trim()}`;
          dependencies[depName] = dm[3] ? dm[3].trim() : "*";
          if (dm[2].toLowerCase().includes("spring-boot")) {
            if (!frameworks.includes("spring-boot")) frameworks.push("spring-boot");
          }
        }
      }
    } catch {}

    const commands: CommandInfo[] = [
      { repo, source: relPath, name: "test", command: "mvn test", runAs: "mvn test" },
      { repo, source: relPath, name: "package", command: "mvn package", runAs: "mvn package" }
    ];

    return {
      info: {
        path: relPath,
        repo,
        kind: "maven",
        name,
        version,
        frameworks,
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands,
      isWorkspace: false
    };
  }

  // 5. build.gradle / build.gradle.kts
  if (lowerName === "build.gradle" || lowerName === "build.gradle.kts") {
    const dependencies: Record<string, string> = {};
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const depRegex = /(?:implementation|api|testImplementation)\s*\(?['"]([^'"]+)['"]\)?/g;
      let gm: RegExpExecArray | null;
      while ((gm = depRegex.exec(text)) !== null) {
        if (gm[1]) {
          const parts = gm[1].split(":");
          const p0 = parts[0];
          if (p0) {
            dependencies[p0 + (parts[1] ? `:${parts[1]}` : "")] = parts[2] || "*";
          }
        }
      }
    } catch {}

    const commands: CommandInfo[] = [
      { repo, source: relPath, name: "build", command: "./gradlew build", runAs: "./gradlew build" },
      { repo, source: relPath, name: "test", command: "./gradlew test", runAs: "./gradlew test" }
    ];

    return {
      info: {
        path: relPath,
        repo,
        kind: "gradle",
        name: null,
        version: null,
        frameworks: [],
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands,
      isWorkspace: false
    };
  }

  // 6. requirements.txt
  if (lowerName === "requirements.txt") {
    const dependencies: Record<string, string> = {};
    const frameworks: string[] = [];
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const parts = line.split(/[==|>=|<=|~=]/);
        const p0 = parts[0];
        if (p0) {
          const pkg = p0.trim();
          if (pkg) {
            const ver = line.slice(pkg.length).replace(/^[=><~]+/, "").trim() || "*";
            dependencies[pkg] = ver;
            const pl = pkg.toLowerCase();
            if (["django", "flask", "fastapi"].includes(pl)) {
              if (!frameworks.includes(pkg)) frameworks.push(pkg);
            }
          }
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "pip",
        name: null,
        version: null,
        frameworks,
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: false
    };
  }

  // 7. pyproject.toml
  if (lowerName === "pyproject.toml") {
    let name: string | null = null;
    let version: string | null = null;
    const dependencies: Record<string, string> = {};
    const frameworks: string[] = [];
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const nameMatch = text.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch && nameMatch[1]) name = nameMatch[1];
      const verMatch = text.match(/version\s*=\s*"([^"]+)"/);
      if (verMatch && verMatch[1]) version = verMatch[1];

      // dependencies en [project] o [tool.poetry.dependencies]
      const depBlockMatch = text.match(/(?:\[project\.dependencies\]|\[tool\.poetry\.dependencies\])([\s\S]*?)(?:\[|$)/i);
      if (depBlockMatch && depBlockMatch[1]) {
        for (const line of depBlockMatch[1].split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
          if (m && m[1] && m[2]) {
            dependencies[m[1]] = m[2];
            const pl = m[1].toLowerCase();
            if (["django", "flask", "fastapi"].includes(pl)) {
              if (!frameworks.includes(m[1])) frameworks.push(m[1]);
            }
          }
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "pyproject",
        name,
        version,
        frameworks,
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: false
    };
  }

  // 8. go.mod
  if (lowerName === "go.mod") {
    let name: string | null = null;
    let version: string | null = null;
    const dependencies: Record<string, string> = {};
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const modMatch = text.match(/^module\s+([^\r\n]+)/m);
      if (modMatch && modMatch[1]) name = modMatch[1].trim();
      const goVerMatch = text.match(/^go\s+([^\r\n]+)/m);
      if (goVerMatch && goVerMatch[1]) version = goVerMatch[1].trim();

      const reqRegex = /require\s+([^\s]+)\s+([^\s\r\n]+)/g;
      let rm: RegExpExecArray | null;
      while ((rm = reqRegex.exec(text)) !== null) {
        if (rm[1] && rm[2]) {
          dependencies[rm[1]] = rm[2];
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "go",
        name,
        version,
        frameworks: [],
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: false
    };
  }

  // 9. Cargo.toml
  if (lowerName === "cargo.toml") {
    let name: string | null = null;
    let version: string | null = null;
    const dependencies: Record<string, string> = {};
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const nameMatch = text.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/i);
      if (nameMatch && nameMatch[1]) name = nameMatch[1];
      const verMatch = text.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/i);
      if (verMatch && verMatch[1]) version = verMatch[1];

      const depMatch = text.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/i);
      if (depMatch && depMatch[1]) {
        for (const line of depMatch[1].split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
          if (m && m[1] && m[2]) dependencies[m[1]] = m[2];
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "cargo",
        name,
        version,
        frameworks: [],
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: false
    };
  }

  // 10. composer.json
  if (lowerName === "composer.json") {
    let name: string | null = null;
    let version: string | null = null;
    let dependencies: Record<string, string> = {};
    const commands: CommandInfo[] = [];
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const json = JSON.parse(raw);
      name = json.name || null;
      version = json.version || null;
      if (json.require && typeof json.require === "object") {
        dependencies = json.require;
      }
      if (json.scripts && typeof json.scripts === "object") {
        for (const scriptName of Object.keys(json.scripts)) {
          commands.push({
            repo,
            source: relPath,
            name: scriptName,
            command: `composer run ${scriptName}`,
            runAs: `composer run ${scriptName}`
          });
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "composer",
        name,
        version,
        frameworks: [],
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands,
      isWorkspace: false
    };
  }

  // 11. Gemfile
  if (lowerName === "gemfile") {
    const dependencies: Record<string, string> = {};
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const gemRegex = /gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g;
      let gm: RegExpExecArray | null;
      while ((gm = gemRegex.exec(text)) !== null) {
        if (gm[1]) {
          dependencies[gm[1]] = gm[2] || "*";
        }
      }
    } catch {}

    return {
      info: {
        path: relPath,
        repo,
        kind: "gem",
        name: null,
        version: null,
        frameworks: [],
        dependencies,
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: false
    };
  }

  // Otros archivos de workspace: pnpm-workspace.yaml, nx.json, turbo.json, lerna.json
  if (
    lowerName === "pnpm-workspace.yaml" ||
    lowerName === "nx.json" ||
    lowerName === "turbo.json" ||
    lowerName === "lerna.json"
  ) {
    return {
      info: {
        path: relPath,
        repo,
        kind: "npm",
        name: null,
        version: null,
        frameworks: [],
        dependencies: {},
        devDependencies: {},
        workspaces: []
      },
      commands: [],
      isWorkspace: true
    };
  }

  return null;
}

function parseDeploymentFile(
  relPath: string,
  fullPath: string,
  repo: string
): DeploymentFileInfo | null {
  const norm = relPath.replace(/\\/g, "/");
  const fileName = path.posix.basename(norm);
  const lowerName = fileName.toLowerCase();

  let kind: DeploymentKind | null = null;

  if (
    (norm.includes("/.github/workflows/") || norm.startsWith(".github/workflows/")) &&
    (lowerName.endsWith(".yml") || lowerName.endsWith(".yaml"))
  ) {
    kind = "github-workflow";
  } else if (lowerName === ".gitlab-ci.yml") {
    kind = "gitlab-ci";
  } else if (lowerName === "azure-pipelines.yml") {
    kind = "azure-pipelines";
  } else if (lowerName.startsWith("dockerfile")) {
    kind = "dockerfile";
  } else if (
    (lowerName.startsWith("docker-compose") || lowerName === "compose.yml") &&
    (lowerName.endsWith(".yml") || lowerName.endsWith(".yaml"))
  ) {
    kind = "docker-compose";
  } else if (lowerName.startsWith("nginx") && lowerName.endsWith(".conf")) {
    kind = "nginx";
  } else if (norm.includes("/nginx/") && lowerName.endsWith(".conf")) {
    kind = "nginx";
  } else if (lowerName === "procfile") {
    kind = "procfile";
  } else if (
    lowerName.startsWith("ecosystem.config.") ||
    (lowerName.startsWith("pm2") && lowerName.endsWith(".json"))
  ) {
    kind = "pm2";
  }

  if (!kind) return null;

  const facts: string[] = [];
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const lines = text.split(/\r?\n/);
    const factKeywords = [
      /^\s*EXPOSE\b/i,
      /^\s*FROM\b/i,
      /^\s*(?:CMD|ENTRYPOINT)\b/i,
      /ports:/i,
      /-\s*"?[0-9]+:[0-9]+"?/i,
      /^\s*listen\b/i,
      /^\s*server_name\b/i,
      /^\s*root\b/i,
      /^\s*proxy_pass\b/i,
      /runs-on:/i,
      /^\s*run:/i,
      /uses:/i,
      /pm2/i,
      /script:/i,
      /^(?:web|worker):/i
    ];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (factKeywords.some((pat) => pat.test(trimmed))) {
        facts.push(trimmed.slice(0, 200));
        if (facts.length >= 15) break;
      }
    }
  } catch {}

  return {
    path: relPath,
    repo,
    kind,
    facts
  };
}

function classifyDocument(
  relPath: string,
  repo: string,
  sizeBytes: number
): DocumentRef | null {
  const norm = relPath.replace(/\\/g, "/");
  const fileName = path.posix.basename(norm);
  const lowerName = fileName.toLowerCase();

  // 1. agent-instructions (prioridad 1)
  const agentNames = [
    "claude.md",
    "agents.md",
    "gemini.md",
    ".cursorrules",
    ".windsurfrules"
  ];
  if (
    agentNames.includes(lowerName) ||
    norm.includes("/.cursor/rules/") ||
    norm.startsWith(".cursor/rules/") ||
    lowerName === "copilot-instructions.md"
  ) {
    return {
      path: relPath,
      repo,
      category: "agent-instructions",
      priority: 1,
      sizeBytes,
      lastModified: "",
      dateSource: "mtime"
    };
  }

  // 3. templates (prioridad 3) - chequear antes de business-docs para templates en .github
  if (
    lowerName === "pull_request_template.md" ||
    norm.toLowerCase().includes(".github/pull_request_template") ||
    norm.toLowerCase().includes(".github/issue_template/")
  ) {
    return {
      path: relPath,
      repo,
      category: "templates",
      priority: 3,
      sizeBytes,
      lastModified: "",
      dateSource: "mtime"
    };
  }

  // 4. config-templates (prioridad 4)
  if (
    lowerName === ".env.example" ||
    lowerName === ".env.sample" ||
    lowerName === ".env.template" ||
    lowerName === "appsettings.template.json" ||
    lowerName.endsWith(".example.json") ||
    lowerName.endsWith(".template.json")
  ) {
    return {
      path: relPath,
      repo,
      category: "config-templates",
      priority: 4,
      sizeBytes,
      lastModified: "",
      dateSource: "mtime"
    };
  }

  // 2. business-docs (prioridad 2)
  if (
    ((lowerName.endsWith(".md") || lowerName.endsWith(".txt")) &&
      (norm.toLowerCase().startsWith("docs/") ||
        norm.toLowerCase().includes("/docs/") ||
        norm.toLowerCase().startsWith("doc/") ||
        norm.toLowerCase().includes("/doc/") ||
        norm.toLowerCase().startsWith("adr/") ||
        norm.toLowerCase().includes("/adr/"))) ||
    lowerName === "contributing.md" ||
    lowerName === "readme.md" ||
    lowerName === "architecture.md"
  ) {
    return {
      path: relPath,
      repo,
      category: "business-docs",
      priority: 2,
      sizeBytes,
      lastModified: "",
      dateSource: "mtime"
    };
  }

  return null;
}
