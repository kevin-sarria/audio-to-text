import React from "react";
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Paper
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as ContentCopyIcon,
  Check as CheckIcon,
  SmartToy as SmartToyIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  AccessTime as TimeIcon
} from "@mui/icons-material";
import { DevIssueDto } from "@audio-to-text/shared";
import {
  getRepoChipColor,
  getRepoLabel,
  getTypeChipColor,
  getPriorityChipColor
} from "./MeetingAnalysisMarkdown.js";

interface DevIssueCardProps {
  issue: DevIssueDto;
  isCopied: boolean;
  onCopyPrompt: (prompt: string, id: string) => void;
}

export const DevIssueCard: React.FC<DevIssueCardProps> = ({
  issue,
  isCopied,
  onCopyPrompt
}) => {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        transition: "box-shadow 0.2s",
        "&:hover": {
          boxShadow: 2
        }
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1, mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              {issue.id}
            </Typography>
            <Chip
              label={getRepoLabel(issue.repo)}
              size="small"
              color={getRepoChipColor(issue.repo)}
              sx={{ fontWeight: 700, fontSize: "0.75rem" }}
            />
            <Chip
              label={issue.type.toUpperCase()}
              size="small"
              color={getTypeChipColor(issue.type)}
              sx={{ fontWeight: 600, fontSize: "0.7rem" }}
            />
            <Chip
              label={`Prioridad: ${issue.priority}`}
              size="small"
              color={getPriorityChipColor(issue.priority)}
              variant="outlined"
              sx={{ fontSize: "0.7rem" }}
            />
            <Chip
              label={issue.component}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.7rem" }}
            />
            {issue.estimation && (
              <Chip
                icon={<TimeIcon sx={{ fontSize: "14px !important" }} />}
                label={issue.estimation.text || `Total: ${issue.estimation.totalHours}h`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.72rem", fontWeight: 600 }}
              />
            )}
          </Box>
        </Box>

        <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 1 }}>
          {issue.title}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-line" }}>
          {issue.description}
        </Typography>

        {/* Preguntas Abiertas del Issue */}
        {issue.openQuestions &&
          issue.openQuestions.length > 0 &&
          issue.openQuestions[0] !== "Ninguna" && (
            <Alert severity="warning" sx={{ mb: 2, py: 0.5, px: 2, borderRadius: 2 }}>
              <Typography variant="caption" fontWeight={700} display="block">
                Preguntas abiertas para este issue:
              </Typography>
              {issue.openQuestions.map((q, qIdx) => (
                <Typography key={qIdx} variant="caption" display="block">
                  • {q}
                </Typography>
              ))}
            </Alert>
          )}

        {/* Dependencias entre PRs / Funcionales */}
        {issue.dependencies &&
          issue.dependencies.length > 0 &&
          issue.dependencies[0] !== "Ninguna" && (
            <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Dependencias:
              </Typography>
              {issue.dependencies.map((dep, dIdx) => (
                <Chip key={dIdx} label={dep} size="small" variant="outlined" color="primary" sx={{ fontSize: "0.7rem" }} />
              ))}
            </Box>
          )}

        {/* Flujo de PR */}
        {issue.prWorkflow && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              <strong>Flujo de PR:</strong> {issue.prWorkflow}
            </Typography>
          </Box>
        )}

        {/* Archivos sugeridos (verificar en repo) */}
        {issue.expectedFiles && issue.expectedFiles.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
              Archivos sugeridos (verificar en el repo):
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
              {issue.expectedFiles.map((file, fIdx) => (
                <Chip
                  key={fIdx}
                  label={file}
                  size="small"
                  sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                />
              ))}
            </Box>
          </Box>
        )}

        {issue.acceptanceCriteria.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
              Criterios de Aceptación:
            </Typography>
            <Box sx={{ mt: 0.5, pl: 1 }}>
              {issue.acceptanceCriteria.map((crit, cIdx) => (
                <Box key={cIdx} sx={{ display: "flex", alignItems: "center", gap: 0.8, my: 0.3 }}>
                  <CheckCircleOutlineIcon color="action" sx={{ fontSize: 16 }} />
                  <Typography variant="body2">
                    {crit.includes("[Supuesto]") ? (
                      <>
                        <Chip label="Supuesto" size="small" color="warning" variant="outlined" sx={{ mr: 0.8, height: 18, fontSize: "0.65rem" }} />
                        {crit.replace("[Supuesto]", "").trim()}
                      </>
                    ) : (
                      crit
                    )}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Acordeón con el Prompt para el Agente */}
        <Accordion
          variant="outlined"
          sx={{
            borderRadius: "8px !important",
            bgcolor: "background.default",
            mt: 1.5,
            "&:before": { display: "none" }
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <SmartToyIcon color="primary" sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={600}>
                Prompt Optimizado para Agente de IA ({issue.repo ? `Repo: ${getRepoLabel(issue.repo)}` : "Cursor / Claude Code / Antigravity"})
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={isCopied ? <CheckIcon /> : <ContentCopyIcon />}
                onClick={() => onCopyPrompt(issue.agentPrompt, issue.id)}
                color={isCopied ? "success" : "primary"}
              >
                {isCopied ? "Copiado" : "Copiar Prompt"}
              </Button>
            </Box>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderRadius: 2,
                overflowX: "auto"
              }}
            >
              <Typography
                component="pre"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0
                }}
              >
                {issue.agentPrompt}
              </Typography>
            </Paper>
          </AccordionDetails>
        </Accordion>
      </CardContent>
    </Card>
  );
};
