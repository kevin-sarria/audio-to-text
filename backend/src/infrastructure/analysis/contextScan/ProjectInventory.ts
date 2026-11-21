import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { IGNORED_DIRS, isSecretFile, isBinaryFile, GitignoreMatcher } from "./ScanIgnore.js";
import { classifyFolders, annotateNoGitFolders } from "./inventory/folderClassifier.js";
import { parseManifest } from "./inventory/manifests/index.js";
import { parseDeploymentFile } from "./inventory/deploymentParser.js";
import { classifyDocument } from "./inventory/documentClassifier.js";
import { collectDomainNames, emptyDomain } from "./inventory/domainNames.js";
import { dateFiles } from "./inventory/gitDates.js";
import {
  CommandInfo,
  DeploymentFileInfo,
  DocumentRef,
  InventoryOptions,
  ManifestInfo,
  ProjectInventory,
  RepoInfo,
  RepoLayout,
  SkippedFile
} from "./inventory/types.js";

export * from "./inventory/types.js";

/**
 * Inventario determinístico del proyecto: clasifica las carpetas, recorre los
 * archivos de los repos activos y extrae manifiestos, comandos, despliegue,
 * documentos y nombres del dominio. No llama a ninguna IA.
 */

function makeRepoResolver(repositories: RepoInfo[]): (relPath: string) => string {
  const sorted = [...repositories].sort((a, b) => b.path.length - a.path.length);
  return (relPath: string) => {
    for (const r of sorted) {
      if (r.path === ".") return ".";
      if (relPath === r.path || relPath.startsWith(`${r.path}/`)) return r.path;
    }
    return ".";
  };
}

/**
 * - sin repos activos → "no-git";
 * - 2 o más repos principales → "multi-repo" (un .sln o un package.json con
 *   workspaces dentro de uno de ellos no lo convierte en monorepo);
 * - 1 repo con un manifiesto de workspace en su raíz → "monorepo";
 * - si no, "single-repo".
 */
function detectLayout(
  repositories: RepoInfo[],
  workspaceManifests: string[],
  resolveRepo: (relPath: string) => string
): RepoLayout {
  const principals = repositories.filter((r) => r.kind === "repo");
  if (principals.length === 0) return "no-git";
  if (principals.length >= 2) return "multi-repo";
  const only = principals[0]!.path;
  const hasRootWorkspace = workspaceManifests.some((wm) => {
    if (resolveRepo(wm) !== only) return false;
    const relToRepo = only === "." ? wm : path.posix.relative(only, wm);
    return !relToRepo.includes("/");
  });
  return hasRootWorkspace ? "monorepo" : "single-repo";
}

interface GitignoreStackEntry {
  dirRel: string;
  matcher: GitignoreMatcher;
}

function isIgnoredByStack(relPath: string, isDir: boolean, stack: GitignoreStackEntry[]): boolean {
  for (const { dirRel, matcher } of stack) {
    const relFromDir =
      dirRel === "" ? relPath : relPath.startsWith(`${dirRel}/`) ? relPath.slice(dirRel.length + 1) : null;
    if (relFromDir !== null && matcher.ignores(relFromDir, isDir)) return true;
  }
  return false;
}

export function buildInventory(rootPath: string, options?: InventoryOptions): ProjectInventory {
  const maxDepth = options?.maxDepth ?? 6;
  const treeDepth = options?.treeDepth ?? 3;
  const maxTreeLines = options?.maxTreeLines ?? 400;
  const useGit = options?.useGit ?? true;

  // 1. Clasificar carpetas antes de analizar
  const { repositories, otherFolders, excludedPaths } = classifyFolders(rootPath, maxDepth, useGit);
  const resolveRepo = makeRepoResolver(repositories);

  const manifests: ManifestInfo[] = [];
  const commands: CommandInfo[] = [];
  const deployment: DeploymentFileInfo[] = [];
  const tree: string[] = [];
  const domain = emptyDomain();
  const documents: DocumentRef[] = [];
  const skipped: SkippedFile[] = [];
  const workspaceManifests: string[] = [];
  let treeTruncated = 0;

  const addTreeLine = (line: string, depth: number) => {
    if (depth >= treeDepth) return;
    if (tree.length < maxTreeLines) tree.push(line);
    else treeTruncated++;
  };

  // 2. Recorrido de los repos activos respetando .gitignore apilados
  const walk = (currentDir: string, currentRel: string, depth: number, gitignoreStack: GitignoreStackEntry[]) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const localStack = [...gitignoreStack];
    const localMatcher = GitignoreMatcher.load(currentDir);
    if (localMatcher) localStack.push({ dirRel: currentRel, matcher: localMatcher });

    for (const entry of entries) {
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      try {
        if (fs.lstatSync(fullPath).isSymbolicLink()) continue;
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name.toLowerCase()) || entry.name === ".git") continue;
        if (excludedPaths.has(entryRel)) {
          skipped.push({ path: entryRel, reason: "excluded-folder" });
          continue;
        }
        if (isIgnoredByStack(entryRel, true, localStack)) {
          skipped.push({ path: entryRel, reason: "gitignore" });
          continue;
        }
        addTreeLine(`${entryRel}/`, depth);
        walk(fullPath, entryRel, depth + 1, localStack);
        continue;
      }
      if (!entry.isFile()) continue;

      if (isSecretFile(entryRel)) {
        skipped.push({ path: entryRel, reason: "secret" });
        continue;
      }
      if (isIgnoredByStack(entryRel, false, localStack)) {
        skipped.push({ path: entryRel, reason: "gitignore" });
        continue;
      }
      if (isBinaryFile(entryRel)) {
        skipped.push({ path: entryRel, reason: "binary" });
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      addTreeLine(entryRel, depth);
      const repo = resolveRepo(entryRel);
      collectDomainNames(entryRel, domain);

      const manifest = parseManifest(entryRel, fullPath, repo, currentDir);
      if (manifest) {
        manifests.push(manifest.info);
        commands.push(...manifest.commands);
        if (manifest.isWorkspace) workspaceManifests.push(entryRel);
      }

      if (entry.name === "Makefile" || entry.name === "makefile") {
        try {
          const targetRegex = /^([A-Za-z0-9_.-]+):/gm;
          const makeContent = fs.readFileSync(fullPath, "utf-8");
          let tm: RegExpExecArray | null;
          while ((tm = targetRegex.exec(makeContent)) !== null) {
            const target = tm[1];
            if (target && !target.startsWith(".")) {
              commands.push({ repo, source: entryRel, name: target, command: `make ${target}`, runAs: `make ${target}` });
            }
          }
        } catch {}
      }

      const deployInfo = parseDeploymentFile(entryRel, fullPath, repo);
      if (deployInfo) deployment.push(deployInfo);

      const docRef = classifyDocument(entryRel, repo, stat.size);
      if (docRef) {
        if (stat.size > 2 * 1024 * 1024) skipped.push({ path: entryRel, reason: "too-large" });
        else documents.push(docRef);
      }
    }
  };

  walk(rootPath, "", 0, []);
  if (treeTruncated > 0) tree.push(`… (${treeTruncated} entradas más no listadas)`);

  // 3. Layout a partir de los repos activos ya clasificados
  const layout = detectLayout(repositories, workspaceManifests, resolveRepo);

  // 4. Fechas de manifiestos, despliegue y documentos
  const filesToDate = new Set<string>([
    ...manifests.map((m) => m.path),
    ...deployment.map((d) => d.path),
    ...documents.map((d) => d.path)
  ]);
  const files = dateFiles(rootPath, filesToDate, repositories, resolveRepo, useGit);

  for (const doc of documents) {
    const fInfo = files[doc.path];
    if (fInfo) {
      doc.lastModified = fInfo.lastModified;
      doc.dateSource = fInfo.dateSource;
      doc.sizeBytes = fInfo.sizeBytes;
    }
  }
  documents.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.path.localeCompare(b.path)));

  // 5. Lo que digan los documentos de los repos activos sobre las carpetas sin git
  annotateNoGitFolders(rootPath, otherFolders, documents);

  // 6. Documentos idénticos (se leen una sola vez; que estén sincronizados también es un dato)
  const byHash = new Map<string, string[]>();
  for (const doc of documents) {
    if (doc.sizeBytes === 0) continue;
    try {
      const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(rootPath, doc.path))).digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), doc.path]);
    } catch {}
  }
  const identicalDocuments = [...byHash.values()].filter((group) => group.length > 1);

  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    layout,
    workspaceManifests,
    repositories,
    otherFolders,
    manifests,
    commands,
    deployment,
    tree,
    domain,
    documents,
    identicalDocuments,
    files,
    skipped
  };
}
