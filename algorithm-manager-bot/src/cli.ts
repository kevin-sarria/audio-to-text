import fs from "node:fs";
import path from "node:path";
import { AutonomousMeetingBotService } from "./application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "./infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "./infrastructure/ai/CommercialProposalLlmService.js";
import { LlmClientFactory } from "./infrastructure/ai/LlmClientFactory.js";
import { MeetingSummaryLlmService } from "./infrastructure/ai/MeetingSummaryLlmService.js";
import { HeadlessMeetingBotConnector } from "./infrastructure/connectors/HeadlessMeetingBotConnector.js";
import { ExtractedUtterance } from "./infrastructure/connectors/PlatformSpeakerExtractor.js";

const DEMO_MEETING_DIALOGUE: ExtractedUtterance[] = [
  {
    speakerName: "Ing. Javier Morales (Cliente - Logística Express)",
    content: "Buenos días a todos. Muchas gracias por conectarse a la llamada.",
    timestamp: "10:02:15",
    platform: "GOOGLE_MEET"
  },
  {
    speakerName: "Roberto Díaz (Director de Operaciones)",
    content: "Hola Javier, un gusto. Cuéntanos sobre la necesidad principal que tienen.",
    timestamp: "10:02:30",
    platform: "GOOGLE_MEET"
  },
  {
    speakerName: "Ing. Javier Morales (Cliente - Logística Express)",
    content: "Tenemos un cuello de botella grave en el despacho de pedidos. Necesitamos cotización y una propuesta comercial de software con IA para automatizar la asignación de rutas. Contamos con un presupuesto de 15,000 USD y un plazo de entrega de 6 semanas.",
    timestamp: "10:03:10",
    platform: "GOOGLE_MEET"
  },
  {
    speakerName: "Roberto Díaz (Director de Operaciones)",
    content: "Comprendido perfectamente Javier. Con nuestro equipo estructuramos las fases y te enviamos la propuesta ejecutiva hoy mismo para revisión de tu gerencia.",
    timestamp: "10:03:50",
    platform: "GOOGLE_MEET"
  }
];

function printHeader(targetUrl: string, platform: string, isLive: boolean) {
  console.log("\n" + "=".repeat(70));
  console.log("   🤖  ALGORITHM MANAGER BOT - ASISTENTE AUTÓNOMO DE SALA");
  console.log("=".repeat(70));
  console.log(` • Sala de Reunión: ${platform} (${targetUrl})`);
  console.log(` • Modo: ${isLive ? "CONEXIÓN EN VIVO A SALA VIRTUAL" : "Modo Simulación / Captura Rápida"}`);
  console.log(" • Cero preguntas: Diarización con nombres, Word (.docx) y Excel (.xlsx)");
  console.log("=".repeat(70) + "\n");
}

async function runAutonomousBot(
  meetingUrl: string,
  isLive: boolean,
  isVisible: boolean,
  sampleUtterances?: ExtractedUtterance[]
) {
  const platform = HeadlessMeetingBotConnector.detectPlatform(meetingUrl);
  printHeader(meetingUrl, platform, isLive);

  const callLlm = LlmClientFactory.createCaller();
  const classifier = new MeetingClassifierLlmService(callLlm);
  const proposalGen = new CommercialProposalLlmService(callLlm);
  const summarizer = new MeetingSummaryLlmService(callLlm);
  const botService = new AutonomousMeetingBotService(
    classifier,
    proposalGen,
    undefined,
    undefined,
    summarizer
  );

  const sessionId = await botService.startAutonomousMeeting({
    meetingUrl,
    headless: !isVisible,
    skipConnection: !isLive,
    onStatus: isLive ? (state, message) => console.log(` [${state}] ${message}`) : undefined,
    onUtterance: (u) => {
      console.log(` [${u.timestamp}] 🗣️ ${u.speakerName}`);
      console.log(`    ↳ "${u.content}"\n`);
    }
  });
  if (isLive) {
    console.log("🚀 El bot se ha unido a la sala como invitado y ha iniciado la captura...");
  }

  console.log(`📡 Sesión activa: [${sessionId}]`);
  console.log("🎙️ Escuchando y reconociendo a los participantes en tiempo real:\n");

  if (!isLive) {
    const utterancesToProcess = sampleUtterances || DEMO_MEETING_DIALOGUE;
    for (const u of utterancesToProcess) {
      botService.recordUtterance(u);
      console.log(` [${u.timestamp}] 🗣️ ${u.speakerName}`);
      console.log(`    ↳ "${u.content}"\n`);
      await new Promise((r) => setTimeout(r, 300));
    }
  } else {
    console.log("🟢 Conexión en vivo activa en la sala.");
    console.log("💡 Presiona [ENTER] en esta consola en cualquier momento para finalizar y generar reportes...\n");
    await new Promise<void>((resolve) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
        process.stdin.once("data", () => resolve());
      } else {
        process.once("SIGINT", () => resolve());
      }
    });
  }

  console.log("\n🔔 Fin de la reunión detectado. Procesando entregables sin intervención...");
  const outputDir = path.resolve(process.cwd(), "output");
  const result = await botService.finalizeAndGenerateDeliverables(sessionId, meetingUrl, outputDir);

  console.log("\n" + "=".repeat(70));
  console.log(`✨ REUNIÓN INFERIDA COMO: [${result.meetingType}]`);
  console.log(`🎯 Motivo: ${result.classificationReason}`);
  console.log(`👥 Participantes reconocidos (${result.speakers.length}): ${result.speakers.join(", ")}`);
  console.log("-".repeat(70));
  console.log("📁 ENTREGABLES GENERADOS Y DISPONIBLES EN PANEL WEB:");
  console.log(`   📄 Documento Word (.docx) : ${result.transcriptDocxPath}`);
  if (result.issuesExcelPath) {
    console.log(`   📊 Matriz Excel (.xlsx)   : ${result.issuesExcelPath}`);
  }
  if (result.proposalMarkdownPath) {
    console.log(`   💼 Propuesta Comercial    : ${result.proposalMarkdownPath}`);
  }
  if (result.summaryMarkdownPath) {
    console.log(`   📝 Resumen (.md)          : ${result.summaryMarkdownPath}`);
    console.log(`   🧾 Resumen (.json)        : ${result.summaryJsonPath}`);
  }
  console.log("=".repeat(70) + "\n");
}

function parseInputMeetingUrl(args: string[]): string | null {
  const candidate = args.find((a) =>
    a.startsWith("http://") ||
    a.startsWith("https://") ||
    a.includes("meet.google.com") ||
    a.includes("teams.microsoft.com") ||
    /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(a)
  );

  if (!candidate) return null;

  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return candidate;
  }
  if (candidate.includes("meet.google.com") || candidate.includes("teams.microsoft.com")) {
    return `https://${candidate.replace(/^https?:\/\//, "")}`;
  }
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(candidate)) {
    return `https://meet.google.com/${candidate}`;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const detectedUrl = parseInputMeetingUrl(args);
  const isHeadless = args.includes("--headless");
  const isVisible = !isHeadless;
  const isLiveExplicit = args.includes("--live");

  // Si se pasa una URL real o el flag --live
  const isLive = isLiveExplicit || (Boolean(detectedUrl) && !detectedUrl?.includes("abc-defg-hij"));
  const targetUrl = detectedUrl || "https://meet.google.com/abc-defg-hij";

  // Si se pasa un archivo local con transcripción
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = args[fileIdx + 1]!;
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf-8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const parsedUtterances: ExtractedUtterance[] = lines.map((line, idx) => {
        const parts = line.split(":");
        const name = parts.length > 1 ? parts[0]!.trim() : `Participante ${idx + 1}`;
        const content = parts.length > 1 ? parts.slice(1).join(":").trim() : line.trim();
        return {
          speakerName: name,
          content,
          timestamp: `00:${idx.toString().padStart(2, "0")}`,
          platform: "LOCAL_FEED"
        };
      });
      await runAutonomousBot(targetUrl, false, false, parsedUtterances);
      return;
    }
  }

  await runAutonomousBot(targetUrl, isLive, isVisible);
}

main().catch((err) => {
  console.error("Error en Algorithm Manager Bot:", err);
  process.exit(1);
});
