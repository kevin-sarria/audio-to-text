import path from "node:path";
import fs from "node:fs";
import { copyFixture } from "../src/tests/helpers/contextScanFixtures.js";
import { runContextScan } from "../src/infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../src/infrastructure/analysis/contextScan/ScanBudget.js";
import { LlmProviderClients } from "../src/infrastructure/analysis/LlmProviderClients.js";
import {
  evaluateScan,
  ExpectedFact
} from "../src/infrastructure/analysis/contextScan/ContextScanEvaluator.js";
import { buildInventory } from "../src/infrastructure/analysis/contextScan/ProjectInventory.js";

async function main() {
  const args = process.argv.slice(2);
  let fixtureName = "tres-repos";
  let provider = "openai";
  let model = "gpt-4o-mini";
  let baseUrl: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fixture" && args[i + 1]) {
      fixtureName = args[i + 1];
      i++;
    } else if (args[i] === "--provider" && args[i + 1]) {
      provider = args[i + 1];
      i++;
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (args[i] === "--base-url" && args[i + 1]) {
      baseUrl = args[i + 1];
      i++;
    }
  }

  const apiKey = process.env.SCAN_EVAL_API_KEY || "";
  if (!apiKey && provider !== "google-account") {
    console.error("Error: Se requiere la variable de entorno SCAN_EVAL_API_KEY para proveedores con API Key.");
    process.exit(1);
  }

  console.log(`Evaluando fixture "${fixtureName}" con proveedor "${provider}" y modelo "${model}"...`);

  const tmpPath = copyFixture(fixtureName);
  const expectedFile = path.join(
    process.cwd(),
    "src/tests/fixtures/context-scan",
    fixtureName,
    "expected.json"
  );

  let expectedFacts: ExpectedFact[] = [];
  if (fs.existsSync(expectedFile)) {
    expectedFacts = JSON.parse(fs.readFileSync(expectedFile, "utf-8"));
  }

  const budget = resolveScanBudget(model);

  const llmCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (provider === "google-account") {
      const isWin = process.platform === "win32";
      const agy = isWin ? "agy.exe" : "agy";
      return LlmProviderClients.callGoogleAccount(agy, systemPrompt, userPrompt, model);
    } else if (provider === "gemini") {
      return LlmProviderClients.callGemini(systemPrompt, userPrompt, apiKey, model);
    } else if (provider === "groq") {
      return LlmProviderClients.callGroq(systemPrompt, userPrompt, apiKey, model);
    } else {
      return LlmProviderClients.callOpenAi(systemPrompt, userPrompt, apiKey, model, baseUrl);
    }
  };

  try {
    const result = await runContextScan(tmpPath, llmCall, {
      budget,
      providerLabel: provider,
      model,
      useGit: false
    });

    const inventory = buildInventory(tmpPath, { useGit: false });
    const evalRes = evaluateScan(result, inventory, expectedFacts);

    console.log(`\n--- RESULTADOS DE EVALUACIÓN ---`);
    console.log(`Hechos verificados encontrados: ${evalRes.found} / ${evalRes.total}`);
    if (evalRes.missing.length > 0) {
      console.log(`Faltantes (${evalRes.missing.length}):`);
      for (const m of evalRes.missing) console.log(`  - ${m}`);
    }
    if (evalRes.falseFacts.length > 0) {
      console.log(`Hechos falsos / alucinados (${evalRes.falseFacts.length}):`);
      for (const f of evalRes.falseFacts) console.log(`  - ${f}`);
    }
    console.log(`Llamadas a LLM: ${result.report.llmCalls}`);
    console.log(`Datos descartados: ${result.report.verification.discarded}`);
  } finally {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Error en la evaluación:", err);
  process.exit(1);
});
