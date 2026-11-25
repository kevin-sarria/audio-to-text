import { MeetingSummary } from "../../domain/models/MeetingSummary.js";
import { formatOffset } from "../../domain/timeFormat.js";

const EMPTY = "_Sin elementos._";

function section<T>(title: string, items: T[], renderItem: (item: T) => string): string {
  const body = items.length > 0 ? items.map(renderItem).join("\n") : EMPTY;
  return `## ${title}\n\n${body}`;
}

export function renderSummaryMarkdown(summary: MeetingSummary, title = "Resumen de reunión"): string {
  const parts: string[] = [
    `# ${title}`,
    `_Generado: ${summary.generatedAt} · Sesión: ${summary.sessionId} · Idioma: ${summary.language}_`
  ];

  if (summary.note) parts.push(`> ⚠️ ${summary.note}`);

  parts.push(`## Resumen ejecutivo\n\n${summary.executiveSummary}`);

  parts.push(
    section("Puntos de acción", summary.actionItems, (a) => {
      const meta = [a.owner ? `Responsable: ${a.owner}` : "", a.dueDate ? `Fecha: ${a.dueDate}` : ""]
        .filter(Boolean)
        .join(" · ");
      const head = `- [ ] **${a.task}**${meta ? ` — ${meta}` : ""}`;
      return `${head}\n  > "${a.evidence}"`;
    })
  );

  parts.push(section("Decisiones", summary.decisions, (d) => `- ${d.text}\n  > "${d.evidence}"`));
  parts.push(section("Temas", summary.topics, (t) => `- **${t.title}**: ${t.summary}`));
  parts.push(
    section("Preguntas abiertas", summary.openQuestions, (q) =>
      `- ${q.text}${q.askedBy ? ` _(${q.askedBy})_` : ""}`
    )
  );
  parts.push(
    section(
      "Capítulos",
      summary.chapters,
      (c) => `- \`${formatOffset(c.startSec)}–${formatOffset(c.endSec)}\` ${c.title}`
    )
  );

  const rows = summary.participants.map(
    (p) => `| ${p.name} | ${formatOffset(p.speakingSeconds)} | ${p.speakingPercent}% |`
  );
  parts.push(
    `## Participantes\n\n${
      rows.length > 0
        ? ["| Participante | Tiempo de habla | % |", "|---|---|---|", ...rows].join("\n")
        : EMPTY
    }`
  );

  return parts.join("\n\n") + "\n";
}

export function renderConsoleExcerpt(summary: MeetingSummary): string {
  const lines = [
    `📝 ${summary.executiveSummary}`,
    `   ${summary.actionItems.length} puntos de acción · ${summary.decisions.length} decisiones · ${summary.topics.length} temas · ${summary.chapters.length} capítulos`
  ];
  for (const a of summary.actionItems.slice(0, 5)) {
    lines.push(`   • ${a.task}${a.owner ? ` (${a.owner})` : ""}`);
  }
  if (summary.note) lines.push(`   ⚠️ ${summary.note}`);
  return lines.join("\n");
}
