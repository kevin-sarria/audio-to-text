import React, { useEffect, useState } from "react";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { api } from "../../lib/api.js";
import { EMPTY_FILTERS, hasActiveFilters, type HistoryFilters } from "./historyFilters.js";

interface HistoryFiltersBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
}

export const HistoryFiltersBar: React.FC<HistoryFiltersBarProps> = ({ filters, onChange }) => {
  const [participants, setParticipants] = useState<string[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .get<{ success: boolean; data: string[] }>("/desktop/library/participants")
      .then((res) => res.success && setParticipants(res.data))
      .catch(() => {});
    api
      .get<{ success: boolean; data: { id: string; name: string }[] }>("/project-folders")
      .then((res) => res.success && Array.isArray(res.data) && setFolders(res.data.map((f) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, []);

  const set = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch });

  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel id="filtro-origen">Origen</InputLabel>
        <Select labelId="filtro-origen" label="Origen" value={filters.source} onChange={(e) => set({ source: e.target.value as HistoryFilters["source"] })}>
          <MenuItem value="ALL">Todos</MenuItem>
          <MenuItem value="AUDIO">Audio</MenuItem>
          <MenuItem value="BOT">Bot</MenuItem>
        </Select>
      </FormControl>

      <TextField size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
      <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(e) => set({ to: e.target.value })} />

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="filtro-participante">Participante</InputLabel>
        <Select labelId="filtro-participante" label="Participante" value={filters.participant} onChange={(e) => set({ participant: e.target.value })}>
          <MenuItem value="">Todos</MenuItem>
          {participants.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {folders.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-carpeta">Carpeta</InputLabel>
          <Select labelId="filtro-carpeta" label="Carpeta" value={filters.folderId} onChange={(e) => set({ folderId: e.target.value })}>
            <MenuItem value="">Todas</MenuItem>
            {folders.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {hasActiveFilters(filters) && (
        <Button size="small" onClick={() => onChange(EMPTY_FILTERS)}>
          Limpiar filtros
        </Button>
      )}
    </Box>
  );
};
