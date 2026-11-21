import fs from "node:fs";
import { CommandInfo, ParsedManifest } from "../types.js";

export function parseCsproj(relPath: string, fileName: string, fullPath: string, repo: string): ParsedManifest {
  const name = fileName.replace(/\.csproj$/i, "");
  const frameworks: string[] = [];
  const dependencies: Record<string, string> = {};
  const commands: CommandInfo[] = [
    { repo, source: relPath, name: "build", command: "dotnet build", runAs: "dotnet build" }
  ];

  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const tfMatch = text.match(/<TargetFramework>(.*?)<\/TargetFramework>/i);
    if (tfMatch && tfMatch[1]) frameworks.push(tfMatch[1].trim());
    const tfsMatch = text.match(/<TargetFrameworks>(.*?)<\/TargetFrameworks>/i);
    if (tfsMatch && tfsMatch[1]) {
      for (const f of tfsMatch[1].split(";")) {
        const tr = f.trim();
        if (tr && !frameworks.includes(tr)) frameworks.push(tr);
      }
    }

    const pkgRefRegex = /<PackageReference\s+[^>]*Include="([^"]+)"(?:\s+Version="([^"]+)")?[^>]*\/?>/gi;
    let pm: RegExpExecArray | null;
    let hasTestPkg = false;
    while ((pm = pkgRefRegex.exec(text)) !== null) {
      const pkgName = pm[1];
      if (!pkgName) continue;
      dependencies[pkgName] = pm[2] || "*";
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
      commands.push({ repo, source: relPath, name: "test", command: "dotnet test", runAs: "dotnet test" });
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

export function parseSln(relPath: string, fileName: string, fullPath: string, repo: string): ParsedManifest {
  const workspaces: string[] = [];
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const projRegex = /Project\([^)]+\)\s*=\s*"([^"]+)",\s*"([^"]+\.csproj)"/gi;
    let m: RegExpExecArray | null;
    while ((m = projRegex.exec(text)) !== null) {
      if (m[2]) workspaces.push(m[2].replace(/\\/g, "/"));
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

export function parsePom(relPath: string, fullPath: string, repo: string): ParsedManifest {
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

    const depRegex =
      /<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>(?:[\s\S]*?<version>(.*?)<\/version>)?[\s\S]*?<\/dependency>/gi;
    let dm: RegExpExecArray | null;
    while ((dm = depRegex.exec(text)) !== null) {
      if (dm[1] && dm[2]) {
        dependencies[`${dm[1].trim()}:${dm[2].trim()}`] = dm[3] ? dm[3].trim() : "*";
        if (dm[2].toLowerCase().includes("spring-boot") && !frameworks.includes("spring-boot")) {
          frameworks.push("spring-boot");
        }
      }
    }
  } catch {}

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
    commands: [
      { repo, source: relPath, name: "test", command: "mvn test", runAs: "mvn test" },
      { repo, source: relPath, name: "package", command: "mvn package", runAs: "mvn package" }
    ],
    isWorkspace: false
  };
}

export function parseGradle(relPath: string, fullPath: string, repo: string): ParsedManifest {
  const dependencies: Record<string, string> = {};
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const depRegex = /(?:implementation|api|testImplementation)\s*\(?['"]([^'"]+)['"]\)?/g;
    let gm: RegExpExecArray | null;
    while ((gm = depRegex.exec(text)) !== null) {
      if (gm[1]) {
        const parts = gm[1].split(":");
        const p0 = parts[0];
        if (p0) dependencies[p0 + (parts[1] ? `:${parts[1]}` : "")] = parts[2] || "*";
      }
    }
  } catch {}

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
    commands: [
      { repo, source: relPath, name: "build", command: "./gradlew build", runAs: "./gradlew build" },
      { repo, source: relPath, name: "test", command: "./gradlew test", runAs: "./gradlew test" }
    ],
    isWorkspace: false
  };
}
