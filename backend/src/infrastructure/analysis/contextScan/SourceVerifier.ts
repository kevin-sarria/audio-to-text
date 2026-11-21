import fs from "node:fs";
import path from "node:path";
import { ProjectInventory } from "./ProjectInventory.js";
import {
  ScanResponse,
  ScanSectionKey,
  ScanItem,
  GlossaryItem,
  Contradiction,
  DATA_SECTION_KEYS
} from "./ContextScanSchema.js";
import { isSecretFile } from "./ScanIgnore.js";

export interface DiscardedItem {
  section: ScanSectionKey;
  dato: string;
  fuente: string;
  reason: string;
}

export interface VerificationStats {
  verified: number;
  unconfirmed: number;
  discarded: number;
}

function normalizeSourcePath(rawFuente: string): string {
  let cleaned = rawFuente.trim().replace(/^["']|["']$/g, "");
  // Quitar sufijo :línea o #ancla
  cleaned = cleaned.replace(/:\d+$/, "").replace(/#.*$/, "");
  // Quitar ./ inicial
  cleaned = cleaned.replace(/^\.\//, "");
  return cleaned.replace(/\\/g, "/").trim();
}

function splitSources(fuente: string): string[] {
  // Separar por comas, puntos y comas, o ' y ' / ' and '
  const parts = fuente.split(/\s*(?:,|;|\s+y\s+|\s+and\s+)\s*/i);
  return parts.map(normalizeSourcePath).filter(Boolean);
}

function normalizeCommand(cmd: string): string {
  let c = cmd.trim().toLowerCase();
  if (c.startsWith("npm run test")) {
    c = c.replace("npm run test", "npm test");
  }
  return c;
}

export function verifyScanResponse(
  data: ScanResponse,
  inventory: ProjectInventory,
  rootPath: string
): {
  data: ScanResponse;
  stats: VerificationStats;
  discarded: DiscardedItem[];
} {
  // Clonar profundamente data para no mutar la entrada
  const clonedData: ScanResponse = JSON.parse(JSON.stringify(data));
  const discarded: DiscardedItem[] = [];
  let verifiedCount = 0;
  let unconfirmedCount = 0;

  const inventoryString = JSON.stringify(inventory).toLowerCase();
  const knownCommands = new Set(
    inventory.commands.map((c) => normalizeCommand(c.runAs))
  );

  // Cache de archivos leídos
  const fileContentCache = new Map<string, string | null>();

  const readFileSafe = (fullPath: string): string | null => {
    if (fileContentCache.has(fullPath)) {
      return fileContentCache.get(fullPath)!;
    }
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fileContentCache.set(fullPath, "");
        return "";
      }
      if (stat.size > 2 * 1024 * 1024) {
        fileContentCache.set(fullPath, null);
        return null;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      fileContentCache.set(fullPath, content);
      return content;
    } catch {
      fileContentCache.set(fullPath, null);
      return null;
    }
  };

  // Helper para verificar una fuente
  const checkSingleSource = (
    src: string
  ): {
    valid: boolean;
    reason?: string;
    isInventory: boolean;
    exists: boolean;
    isDir: boolean;
    fullPath?: string;
    content?: string | null;
  } => {
    const norm = normalizeSourcePath(src);
    if (!norm) {
      return { valid: false, reason: "la fuente está vacía", isInventory: false, exists: false, isDir: false };
    }

    if (norm.toLowerCase() === "inventario" || norm.toLowerCase().startsWith("inventario")) {
      return { valid: true, isInventory: true, exists: true, isDir: false };
    }

    const resolved = path.resolve(rootPath, norm);
    const relToRoot = path.relative(rootPath, resolved);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      return { valid: false, reason: "fuente fuera del proyecto", isInventory: false, exists: false, isDir: false };
    }

    if (isSecretFile(norm)) {
      return { valid: false, reason: "fuente con secretos", isInventory: false, exists: false, isDir: false };
    }

    try {
      if (!fs.existsSync(resolved)) {
        return { valid: false, reason: "la fuente no existe", isInventory: false, exists: false, isDir: false };
      }
      const stat = fs.statSync(resolved);
      const isDir = stat.isDirectory();
      const content = isDir ? "" : readFileSafe(resolved);
      return { valid: true, isInventory: false, exists: true, isDir, fullPath: resolved, content };
    } catch {
      return { valid: false, reason: "la fuente no existe", isInventory: false, exists: false, isDir: false };
    }
  };

  // 1. Verificar las 13 secciones de datos
  for (const secKey of DATA_SECTION_KEYS) {
    const items = clonedData.secciones[secKey as keyof typeof clonedData.secciones] as
      | ScanItem[]
      | undefined;
    if (!items || !Array.isArray(items)) continue;

    const keptItems: ScanItem[] = [];

    for (const item of items) {
      const rawFuente = item.fuente || "";
      const subSources = splitSources(rawFuente);

      if (subSources.length === 0) {
        discarded.push({
          section: secKey,
          dato: item.dato,
          fuente: rawFuente,
          reason: "fuente no especificada"
        });
        continue;
      }

      // Evaluar si alguna fuente existe
      let validSourceFound = false;
      let atLeastOneChecked: ReturnType<typeof checkSingleSource> | null = null;
      let lastReason = "la fuente no existe";

      for (const s of subSources) {
        const check = checkSingleSource(s);
        if (check.valid) {
          validSourceFound = true;
          atLeastOneChecked = check;
          break;
        } else {
          lastReason = check.reason || "la fuente no existe";
        }
      }

      if (!validSourceFound || !atLeastOneChecked) {
        discarded.push({
          section: secKey,
          dato: item.dato,
          fuente: rawFuente,
          reason: lastReason
        });
        continue;
      }

      // Reglas específicas por sección:
      // A. "verificacion"
      if (secKey === "verificacion") {
        let cmdToTest = item.valor || "";
        if (!cmdToTest) {
          const m = item.dato.match(
            /\b((?:npm|pnpm|yarn|dotnet|make|mvn|\.\/gradlew|composer)\s+[^\s,;]+)/i
          );
          if (m && m[1]) cmdToTest = m[1];
        }

        if (cmdToTest) {
          const normCmd = normalizeCommand(cmdToTest);

          // Determinar repo de la fuente
          const normSource = subSources[0] || rawFuente;
          let targetRepo: string | null = null;
          if (inventory.repositories.length > 0) {
            const sortedRepos = [...inventory.repositories].sort((a, b) => b.path.length - a.path.length);
            for (const r of sortedRepos) {
              if (normSource === r.path || normSource.startsWith(`${r.path}/`)) {
                targetRepo = r.path;
                break;
              }
            }
            if (!targetRepo && sortedRepos.some((r) => r.path === ".")) {
              targetRepo = ".";
            }
          }

          const repoCommands = targetRepo !== null
            ? inventory.commands.filter((c) => c.repo === targetRepo)
            : inventory.commands;

          const repoCmdSet = new Set(repoCommands.map((c) => normalizeCommand(c.runAs)));

          if (!repoCmdSet.has(normCmd)) {
            discarded.push({
              section: secKey,
              dato: item.dato,
              fuente: rawFuente,
              reason: "el comando no existe en el inventario"
            });
            continue;
          }
        }
      }

      // B. "capas_estructura" y "repositorios"
      if (secKey === "capas_estructura" || secKey === "repositorios") {
        const candidateFolders: string[] = [];
        if (item.valor && (item.valor.endsWith("/") || item.valor.includes("/"))) {
          candidateFolders.push(item.valor);
        }
        const tokens = item.dato.split(/[\s,;`'"]+/);
        for (const t of tokens) {
          if (
            (t.endsWith("/") && t.length > 1) ||
            (t.includes("/") && t.split("/").filter(Boolean).length >= 2)
          ) {
            candidateFolders.push(t);
          }
        }

        let folderMissing = false;
        for (const cf of candidateFolders) {
          const cleanF = cf.replace(/^\.\//, "").replace(/\/+$/, "");
          const fPath = path.resolve(rootPath, cleanF);
          const rel = path.relative(rootPath, fPath);
          if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(fPath)) {
            folderMissing = true;
            break;
          }
        }

        if (folderMissing) {
          discarded.push({
            section: secKey,
            dato: item.dato,
            fuente: rawFuente,
            reason: "la carpeta no existe"
          });
          continue;
        }
      }

      // Ahora comprobar verificado vs sin confirmar
      if (atLeastOneChecked.isInventory) {
        const checkStr = (item.valor || item.dato).toLowerCase();
        if (inventoryString.includes(checkStr)) {
          item.verificado = true;
          verifiedCount++;
        } else {
          item.verificado = false;
          unconfirmedCount++;
        }
        keptItems.push(item);
        continue;
      }

      if (atLeastOneChecked.isDir) {
        item.verificado = true;
        verifiedCount++;
        keptItems.push(item);
        continue;
      }

      // Es un archivo existente
      const content = atLeastOneChecked.content || "";
      const contentNormalized = content.replace(/\s+/g, " ").toLowerCase();

      if (item.valor) {
        const valNorm = item.valor.replace(/\s+/g, " ").toLowerCase();
        let appears = contentNormalized.includes(valNorm);
        if (!appears && (valNorm.startsWith("npm run ") || valNorm.startsWith("pnpm run ") || valNorm.startsWith("yarn run ") || valNorm.startsWith("composer run "))) {
          const parts = valNorm.split(/\s+/);
          const scriptPart = parts[2];
          if (scriptPart && (contentNormalized.includes(`"${scriptPart}"`) || contentNormalized.includes(`'${scriptPart}'`))) {
            appears = true;
          }
        }

        if (appears) {
          item.verificado = true;
          verifiedCount++;
        } else {
          item.verificado = false;
          unconfirmedCount++;
        }
      } else {
        // Extraer literales del dato: versiones, puertos, rutas con /
        const literals: string[] = [];
        const verMatches = item.dato.match(/\b\d+\.\d+(?:\.\d+)?\b/g);
        if (verMatches) literals.push(...verMatches);
        const portMatches = item.dato.match(/(?:puerto\s+\d{2,5}|:\d{2,5})/gi);
        if (portMatches) {
          for (const pm of portMatches) {
            const num = pm.replace(/\D/g, "");
            if (num) literals.push(num);
          }
        }
        const words = item.dato.split(/\s+/);
        for (const w of words) {
          const cleanW = w.replace(/[`'",()]/g, "");
          if (cleanW.includes("/") && cleanW.length > 3) {
            literals.push(cleanW);
          }
        }

        if (literals.length === 0) {
          // Si no hay literales, la fuente existe -> verificado
          item.verificado = true;
          verifiedCount++;
        } else {
          const allFound = literals.every((lit) =>
            contentNormalized.includes(lit.replace(/\s+/g, " ").toLowerCase())
          );
          if (allFound) {
            item.verificado = true;
            verifiedCount++;
          } else {
            item.verificado = false;
            unconfirmedCount++;
          }
        }
      }

      keptItems.push(item);
    }

    (clonedData.secciones as any)[secKey] = keptItems;
  }

  // 2. Glosario
  const glossaryItems = clonedData.secciones.glosario || [];
  const keptGlossary: GlossaryItem[] = [];

  for (const item of glossaryItems) {
    const rawFuente = item.fuente || "";
    const subSources = splitSources(rawFuente);
    let validCheck: ReturnType<typeof checkSingleSource> | null = null;

    for (const s of subSources) {
      const c = checkSingleSource(s);
      if (c.valid) {
        validCheck = c;
        break;
      }
    }

    if (!validCheck) {
      discarded.push({
        section: "glosario",
        dato: `${item.termino_reunion} → ${item.nombre_codigo}`,
        fuente: rawFuente,
        reason: "la fuente no existe"
      });
      continue;
    }

    // nombre_codigo debe aparecer en el contenido o en el nombre del archivo fuente
    const codeNameNorm = item.nombre_codigo.trim().toLowerCase();
    const fileNameNorm = path.posix.basename(validCheck.fullPath || rawFuente).toLowerCase();

    let appearsInFile = fileNameNorm.includes(codeNameNorm);
    if (!appearsInFile && validCheck.content) {
      appearsInFile = validCheck.content.toLowerCase().includes(codeNameNorm);
    }
    if (!appearsInFile && validCheck.isInventory) {
      appearsInFile = inventoryString.includes(codeNameNorm);
    }

    if (appearsInFile) {
      item.verificado = true;
      verifiedCount++;
    } else {
      item.verificado = false;
      unconfirmedCount++;
    }

    keptGlossary.push(item);
  }
  clonedData.secciones.glosario = keptGlossary;

  // 3. Contradicciones
  const contradictions = clonedData.secciones.contradicciones || [];
  const keptContradictions: Contradiction[] = [];

  for (const c of contradictions) {
    const validFuentes: string[] = [];
    for (const f of c.fuentes || []) {
      const check = checkSingleSource(f);
      if (check.valid) {
        validFuentes.push(f);
      }
    }

    if (validFuentes.length === 0) {
      discarded.push({
        section: "contradicciones",
        dato: c.descripcion,
        fuente: (c.fuentes || []).join(", "),
        reason: "las fuentes de la contradicción no existen"
      });
      continue;
    }

    c.fuentes = validFuentes;
    keptContradictions.push(c);
  }
  clonedData.secciones.contradicciones = keptContradictions;

  return {
    data: clonedData,
    stats: {
      verified: verifiedCount,
      unconfirmed: unconfirmedCount,
      discarded: discarded.length
    },
    discarded
  };
}
