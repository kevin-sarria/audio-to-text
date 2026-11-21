import fs from "node:fs";
import path from "node:path";
import { ProjectInventory } from "../ProjectInventory.js";
import { DocumentContent } from "../DocumentReader.js";
import { annotateHeadings, blameLineTimes, sectionDatesLine, sectionsWithDates } from "./sectionDating.js";

const MAX_BLAMED_DOCS = 40;

/**
 * Agrega a cada documento leído la fecha y las marcas de cada sección: en los leídos
 * completos, junto a cada encabezado; en los resumidos, como una lista aparte.
 * Sin git (o fuera de un repo) solo se anotan las marcas.
 */
export function annotateContentsWithVigencia(
  rootPath: string,
  inventory: ProjectInventory,
  contents: DocumentContent[],
  useGit: boolean
): void {
  const repoPaths = new Set(inventory.repositories.map((r) => r.path));
  contents.forEach((c, i) => {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(rootPath, c.ref.path), "utf-8");
    } catch {
      return;
    }
    const repo = c.ref.repo;
    const canBlame = useGit && i < MAX_BLAMED_DOCS && repoPaths.has(repo);
    const repoDir = repo === "." ? rootPath : path.join(rootPath, repo);
    const relToRepo = repo === "." ? c.ref.path : path.posix.relative(repo, c.ref.path);
    const times = canBlame ? blameLineTimes(repoDir, relToRepo) : null;
    const sections = sectionsWithDates(raw, times);

    if (c.mode === "full") {
      c.text = annotateHeadings(c.text, sections);
    } else {
      const line = sectionDatesLine(sections);
      if (line) c.sectionDates = line;
    }
  });
}
