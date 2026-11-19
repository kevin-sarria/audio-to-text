import React from "react";
import {
  Alert,
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button
} from "@mui/material";
import {
  WarningAmber as WarningIcon,
  ExpandMore as ExpandMoreIcon
} from "@mui/icons-material";
import { formatHumanFriendlyError } from "./MeetingAnalysisMarkdown.js";

interface AnalysisErrorAlertProps {
  errorMsg: string;
  onRetryWithGoogle: () => void;
  onOpenConfig: () => void;
}

export const AnalysisErrorAlert: React.FC<AnalysisErrorAlertProps> = ({
  errorMsg,
  onRetryWithGoogle,
  onOpenConfig
}) => {
  const friendly = formatHumanFriendlyError(errorMsg);

  return (
    <Alert
      severity="warning"
      icon={<WarningIcon fontSize="medium" />}
      sx={{
        mb: 3,
        borderRadius: 2,
        p: 2,
        "& .MuiAlert-message": { width: "100%", overflow: "hidden" }
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {friendly.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {friendly.description}
        </Typography>

        {friendly.technical && (
          <Accordion
            disableGutters
            elevation={0}
            sx={{
              bgcolor: "rgba(0, 0, 0, 0.04)",
              borderRadius: 1,
              mt: 0.5,
              "&:before": { display: "none" }
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, px: 1.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                Ver detalles técnicos del error
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, px: 1.5, pb: 1.5 }}>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  bgcolor: "background.paper",
                  borderRadius: 1,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 160
                }}
              >
                {friendly.technical}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, pt: 1 }}>
          <Button
            color="warning"
            size="small"
            variant="contained"
            sx={{ textTransform: "none", whiteSpace: "nowrap" }}
            onClick={onRetryWithGoogle}
          >
            Reintentar con Google Pro (Rápido y Gratis)
          </Button>
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            sx={{ textTransform: "none", whiteSpace: "nowrap" }}
            onClick={onOpenConfig}
          >
            Ajustar Contexto y Proveedor
          </Button>
        </Box>
      </Box>
    </Alert>
  );
};
