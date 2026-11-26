import React, { useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, TextField, Typography } from "@mui/material";
import type { BotPlatform } from "@audio-to-text/shared";
import { parseDomainInput } from "./botSessionView.js";

interface Props {
  platforms: BotPlatform[];
  domains: string[];
  onChange: (next: { platforms: BotPlatform[]; domains: string[] }) => void;
}

const PLATFORM_LABELS: Array<{ id: BotPlatform; label: string }> = [
  { id: "GOOGLE_MEET", label: "Google Meet" },
  { id: "MICROSOFT_TEAMS", label: "Microsoft Teams" }
];

export const AllowedSitesEditor: React.FC<Props> = ({ platforms, domains, onChange }) => {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  const togglePlatform = (id: BotPlatform, on: boolean) =>
    onChange({ platforms: on ? [...platforms, id] : platforms.filter((p) => p !== id), domains });

  const addDomain = () => {
    const d = parseDomainInput(text);
    if (!d) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText("");
    if (!domains.includes(d)) onChange({ platforms, domains: [...domains, d] });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Plataformas permitidas</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}>
        {PLATFORM_LABELS.map((p) => (
          <FormControlLabel
            key={p.id}
            control={<Checkbox checked={platforms.includes(p.id)} onChange={(e) => togglePlatform(p.id, e.target.checked)} />}
            label={p.label}
          />
        ))}
        <FormControlLabel control={<Checkbox disabled />} label="Zoom (próximamente)" />
      </Box>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Dominios permitidos</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        {domains.map((d) => (
          <Chip key={d} label={d} onDelete={() => onChange({ platforms, domains: domains.filter((x) => x !== d) })} />
        ))}
        {domains.length === 0 && (
          <Typography variant="caption" color="warning.main">
            Sin dominios permitidos: el bot rechazará cualquier enlace.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          size="small"
          label="Añadir dominio"
          placeholder="miempresa.teams.microsoft.com"
          value={text}
          error={invalid}
          helperText={invalid ? "Escribe un dominio válido, por ejemplo meet.google.com" : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addDomain(); }}
        />
        <Button variant="outlined" onClick={addDomain}>Añadir</Button>
      </Box>
    </Box>
  );
};
