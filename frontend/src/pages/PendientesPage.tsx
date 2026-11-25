import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControl, InputLabel, Link, MenuItem, Paper, Select, Typography } from "@mui/material";
import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { groupBySession } from "../features/library/pendingHelpers.js";

interface PendientesPageProps {
  onSelectSession: (sessionId: string) => void;
}

type Status = "open" | "done" | "all";

export const PendientesPage: React.FC<PendientesPageProps> = ({ onSelectSession }) => {
  const [status, setStatus] = useState<Status>("open");
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [items, setItems] = useState<ActionItemWithMeetingDto[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestCounter = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    try {
      const res = await api.get<any>("/desktop/library/action-items", {
        params: { status, limit: 100, ...(owner ? { owner } : {}) }
      });
      // descarta respuestas (y errores) de una consulta anterior que llegan tarde
      if (requestId !== requestCounter.current) return;
      if (res.success) {
        setItems(res.data);
        setOpenTotal(res.meta?.openTotal ?? 0);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      if (requestId !== requestCounter.current) return;
      console.error("Error al cargar los pendientes:", err);
      setLoadError(true);
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [status, owner]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ success: boolean; data: string[] }>("/desktop/library/action-items/owners")
      .then((res) => res.success && setOwners(res.data))
      .catch(() => {});
  }, []);

  const toggle = async (item: ActionItemWithMeetingDto, done: boolean) => {
    setActionError(null);
    try {
      await api.patch(`/desktop/library/action-items/${item.id}`, { done });
      window.dispatchEvent(new Event("library:changed"));
    } catch (err) {
      console.error("Error al actualizar el punto de acción:", err);
      setActionError("No se pudo actualizar el punto de acción. Inténtalo de nuevo.");
    }
    // recarga siempre: tras un fallo la casilla vuelve al estado real del servidor
    await load();
  };

  const groups = groupBySession(items);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Pendientes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Puntos de acción de tus reuniones. {openTotal === 1 ? "Tienes 1 pendiente." : `Tienes ${openTotal} pendientes.`}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="pend-estado">Estado</InputLabel>
          <Select labelId="pend-estado" label="Estado" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <MenuItem value="open">Pendientes</MenuItem>
            <MenuItem value="done">Hechas</MenuItem>
            <MenuItem value="all">Todas</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="pend-responsable">Responsable</InputLabel>
          <Select labelId="pend-responsable" label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {owners.map((o) => (
              <MenuItem key={o} value={o}>
                {o}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => load()}>
              Reintentar
            </Button>
          }
        >
          No se pudieron cargar los pendientes.
        </Alert>
      )}

      {loading && items.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        loadError ? null : (
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
          {status === "open" ? "No tienes puntos de acción pendientes." : "No hay puntos de acción con este filtro."}
        </Typography>
        )
      ) : (
        groups.map((group) => (
          <Paper key={group.sessionId} sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
            <Link component="button" type="button" underline="hover" onClick={() => onSelectSession(group.sessionId)} sx={{ fontWeight: 700, textAlign: "left" }}>
              {group.sessionTitle}
            </Link>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              {new Date(group.occurredAt).toLocaleDateString()}
            </Typography>
            {group.items.map((item) => (
              <Box key={item.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
                <Checkbox
                  checked={item.done}
                  onChange={(e) => toggle(item, e.target.checked)}
                  inputProps={{ "aria-label": `Marcar como hecha: ${item.task}` }}
                  sx={{ p: 0.5 }}
                />
                <Box>
                  <Typography variant="body1" sx={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                    {item.task}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.25 }}>
                    {item.owner && <Chip size="small" label={`Responsable: ${item.owner}`} />}
                    {item.dueDate && <Chip size="small" variant="outlined" label={`Fecha: ${item.dueDate}`} />}
                  </Box>
                </Box>
              </Box>
            ))}
          </Paper>
        ))
      )}
    </Box>
  );
};
