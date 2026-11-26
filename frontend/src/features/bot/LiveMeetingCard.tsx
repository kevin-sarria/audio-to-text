import React, { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { Stop as StopIcon, Videocam as JoinIcon } from "@mui/icons-material";
import { useBotSession } from "./useBotSession.js";
import { STEPS, canJoin, describeState, stepIndexFor } from "./botSessionView.js";

export const LiveMeetingCard: React.FC = () => {
  const { session, error, join, leave, active } = useBotSession();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const state = session?.state ?? "IDLE";
  const info = describeState(state);
  const step = stepIndexFor(state);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Reunión en vivo</Typography>
        <Chip size="small" label={info.label} color={info.color} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pega el enlace de Google Meet o Microsoft Teams y el bot entrará a la llamada. Al terminar, la reunión aparece en tu biblioteca.
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Enlace de la reunión"
          placeholder="https://meet.google.com/abc-defg-hij"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={active}
        />
        {active ? (
          <Button
            color="error"
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <StopIcon />}
            disabled={busy || state === "ENDING"}
            onClick={() => run(leave)}
          >
            Terminar
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <JoinIcon />}
            disabled={busy || !canJoin(state, url)}
            onClick={() => run(() => join(url))}
          >
            Entrar
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {session && state !== "IDLE" && (
        <>
          {step >= 0 && (
            <Stepper activeStep={step} alternativeLabel sx={{ mb: 2 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}
          <Alert severity={state === "FAILED" ? "error" : state === "NEEDS_LOGIN" ? "warning" : "info"}>
            {session.error ?? session.message}
          </Alert>
          {state === "ENDED" && session.result && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {session.result.utterances} intervenciones captadas
              {session.result.imported > 0 ? " · guardada en la biblioteca" : ""}.
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
};
