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
  const repoCount = report.repositories.length;
  const layoutStr = formatLayoutSpanish(report.layout);
  const ver = report.verification.verified;
  const unc = report.verification.unconfirmed;
  const disc = report.verification.discarded;
  const calls = report.llmCalls;

  return `${repoCount} repositorio(s) · ${layoutStr} · ${ver} datos verificados · ${unc} sin confirmar · ${disc} descartados por falta de evidencia · ${calls} llamadas a la IA`;
}

interface ContextScanReportProps {
  report: ProjectContextScanReportDto;
}

export const ContextScanReport: React.FC<ContextScanReportProps> = ({ report }) => {
  const [accordionOpen, setAccordionOpen] = useState(false);

  const hasIssues = report.notFullyRead.length > 0 || report.verification.discarded > 0;
  const alertSeverity = hasIssues ? "warning" : "success";
  const summaryText = buildScanSummaryText(report);

  return (
    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert severity={alertSeverity}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {summaryText}
        </Typography>
      </Alert>

      {report.redactions > 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          <Typography variant="caption">
            Se ocultaron {report.redactions} posibles secretos antes de enviar.
          </Typography>
        </Alert>
      )}

      {report.notFullyRead.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "warning.main", display: "block", mb: 0.5 }}>
            Estos archivos no se leyeron completos:
          </Typography>
          <List dense disablePadding>
            {report.readLog
              .filter((log) => log.status !== "complete")
              .map((log) => {
                const statusStr =
                  log.status === "sections"
                    ? `por secciones (${log.sections || 0} partes)`
                    : `omitido${log.reason ? ` — ${log.reason}` : ""}`;
                return (
                  <ListItem key={log.path} disableGutters sx={{ py: 0.25 }}>
                    <ListItemText
                      primaryTypographyProps={{ variant: "caption", fontFamily: "monospace" }}
                      primary={`${log.path}: ${statusStr}`}
                    />
                  </ListItem>
                );
              })}
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
