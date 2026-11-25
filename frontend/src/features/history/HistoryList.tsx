import React, { useEffect, useRef } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  CircularProgress,
  Pagination,
  Paper
} from "@mui/material";
import { Delete as DeleteIcon, OpenInNew as OpenIcon, Folder as FolderIcon } from "@mui/icons-material";
import { SessionStatus } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";
import { isDesktopApp } from "../../lib/runtime.js";
import { splitHighlight } from "./searchHelpers.js";
import { buildLibraryParams, EMPTY_FILTERS, hasActiveFilters, type HistoryFilters } from "./historyFilters.js";

interface HistoryListProps {
  onSelectSession: (id: string) => void;
  refreshKey?: number;
  query?: string;
  filters?: HistoryFilters;
}

const statusColorMap: Record<SessionStatus, "default" | "primary" | "success" | "error"> = {
  [SessionStatus.PENDING]: "default",
  [SessionStatus.PROCESSING]: "primary",
  [SessionStatus.COMPLETED]: "success",
  [SessionStatus.FAILED]: "error"
};

export const HistoryList: React.FC<HistoryListProps> = ({ onSelectSession, refreshKey, query, filters = EMPTY_FILTERS }) => {
  const {
    sessions,
    total,
    page,
    limit,
    isLoading,
    setSessions,
    setPage,
    setIsLoading,
    removeSession
  } = useAppStore();

  const requestCounter = useRef(0);
  const filtersKey = JSON.stringify(filters);

  const fetchHistory = async (targetPage: number) => {
    const requestId = ++requestCounter.current;
    setIsLoading(true);
    try {
      const endpoint = isDesktopApp() ? "/desktop/library/sessions" : "/sessions";
      const response = await api.get<any>(endpoint, {
        params: isDesktopApp() ? buildLibraryParams(filters, query, targetPage, limit) : { page: targetPage, limit }
      });
      // descarta respuestas de una búsqueda anterior que llegan tarde
      if (requestId !== requestCounter.current) return;
      if (response.success && response.data) {
        setSessions(response.data, response.meta.total);
      }
    } catch (err) {
      console.error("Error al cargar historial:", err);
    } finally {
      if (requestId === requestCounter.current) setIsLoading(false);
    }
  };

  // al cambiar la búsqueda se vuelve a la primera página
  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [query, filtersKey]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, refreshKey, query, filtersKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Seguro que deseas eliminar esta transcripción?")) return;

    try {
      await api.delete(`/sessions/${id}`);
      removeSession(id);
    } catch (err) {
      console.error("Error al eliminar sesión:", err);
    }
  };

  if (isLoading && sessions.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
        {hasActiveFilters(filters) || query
          ? query
            ? `Sin resultados para «${query}».`
            : "No hay resultados con estos filtros."
          : isDesktopApp()
          ? "No tienes transcripciones ni reuniones del bot. Sube un archivo, o ejecuta el bot (`npm run bot`) y pulsa «Importar reuniones del bot»."
          : "No tienes transcripciones previas. ¡Sube un archivo para comenzar!"}
      </Typography>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <Box sx={{ width: "100%", my: 2 }}>
      <List disablePadding>
        {sessions.map((sess) => (
          <Paper
            key={sess.id}
            elevation={1}
            sx={{
              mb: 1.5,
              borderRadius: 2,
              cursor: "pointer",
              transition: "transform 0.1s ease, box-shadow 0.1s ease",
              "&:hover": {
                transform: "translateY(-1px)",
                boxShadow: 2
              }
            }}
            onClick={() => onSelectSession(sess.id)}
          >
            <ListItem
              secondaryAction={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <IconButton
                    edge="end"
                    aria-label="Abrir sesión"
                    onClick={() => onSelectSession(sess.id)}
                  >
                    <OpenIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="Eliminar sesión"
                    color="error"
                    onClick={(e) => handleDelete(sess.id, e)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {sess.originalFileName}
                    </Typography>
                    <Chip
                      size="small"
                      label={sess.status}
                      color={statusColorMap[sess.status as SessionStatus] || "default"}
                    />
                    {sess.source === "BOT" && (
                      <Chip size="small" label="Bot" color="secondary" variant="outlined" sx={{ fontSize: "0.75rem", height: 22 }} />
                    )}
                    {sess.source === "AUDIO" && (
                      <Chip size="small" label="Audio" variant="outlined" sx={{ fontSize: "0.75rem", height: 22 }} />
                    )}
                    {sess.projectFolderId && (
                      <Chip
                        size="small"
                        icon={<FolderIcon sx={{ fontSize: "14px !important" }} />}
                        label="En Carpeta"
                        variant="outlined"
                        color="primary"
                        sx={{ fontSize: "0.75rem", height: 22 }}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                      Fecha: {new Date(sess.occurredAt ?? sess.createdAt).toLocaleDateString()} | Duración:{" "}
                      {sess.durationSeconds ? `${sess.durationSeconds}s` : "N/A"}
                    </Typography>
                    {(sess as any).snippet && (
                      <Typography variant="body2" component="span" sx={{ display: "block", mt: 0.5 }}>
                        {splitHighlight((sess as any).snippet).map((part, i) =>
                          part.highlight ? (
                            <Box key={i} component="mark" sx={{ bgcolor: "warning.light", color: "inherit", borderRadius: 0.5, px: 0.25 }}>
                              {part.text}
                            </Box>
                          ) : (
                            <React.Fragment key={i}>{part.text}</React.Fragment>
                          )
                        )}
                      </Typography>
                    )}
                  </>
                }
              />
            </ListItem>
          </Paper>
        ))}
      </List>

      {totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
};
