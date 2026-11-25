import React from "react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Clear as ClearIcon, Search as SearchIcon } from "@mui/icons-material";

interface HistorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const HistorySearchBar: React.FC<HistorySearchBarProps> = ({ value, onChange }) => (
  <TextField
    fullWidth
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Buscar en transcripciones y resúmenes…"
    helperText={value.trim().length === 1 ? "Escribe al menos 2 letras para buscar." : undefined}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <SearchIcon fontSize="small" />
        </InputAdornment>
      ),
      endAdornment: value ? (
        <InputAdornment position="end">
          <IconButton size="small" aria-label="Borrar búsqueda" onClick={() => onChange("")}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </InputAdornment>
      ) : undefined
    }}
  />
);
