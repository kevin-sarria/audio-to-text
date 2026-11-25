import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import { HistoryList } from "../features/history/HistoryList.js";
import { HistorySearchBar } from "../features/history/HistorySearchBar.js";
import { useDebouncedValue } from "../features/history/useDebouncedValue.js";
import { normalizeQueryInput } from "../features/history/searchHelpers.js";
import { ImportBotMeetingsButton } from "../features/history/ImportBotMeetingsButton.js";
import { HistoryFiltersBar } from "../features/history/HistoryFiltersBar.js";
import { EMPTY_FILTERS, type HistoryFilters } from "../features/history/historyFilters.js";
import { isDesktopApp } from "../lib/runtime.js";

interface HistoryPageProps {
  onSelectSession: (sessionId: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onSelectSession }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const query = normalizeQueryInput(useDebouncedValue(searchInput, 300));

  return (
    <Box>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Historial de Transcripciones
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Accede a tus transcripciones procesadas, edita nombres de hablantes o descarga en diversos formatos.
          </Typography>
        </Box>
        {isDesktopApp() && <ImportBotMeetingsButton onImported={() => setRefreshKey((k) => k + 1)} />}
      </Box>

      {isDesktopApp() && (
        <Box sx={{ mb: 2 }}>
          <HistorySearchBar value={searchInput} onChange={setSearchInput} />
        </Box>
      )}

      {isDesktopApp() && <HistoryFiltersBar filters={filters} onChange={setFilters} />}

      <HistoryList onSelectSession={onSelectSession} refreshKey={refreshKey} query={query} filters={filters} />
    </Box>
  );
};
