import React, { useState } from "react";
import { Box, Alert, Collapse, Typography, IconButton } from "@mui/material";
import {
  WarningAmber as WarningIcon,
  ErrorOutline as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from "@mui/icons-material";
import type { AnalysisGenerationMetaDto } from "@audio-to-text/shared";

interface ValidationNoticesProps {
  meta?: AnalysisGenerationMetaDto | null;
}

export const ValidationNotices: React.FC<ValidationNoticesProps> = ({ meta }) => {
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  if (!meta) return null;

  const hasPartial = Boolean(meta.partialAnalysis);
  const warnings = meta.validationWarnings || [];
  const errors = meta.validationErrors || [];

  if (!hasPartial && warnings.length === 0 && errors.length === 0) {
    return null;
  }

  const warningsLabel =
    warnings.length === 1 ? "1 aviso para revisar" : `${warnings.length} avisos para revisar`;
  const errorsLabel =
    errors.length === 1
      ? "1 error que el modelo no corrigió"
      : `${errors.length} errores que el modelo no corrigió`;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2.5 }}>
      {hasPartial && (
        <Alert
          severity="warning"
          icon={<WarningIcon fontSize="small" />}
          sx={{ py: 0.5, px: 2, borderRadius: 2 }}
        >
          <Typography variant="body2" fontWeight={500}>
            Análisis parcial: la transcripción contiene tramos sin audio o incompletos.
          </Typography>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert
          severity="warning"
          icon={<WarningIcon fontSize="small" />}
          sx={{ py: 0.5, px: 2, borderRadius: 2 }}
          action={
            <IconButton
              size="small"
              color="inherit"
              onClick={() => setWarningsOpen(!warningsOpen)}
              aria-label="expandir avisos"
            >
              {warningsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          }
        >
          <Box
            sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
            onClick={() => setWarningsOpen(!warningsOpen)}
          >
            <Typography variant="body2" fontWeight={600}>
              {warningsLabel}
            </Typography>
          </Box>
          <Collapse in={warningsOpen}>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, "& li": { mb: 0.5 } }}>
              {warnings.map((w: string, idx: number) => (
                <Typography component="li" variant="body2" key={idx}>
                  {w}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Alert>
      )}

      {errors.length > 0 && (
        <Alert
          severity="error"
          icon={<ErrorIcon fontSize="small" />}
          sx={{ py: 0.5, px: 2, borderRadius: 2 }}
          action={
            <IconButton
              size="small"
              color="inherit"
              onClick={() => setErrorsOpen(!errorsOpen)}
              aria-label="expandir errores"
            >
              {errorsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          }
        >
          <Box
            sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
            onClick={() => setErrorsOpen(!errorsOpen)}
          >
            <Typography variant="body2" fontWeight={600}>
              {errorsLabel}
            </Typography>
          </Box>
          <Collapse in={errorsOpen}>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, "& li": { mb: 0.5 } }}>
              {errors.map((e: string, idx: number) => (
                <Typography component="li" variant="body2" key={idx}>
                  {e}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Alert>
      )}
    </Box>
  );
};
