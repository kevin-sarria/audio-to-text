import fs from "node:fs";
import path from "node:path";
import { computeContextMetrics, answerQuestion } from "../src/infrastructure/analysis/contextScan/ContextScanMetrics.js";
import { ExpectedFact } from "../src/infrastructure/analysis/contextScan/ContextScanEvaluator.js";
import { fixturesRoot } from "../src/tests/helpers/contextScanFixtures.js";

/**
 * Vuelve a calcular preguntas y métricas sobre una corrida guardada, sin llamar a la IA.
 * Sirve cuando cambian la heurística o las preguntas y hay que comparar con la línea base.
 *
 *   npx tsx scripts/rescoreContextScan.ts eval-results/context-scan/<corrida>.json
 */
const file = process.argv[2];
if (!file) {
  console.error("Uso: tsx scripts/rescoreContextScan.ts <archivo de resultado>");
  process.exit(1);
}

const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
let answered = 0, total = 0, dataLines = 0, themes = 0, unconfirmed = 0;

for (const run of saved.runs) {
  if (!run.ok || !run.technicalContext) continue;
  const expected: ExpectedFact[] = JSON.parse(
    fs.readFileSync(path.join(fixturesRoot(), run.fixture, "expected.json"), "utf-8")
  );
  const m = computeContextMetrics(run.technicalContext);
  const qs = expected
    .filter((f) => f.tipo === "pregunta")
    .map((f) => answerQuestion(run.technicalContext, {
      id: f.id, pregunta: f.pregunta ?? f.id, seccion: f.seccion ?? [], respuesta: f.respuesta ?? []
    }));
  const ok = qs.filter((q) => q.answered).length;
  answered += ok; total += qs.length; dataLines += m.dataLines; themes += m.themeLines; unconfirmed += m.unconfirmedLines;
  console.log(`${run.fixture}: preguntas ${ok}/${qs.length}   temas ${m.themeLines}/${m.dataLines} (${m.themeRate} %)   sin confirmar ${m.unconfirmedRate} %`);
  for (const t of m.themeExamples) console.log(`    · ${t.slice(0, 140)}`);
}
const pct = (n: number) => (dataLines ? Math.round((n / dataLines) * 1000) / 10 : 0);
console.log(`TOTAL: preguntas ${answered}/${total}   temas ${pct(themes)} %   sin confirmar ${pct(unconfirmed)} %`);
