import React from "react";
import { Alert, Box, Checkbox, Chip, LinearProgress, Link, Paper, Snackbar, Typography } from "@mui/material";
import type { MeetingSummaryDto } from "@audio-to-text/shared";
import { formatSeconds } from "./summaryHelpers.js";

interface MeetingSummaryTabProps {
  summary: MeetingSummaryDto;
  /** Tareas con una petición en curso: su casilla queda deshabilitada. */
  pendingItemIds?: ReadonlySet<string>;
  toggleError?: string | null;
  onDismissError?: () => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  /** Salta a la transcripción en el segmento que contiene esta cita. */
  onOpenQuote: (quote: string) => void;
  /** Salta a la transcripción en el segundo indicado. */
  onOpenChapter: (startSec: number) => void;
}

const Section: React.FC<{ title: string; empty?: boolean; children: React.ReactNode }> = ({ title, empty, children }) => (
  <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
      {title}
    </Typography>
    {empty ? (
      <Typography variant="body2" color="text.secondary">
        Sin elementos.
      </Typography>
    ) : (
      children
    )}
  </Paper>
);

const Quote: React.FC<{ text: string; onOpen: (quote: string) => void }> = ({ text, onOpen }) => (
  <Link
    component="button"
    type="button"
    underline="hover"
    onClick={() => onOpen(text)}
    sx={{ display: "block", textAlign: "left", fontStyle: "italic", color: "text.secondary", fontSize: "0.85rem", mt: 0.25 }}
  >
    “{text}”
  </Link>
);

export const MeetingSummaryTab: React.FC<MeetingSummaryTabProps> = ({ summary, pendingItemIds, toggleError, onDismissError, onToggleItem, onOpenQuote, onOpenChapter }) => {
  return (
    <Box>
      {summary.note && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {summary.note}
        </Alert>
      )}

      <Section title="Resumen ejecutivo">
        <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
          {summary.executiveSummary}
        </Typography>
      </Section>

      <Section title={`Puntos de acción (${summary.actionItems.length})`} empty={summary.actionItems.length === 0}>
        {summary.actionItems.map((item) => (
          <Box key={item.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
            <Checkbox
              checked={item.done}
              disabled={pendingItemIds?.has(item.id) ?? false}
              onChange={(e) => onToggleItem(item.id, e.target.checked)}
              inputProps={{ "aria-label": `Marcar como hecha: ${item.task}` }}
              sx={{ p: 0.5 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" fontWeight={600} sx={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                {item.task}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", my: 0.5 }}>
                {item.owner && <Chip size="small" label={`Responsable: ${item.owner}`} />}
                {item.dueDate && <Chip size="small" variant="outlined" label={`Fecha: ${item.dueDate}`} />}
              </Box>
              <Quote text={item.evidence} onOpen={onOpenQuote} />
            </Box>
          </Box>
        ))}
      </Section>

      <Section title="Decisiones" empty={summary.decisions.length === 0}>
        {summary.decisions.map((d, i) => (
          <Box key={i} sx={{ mb: 1.5 }}>
            <Typography variant="body1">{d.text}</Typography>
            <Quote text={d.evidence} onOpen={onOpenQuote} />
          </Box>
        ))}
      </Section>

      <Section title="Temas" empty={summary.topics.length === 0}>
        {summary.topics.map((t, i) => (
          <Typography key={i} variant="body2" sx={{ mb: 1 }}>
            <strong>{t.title}:</strong> {t.summary}
          </Typography>
        ))}
      </Section>

      <Section title="Preguntas abiertas" empty={summary.openQuestions.length === 0}>
        {summary.openQuestions.map((q, i) => (
          <Typography key={i} variant="body2" sx={{ mb: 1 }}>
            {q.text}
            {q.askedBy ? ` (${q.askedBy})` : ""}
          </Typography>
        ))}
      </Section>

      <Section title="Participantes" empty={summary.participants.length === 0}>
        {summary.participants.map((p) => (
          <Box key={p.name} sx={{ mb: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2" fontWeight={600}>
                {p.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatSeconds(p.speakingSeconds)} · {p.speakingPercent}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, p.speakingPercent))} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        ))}
      </Section>

      <Section title="Capítulos" empty={summary.chapters.length === 0}>
        {summary.chapters.map((c, i) => (
          <Link
            key={i}
            component="button"
            type="button"
            underline="hover"
            onClick={() => onOpenChapter(c.startSec)}
            sx={{ display: "block", textAlign: "left", mb: 0.75 }}
          >
            <strong>
              {formatSeconds(c.startSec)}–{formatSeconds(c.endSec)}
            </strong>{" "}
            {c.title}
          </Link>
        ))}
      </Section>
      <Snackbar open={Boolean(toggleError)} autoHideDuration={6000} onClose={() => onDismissError?.()}>
        <Alert severity="error" onClose={() => onDismissError?.()} sx={{ width: "100%" }}>
          {toggleError}
        </Alert>
      </Snackbar>
    </Box>
  );
};
