import React from "react";
import { Paper, Typography, Box, Chip } from "@mui/material";
import {
  CheckCircle as ResolvedIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  PendingActions as InProgressIcon,
  HelpOutline as QuestionIcon,
  WarningAmber as WarningIcon,
  BookmarkBorder as BacklogIcon
} from "@mui/icons-material";
import { MeetingAnalysisDto } from "@audio-to-text/shared";

interface MeetingClassifiedSectionProps {
  analysis: MeetingAnalysisDto;
}

export const MeetingClassifiedSection: React.FC<MeetingClassifiedSectionProps> = ({ analysis }) => {
  return (
    <>
      {/* 1. Ya Resuelto / Cerrado */}
      {analysis.alreadyResolved && analysis.alreadyResolved.length > 0 && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            bgcolor: "success.50",
            border: "1px solid",
            borderColor: "success.200"
          }}
        >
          <Typography
            variant="h6"
            fontWeight={700}
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1, color: "success.900" }}
          >
            <ResolvedIcon color="success" /> Ya Resuelto / Cerrado en la Reunión
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Puntos tratados que se cerraron o ya están completados según la transcripción. No requieren crear nuevas issues.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {analysis.alreadyResolved.map((item, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <CheckCircleOutlineIcon color="success" fontSize="small" sx={{ mt: "3px" }} />
                <Typography variant="body2" fontWeight={500}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* 2. En Curso (Asignado / Sin Duplicar) */}
      {analysis.inProgress && analysis.inProgress.length > 0 && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            bgcolor: "info.50",
            border: "1px solid",
            borderColor: "info.200"
          }}
        >
          <Typography
            variant="h6"
            fontWeight={700}
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1, color: "info.900" }}
          >
            <InProgressIcon color="info" /> En Curso (Asignado a un Miembro del Equipo)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Requerimientos que alguien ya está trabajando. Solo se crearon tareas de integración o partes faltantes.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {analysis.inProgress.map((item, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Chip
                  label="En Progreso"
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 22 }}
                />
                <Typography variant="body2">{item}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* 3. Preguntas Abiertas Globales y Ambigüedades */}
      {analysis.globalOpenQuestions && analysis.globalOpenQuestions.length > 0 && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            bgcolor: "warning.50",
            border: "1px solid",
            borderColor: "warning.200"
          }}
        >
          <Typography
            variant="h6"
            fontWeight={700}
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.900" }}
          >
            <QuestionIcon color="warning" /> Preguntas Abiertas y Términos por Confirmar
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ambigüedades, fragmentos de audio dudosos o decisiones de negocio pendientes de confirmar antes de implementar.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {analysis.globalOpenQuestions.map((q, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <WarningIcon color="warning" fontSize="small" sx={{ mt: "3px" }} />
                <Typography variant="body2">{q}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* 4. Backlog */}
      {analysis.backlog && analysis.backlog.length > 0 && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            bgcolor: "grey.50",
            border: "1px solid",
            borderColor: "divider"
          }}
        >
          <Typography
            variant="h6"
            fontWeight={700}
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <BacklogIcon color="action" /> Backlog de la Reunión (No Bloqueante / Próximas Etapas)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Puntos acordados como mejoras a futuro o requerimientos diferidos sin prompt de implementación.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {analysis.backlog.map((item, idx) => (
              <Box key={idx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Chip
                  label="Backlog"
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 22 }}
                />
                <Typography variant="body2">{item}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </>
  );
};
