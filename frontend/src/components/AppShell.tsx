import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Badge,
  Button,
  Chip
} from "@mui/material";
import { Mic as MicIcon } from "@mui/icons-material";
import { FiSettings } from "react-icons/fi";
import { ThemeToggle } from "./ThemeToggle.js";
import { useAppStore } from "../store/index.js";
import { api } from "../lib/api.js";
import { isDesktopApp } from "../lib/runtime.js";

interface AppShellProps {
  children: React.ReactNode;
  currentPage: "home" | "history" | "session" | "login" | "settings" | "pendientes";
  onNavigate: (page: "home" | "history" | "session" | "login" | "settings" | "pendientes") => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, currentPage, onNavigate }) => {
  const { isAuthenticated, logout } = useAppStore();
  const isDesktop = isDesktopApp();
  const [activeEngine, setActiveEngine] = useState<string>("whisper-local");

  useEffect(() => {
    if (isDesktop) {
      api
        .get<any>("/desktop/settings")
        .then((res) => {
          if (res.success && res.data?.settings?.engine) {
            setActiveEngine(res.data.settings.engine);
          }
        })
        .catch(() => {});
    }
  }, [isDesktop, currentPage]);

  const [openCount, setOpenCount] = useState(0);

  // Contador de pendientes del menú: se refresca al cambiar de pantalla y al emitirse `library:changed`
  useEffect(() => {
    if (!isDesktop) return;
    const refreshOpenCount = () => {
      api
        .get<any>("/desktop/library/action-items", { params: { status: "open", limit: 1 } })
        .then((res) => {
          if (res.success) setOpenCount(res.meta?.openTotal ?? 0);
        })
        .catch(() => {});
    };
    refreshOpenCount();
    window.addEventListener("library:changed", refreshOpenCount);
    return () => window.removeEventListener("library:changed", refreshOpenCount);
  }, [isDesktop, currentPage]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignorar error al cerrar sesión
    }
    logout();
    onNavigate("home");
  };

  const getEngineBadgeLabel = (engine: string) => {
    switch (engine) {
      case "groq":
        return "Motor: Groq";
      case "gemini":
        return "Motor: Gemini";
      default:
        return "Motor: Whisper Local";
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="sticky" color="default" elevation={1} sx={{ bgcolor: "background.paper" }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ justifyContent: "space-between" }}>
            <Box
              sx={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 1 }}
              onClick={() => onNavigate("home")}
            >
              <MicIcon color="primary" sx={{ fontSize: 28 }} />
              <Typography variant="h6" fontWeight={700} color="text.primary">
                Audio2Text
              </Typography>
              {isDesktop && (
                <Chip
                  size="small"
                  label={getEngineBadgeLabel(activeEngine)}
                  color={activeEngine === "whisper-local" ? "primary" : "secondary"}
                  variant="outlined"
                  sx={{ ml: 1, display: { xs: "none", sm: "inline-flex" } }}
                />
              )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                color={currentPage === "home" ? "primary" : "inherit"}
                onClick={() => onNavigate("home")}
                size="small"
              >
                Inicio
              </Button>

              {isAuthenticated && (
                <Button
                  color={currentPage === "history" ? "primary" : "inherit"}
                  onClick={() => onNavigate("history")}
                  size="small"
                >
                  Historial
                </Button>
              )}

              {isDesktop && (
                <Button
                  color={currentPage === "pendientes" ? "primary" : "inherit"}
                  onClick={() => onNavigate("pendientes")}
                  size="small"
                >
                  <Badge badgeContent={openCount} color="error" max={99} sx={{ "& .MuiBadge-badge": { right: -14, top: 2 } }}>
                    Pendientes
                  </Badge>
                </Button>
              )}

              {/* Botón Configuración exclusivo de modo escritorio */}
              {isDesktop && (
                <Button
                  color={currentPage === "settings" ? "primary" : "inherit"}
                  onClick={() => onNavigate("settings")}
                  size="small"
                  startIcon={<FiSettings />}
                >
                  Configuración
                </Button>
              )}

              {!isDesktop && (
                <>
                  {isAuthenticated ? (
                    <Button color="inherit" onClick={handleLogout} size="small">
                      Salir
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onNavigate("login")}
                    >
                      Acceder
                    </Button>
                  )}
                </>
              )}

              <ThemeToggle />
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <Container component="main" maxWidth="md" sx={{ flexGrow: 1, py: { xs: 2, md: 4 } }}>
        {children}
      </Container>

      <Box
        component="footer"
        sx={{
          py: 2,
          textAlign: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          mt: "auto"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Audio-to-Text & Diarización • Sistema de Transcripción Profesional
        </Typography>
      </Box>
    </Box>
  );
};
