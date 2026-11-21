import React, { useState } from "react";
import {
  Alert,
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { ProjectContextScanReportDto } from "@audio-to-text/shared";

export function formatLayoutSpanish(layout: ProjectContextScanReportDto["layout"]): string {
  switch (layout) {
    case "multi-repo":
      return "repositorios separados";
    case "monorepo":
      return "monorepo";
    case "single-repo":
      return "un solo repositorio";
    case "no-git":
      return "sin git";
  }
}

export function buildScanSummaryText(report: ProjectContextScanReportDto): string {
  const repoCount = report.repositories.filter((r) => r.kind !== "submodulo").length;
  const layoutStr = formatLayoutSpanish(report.layout);
  const { verified, unconfirmed, discarded, deduced } = report.verification;
  const parts = [
    `${repoCount} repositorio(s)`,
    layoutStr,
    `${verified} confirmados con cita`,
    deduced ? `${deduced} deducidos` : null,
    `${unconfirmed} sin confirmar`,
    `${discarded} descartados por falta de evidencia`,
    `${report.llmCalls} llamadas a la IA (${report.model})`
  ];
  return parts.filter(Boolean).join(" · ");
}

function readStatusText(log: ProjectContextScanReportDto["readLog"][number]): string {
  if (log.status === "sections") return `por secciones (${log.sections || 0} partes)`;
  if (log.status === "duplicate") return `${log.reason ?? "idéntico a otro documento"} (se leyó una vez)`;
  return `omitido${log.reason ? ` — ${log.reason}` : ""}`;
}

const FOLDER_KIND_TEXT: Record<string, string> = {
  "copia-de-trabajo": "copia de trabajo",
  "clon-duplicado": "clon duplicado",
  "sin-git": "carpeta sin git"
};

interface ContextScanReportProps {
  report: ProjectContextScanReportDto;
}

export const ContextScanReport: React.FC<ContextScanReportProps> = ({ report }) => {
  const [accordionOpen, setAccordionOpen] = useState(false);

  const hasIssues = report.notFullyRead.length > 0 || report.verification.discarded > 0;
  const nonCompleteReads = report.readLog.filter((log) => log.status !== "complete");
  const otherFolders = report.otherFolders ?? [];
  const alertSeverity = hasIssues ? "warning" : "success";
  const summaryText = buildScanSummaryText(report);

  return (
    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert severity={alertSeverity}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {summaryText}
        </Typography>
      </Alert>

      {report.requestedModel && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          <Typography variant="caption">
            Se pidió {report.requestedModel}, pero el proveedor usó {report.model}.
          </Typography>
        </Alert>
      )}

      {report.redactions > 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          <Typography variant="caption">
            Se ocultaron {report.redactions} posibles secretos antes de enviar.
          </Typography>
        </Alert>
      )}

      {nonCompleteReads.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "warning.main", display: "block", mb: 0.5 }}>
            Documentos que no se leyeron completos o que eran idénticos a otro:
          </Typography>
          <List dense disablePadding>
            {nonCompleteReads.map((log) => (
              <ListItem key={log.path} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primaryTypographyProps={{ variant: "caption", fontFamily: "monospace" }}
                  primary={`${log.path}: ${readStatusText(log)}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {otherFolders.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
            Carpetas que no se analizaron (no aportan tecnologías, comandos ni reglas):
          </Typography>
          <List dense disablePadding>
            {otherFolders.map((f) => (
              <ListItem key={f.path} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primaryTypographyProps={{ variant: "caption", fontFamily: "monospace" }}
                  primary={`${f.path}: ${FOLDER_KIND_TEXT[f.kind] ?? f.kind}${f.ownerPath ? ` de ${f.ownerPath}` : ""}${f.branch ? ` (rama ${f.branch})` : ""}${f.notes.length ? ` — ${f.notes.join("; ")}` : ""}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {report.openQuestions.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "info.main", display: "block", mb: 0.5 }}>
            Preguntas que no se pudieron resolver con el código — responde lo que sepas en el contexto:
          </Typography>
          <List dense disablePadding>
            {report.openQuestions.map((q, idx) => (
              <ListItem key={idx} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primaryTypographyProps={{ variant: "caption" }}
                  primary={`• ${q}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {report.discarded.length > 0 && (
        <Accordion
          expanded={accordionOpen}
          onChange={(_, expanded) => setAccordionOpen(expanded)}
          variant="outlined"
          sx={{ bgcolor: "background.paper" }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, py: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              Ver datos descartados por falta de evidencia ({report.discarded.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 1 }}>
            <List dense disablePadding>
              {report.discarded.map((d, idx) => (
                <ListItem key={idx} disableGutters sx={{ py: 0.5 }}>
                  <ListItemText
                    primaryTypographyProps={{ variant: "caption", color: "text.primary" }}
                    secondaryTypographyProps={{ variant: "caption", color: "error.main" }}
                    primary={`[${d.section}] ${d.dato}`}
                    secondary={`Motivo: ${d.reason} (fuente: ${d.fuente})`}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
};
