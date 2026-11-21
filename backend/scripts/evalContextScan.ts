import path from "node:path";
import fs from "node:fs";
import { copyFixture, fixtureUsesGit, fixturesRoot, listFixtures } from "../src/tests/helpers/contextScanFixtures.js";
import { runContextScan } from "../src/infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../src/infrastructure/analysis/contextScan/ScanBudget.js";
import { LlmProviderClients } from "../src/infrastructure/analysis/LlmProviderClients.js";
import {
  evaluateScan,
  EvaluationResult,
  ExpectedFact
} from "../src/infrastructure/analysis/contextScan/ContextScanEvaluator.js";
import { buildInventory } from "../src/infrastructure/analysis/contextScan/ProjectInventory.js";

/**
 * Evaluación del escáner de contexto contra los fixtures.
 *
 *   npm --workspace backend run eval:context-scan -- --fixture all --provider google-account --model gemini-3.8-flash-low
 *   npm --workspace backend run eval:context-scan -- --fixture multi-repo-git --provider none
 *
 * --provider none no llama a ninguna IA: mide lo que aporta solo el inventario (el piso).
 * Los proveedores con API key la leen de SCAN_EVAL_API_KEY.
 * Cada corrida se guarda en backend/eval-results/context-scan/ para comparar antes y después.
 */

interface Args {
  fixture: string;
  provider: string;
  model: string;
  baseUrl?: string;
  label?: string;
  save: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { fixture: "all", provider: "google-account", model: "gemini-3.8-flash-low", save: true };
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "--fixture" && next) { args.fixture = next; i++; }
    else if (argv[i] === "--provider" && next) { args.provider = next; i++; }
    else if (argv[i] === "--model" && next) { args.model = next; i++; }
    else if (argv[i] === "--base-url" && next) { args.baseUrl = next; i++; }
    else if (argv[i] === "--label" && next) { args.label = next; i++; }
    else if (argv[i] === "--no-save") { args.save = false; }
  }
  return args;
}

const EMPTY_SCAN = JSON.stringify({ secciones: {}, no_encontrado: [] });

function buildLlm(args: Args): (s: string, u: string) => Promise<string> {
  const apiKey = process.env.SCAN_EVAL_API_KEY || "";
  if (args.provider === "none") {
    return async (systemPrompt) =>
      systemPrompt.includes("extractor de hechos") ? JSON.stringify({ hechos: [] }) : EMPTY_SCAN;
  }
  if (args.provider === "google-account") {
    const agy = process.platform === "win32" ? "agy.exe" : "agy";
    return (s, u) => LlmProviderClients.callGoogleAccount(agy, s, u, args.model);
  }
  if (!apiKey) {
    throw new Error("Se requiere la variable de entorno SCAN_EVAL_API_KEY para proveedores con API key.");
  }
  if (args.provider === "gemini") return (s, u) => LlmProviderClients.callGemini(s, u, apiKey, args.model);
  if (args.provider === "groq") return (s, u) => LlmProviderClients.callGroq(s, u, apiKey, args.model);
  return (s, u) => LlmProviderClients.callOpenAi(s, u, apiKey, args.model, args.baseUrl);
}

interface FixtureRun {
  fixture: string;
  ok: boolean;
  error?: string;
  durationMs: number;
  llmCalls?: number;
  discarded?: number;
  evaluation?: EvaluationResult;
  technicalContext?: string;
}

function printRun(run: FixtureRun): void {
  console.log(`\n=== ${run.fixture} (${Math.round(run.durationMs / 1000)} s) ===`);
  if (!run.ok || !run.evaluation) {
    console.log(`  ERROR: ${run.error}`);
    return;
  }
  const e = run.evaluation;
  const m = e.metrics;
  console.log(`  Hechos: ${e.found}/${e.total}   Preguntas respondidas: ${e.questions.answered}/${e.questions.total}`);
  console.log(`  Líneas del modelo: ${m.dataLines}   temas: ${m.themeLines} (${m.themeRate} %)   sin confirmar: ${m.unconfirmedLines} (${m.unconfirmedRate} %)`);
  console.log(`  Tamaño del contexto: ${m.contextChars} caracteres   llamadas a la IA: ${run.llmCalls}   descartados: ${run.discarded}`);
  for (const miss of e.missing) console.log(`  - falta: ${miss}`);
  for (const f of e.falseFacts) console.log(`  - FALSO: ${f}`);
  for (const q of e.questions.results) {
    console.log(`  ${q.answered ? "[x]" : "[ ]"} ${q.id}: ${q.pregunta}${q.evidence ? `  ← ${q.evidence.slice(0, 110)}` : ""}`);
  }
  if (m.themeExamples.length > 0) {
    console.log("  Ejemplos de temas:");
    for (const t of m.themeExamples.slice(0, 5)) console.log(`    · ${t.slice(0, 140)}`);
  }
}

async function runFixture(name: string, args: Args): Promise<FixtureRun> {
  const started = Date.now();
  const useGit = fixtureUsesGit(name);
  let tmpPath = "";
  try {
    tmpPath = copyFixture(name);
    const expectedFile = path.join(fixturesRoot(), name, "expected.json");
    const expected: ExpectedFact[] = fs.existsSync(expectedFile)
      ? JSON.parse(fs.readFileSync(expectedFile, "utf-8"))
      : [];

    const result = await runContextScan(tmpPath, buildLlm(args), {
      budget: resolveScanBudget(args.model),
      providerLabel: args.provider,
      model: args.model,
      useGit
    });
    const inventory = buildInventory(tmpPath, { useGit });
    return {
      fixture: name,
      ok: true,
      durationMs: Date.now() - started,
      llmCalls: result.report.llmCalls,
      discarded: result.report.verification.discarded,
      evaluation: evaluateScan(result, inventory, expected),
      technicalContext: result.technicalContext
    };
  } catch (err: any) {
    return { fixture: name, ok: false, error: err?.message || String(err), durationMs: Date.now() - started };
  } finally {
    if (tmpPath) fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = args.fixture === "all" ? listFixtures() : args.fixture.split(",");
  console.log(`Proveedor: ${args.provider}   modelo: ${args.model}   fixtures: ${fixtures.join(", ")}`);

  const runs: FixtureRun[] = [];
  for (const name of fixtures) {
    const run = await runFixture(name, args);
    printRun(run);
    runs.push(run);
  }

  const ok = runs.filter((r) => r.ok && r.evaluation);
  const sum = (f: (e: EvaluationResult) => number) => ok.reduce((acc, r) => acc + f(r.evaluation!), 0);
  const dataLines = sum((e) => e.metrics.dataLines);
  const pct = (n: number) => (dataLines === 0 ? 0 : Math.round((n / dataLines) * 1000) / 10);
  const totals = {
    facts: `${sum((e) => e.found)}/${sum((e) => e.total)}`,
    questions: `${sum((e) => e.questions.answered)}/${sum((e) => e.questions.total)}`,
    themeRate: pct(sum((e) => e.metrics.themeLines)),
    unconfirmedRate: pct(sum((e) => e.metrics.unconfirmedLines)),
    failedFixtures: runs.filter((r) => !r.ok).map((r) => r.fixture)
  };
  console.log(`\n=== TOTAL ===`);
  console.log(`  Hechos ${totals.facts}   Preguntas ${totals.questions}   Temas ${totals.themeRate} %   Sin confirmar ${totals.unconfirmedRate} %`);
  if (totals.failedFixtures.length) console.log(`  Fixtures con error: ${totals.failedFixtures.join(", ")}`);

  if (args.save) {
    const outDir = path.join(process.cwd(), "eval-results", "context-scan");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const slug = [stamp, args.label, args.provider, args.model].filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
    const outFile = path.join(outDir, `${slug}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ args, totals, runs }, null, 2));
    console.log(`\nResultado guardado en ${outFile}`);
  }
}

main().catch((err) => {
  console.error("Error en la evaluación:", err);
  process.exit(1);
});
