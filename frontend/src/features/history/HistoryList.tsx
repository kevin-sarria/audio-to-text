import React, { useEffect } from "react";
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

interface HistoryListProps {
  onSelectSession: (id: string) => void;
}

const statusColorMap: Record<SessionStatus, "default" | "primary" | "success" | "error"> = {
  [SessionStatus.PENDING]: "default",
  [SessionStatus.PROCESSING]: "primary",
  [SessionStatus.COMPLETED]: "success",
  [SessionStatus.FAILED]: "error"
};

export const HistoryList: React.FC<HistoryListProps> = ({ onSelectSession }) => {
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

  const fetchHistory = async (targetPage: number) => {
    setIsLoading(true);
    try {
      const response = await api.get<any>("/sessions", {
        params: { page: targetPage, limit }
      });
      if (response.success && response.data) {
        setSessions(response.data, response.meta.total);
      }
    } catch (err) {
      console.error("Error al cargar historial:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(page);
  }, [page]);

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
        No tienes transcripciones previas. ¡Sube un archivo para comenzar!
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
                  <Typography variant="caption" color="text.secondary">
                    Fecha: {new Date(sess.createdAt).toLocaleDateString()} | Duración:{" "}
                    {sess.durationSeconds ? `${sess.durationSeconds}s` : "N/A"}
                  </Typography>
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
