import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { classifyFolders } from "../../infrastructure/analysis/contextScan/inventory/folderClassifier.js";
import { normalizeRemote, resolveGitDir } from "../../infrastructure/analysis/contextScan/inventory/gitMeta.js";
import { buildInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Prueba",
  GIT_AUTHOR_EMAIL: "prueba@ejemplo.test",
  GIT_COMMITTER_NAME: "Prueba",
  GIT_COMMITTER_EMAIL: "prueba@ejemplo.test"
};
const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "core.autocrlf=false", ...args], { cwd, env, encoding: "utf-8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();

let dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "folder-classifier-"));
  dirs.push(d);
  return d;
};
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const initRepo = (dir: string, remote?: string) => {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  if (remote) git(dir, ["remote", "add", "origin", remote]);
  write(path.join(dir, "package.json"), JSON.stringify({ name: path.basename(dir), scripts: { test: "vitest" } }));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "init"]);
};

afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("gitMeta", () => {
  it("normalizeRemote iguala SSH y HTTPS, con o sin .git y credenciales", () => {
    const a = normalizeRemote("git@github.com:Orbe/App.git");
    expect(a).toBe("github.com/orbe/app");
    expect(normalizeRemote("https://github.com/orbe/app")).toBe(a);
    expect(normalizeRemote("https://user:token@github.com/orbe/app.git/")).toBe(a);
    expect(normalizeRemote("ssh://git@github.com/orbe/app.git")).toBe(a);
    expect(normalizeRemote(null)).toBeNull();
  });

  it("resolveGitDir reconoce un submódulo por su gitdir dentro de .git/modules", () => {
    const root = tmp();
    write(path.join(root, "padre", ".git", "modules", "lib", "HEAD"), "ref: refs/heads/main\n");
    write(path.join(root, "padre", "lib", ".git"), "gitdir: ../.git/modules/lib\n");
    expect(resolveGitDir(path.join(root, "padre", "lib"))?.kind).toBe("submodule");
  });
});

describe("classifyFolders", () => {
  it("una copia de trabajo dentro del repo (.claude/worktrees/x) no convierte el proyecto en multi-repo", () => {
    const root = tmp();
    initRepo(root, "https://github.com/orbe/app.git");
    git(root, ["worktree", "add", "-q", "-b", "agente/tarea", ".claude/worktrees/tarea"]);

    const c = classifyFolders(root, 6, true);
    expect(c.repositories.map((r) => r.path)).toEqual(["."]);
    expect(c.otherFolders).toHaveLength(1);
    expect(c.otherFolders[0]).toMatchObject({
      path: ".claude/worktrees/tarea",
      kind: "copia-de-trabajo",
      ownerPath: ".",
      branch: "agente/tarea"
    });

    const inv = buildInventory(root, { useGit: true });
    expect(inv.layout).toBe("single-repo");
    expect(inv.manifests.map((m) => m.path)).toEqual(["package.json"]);
  });

  it("una copia de trabajo cuyo repo dueño está fuera de la carpeta no expone la ruta local", () => {
    const outside = tmp();
    const scanned = tmp();
    initRepo(path.join(outside, "dueno"), "https://github.com/orbe/dueno.git");
    git(path.join(outside, "dueno"), ["worktree", "add", "-q", "-b", "rama-x", path.join(scanned, "copia")]);
    initRepo(path.join(scanned, "otro"), "https://github.com/orbe/otro.git");

    const c = classifyFolders(scanned, 6, true);
    const wt = c.otherFolders.find((f) => f.path === "copia")!;
    expect(wt.kind).toBe("copia-de-trabajo");
    expect(wt.ownerPath).toBeNull();
    expect(wt.notes.join(" ")).toContain("(dueno)");
    expect(wt.notes.join(" ")).not.toContain(outside);
  });

  it("de dos clones con el mismo remoto, el más avanzado es el principal y el atrasado es el duplicado", () => {
    const root = tmp();
    initRepo(path.join(root, "app"), "git@github.com:orbe/app.git");
    git(root, ["clone", "-q", path.join(root, "app"), "app-vieja"]);
    git(path.join(root, "app-vieja"), ["remote", "set-url", "origin", "https://github.com/orbe/app"]);
    write(path.join(root, "app", "nuevo.txt"), "x");
    git(path.join(root, "app"), ["add", "-A"]);
    git(path.join(root, "app"), ["commit", "-q", "-m", "avance"]);

    const c = classifyFolders(root, 6, true);
    expect(c.repositories.map((r) => r.path)).toEqual(["app"]);
    expect(c.otherFolders[0]).toMatchObject({ path: "app-vieja", kind: "clon-duplicado", ownerPath: "app" });
    expect(c.otherFolders[0]!.notes).toContain("mismo remoto; su commit es anterior");
  });

  it("dos clones con historial distinto se quedan como repos, con una nota", () => {
    const root = tmp();
    initRepo(path.join(root, "a"), "https://github.com/orbe/app.git");
    git(root, ["clone", "-q", path.join(root, "a"), "b"]);
    git(path.join(root, "b"), ["remote", "set-url", "origin", "https://github.com/orbe/app.git"]);
    for (const d of ["a", "b"]) {
      write(path.join(root, d, `${d}.txt`), d);
      git(path.join(root, d), ["add", "-A"]);
      git(path.join(root, d), ["commit", "-q", "-m", `cambio ${d}`]);
    }
    const c = classifyFolders(root, 6, true);
    expect(c.repositories.map((r) => r.path)).toEqual(["a", "b"]);
    expect(c.repositories.find((r) => r.path === "b")!.notes[0]).toContain("historial distinto");
    expect(c.otherFolders).toHaveLength(0);
  });

  it("las carpetas sin git solo se separan cuando hay repos; los agrupadores se recorren", () => {
    const root = tmp();
    initRepo(path.join(root, "proyectos", "api"));
    write(path.join(root, "proyectos", "notas", "ideas.md"), "# ideas");
    write(path.join(root, "salidas", "reporte.txt"), "x");
    write(path.join(root, ".vscode-like", "x.json"), "{}");

    const c = classifyFolders(root, 6, true);
    expect(c.repositories.map((r) => r.path)).toEqual(["proyectos/api"]);
    expect(c.otherFolders.map((f) => `${f.kind}:${f.path}`)).toEqual(["sin-git:proyectos/notas", "sin-git:salidas"]);

    const sinRepos = tmp();
    write(path.join(sinRepos, "app", "main.py"), "print(1)");
    expect(classifyFolders(sinRepos, 6, true).otherFolders).toHaveLength(0);
  });

  it("sin el binario de git (useGit=false) un clon con el mismo HEAD igual se detecta", () => {
    const root = tmp();
    initRepo(path.join(root, "app"), "https://github.com/orbe/app.git");
    git(root, ["clone", "-q", path.join(root, "app"), "app-copia"]);
    git(path.join(root, "app-copia"), ["remote", "set-url", "origin", "https://github.com/orbe/app.git"]);

    const c = classifyFolders(root, 6, false);
    expect(c.repositories.map((r) => r.path)).toEqual(["app"]);
    expect(c.otherFolders[0]).toMatchObject({ path: "app-copia", kind: "clon-duplicado" });
  });
});
