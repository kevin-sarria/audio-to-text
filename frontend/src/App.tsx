import React, { useState, useEffect } from "react";
import { AppThemeProvider } from "./theme/ThemeProvider.js";
import { AppShell } from "./components/AppShell.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { HomePage } from "./pages/HomePage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PendientesPage } from "./pages/PendientesPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { useAppStore } from "./store/index.js";
import { api } from "./lib/api.js";
import { isDesktopApp } from "./lib/runtime.js";

type Page = "home" | "history" | "session" | "login" | "settings" | "pendientes";

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const setUser = useAppStore((s) => s.setUser);

  // Intentar autenticación automática con cookie HttpOnly al inicio (solo en modo web)
  useEffect(() => {
    if (isDesktopApp()) return;

    api
      .get<any>("/auth/me")
      .then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
        }
      })
      .catch(() => {
        // No autenticado
      });
  }, [setUser]);

  const handleSessionCreated = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setCurrentPage("session");
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setCurrentPage("session");
  };

  return (
    <AppThemeProvider>
      <AppShell
        currentPage={currentPage}
        onNavigate={(page) => {
          setCurrentPage(page);
        }}
      >
        {/* Un fallo de renderizado en una pantalla no debe dejar la app en blanco: el menú sigue usable */}
        <ErrorBoundary allowRetry resetKeys={[currentPage, activeSessionId]}>
          {currentPage === "home" && (
            <HomePage onSessionCreated={handleSessionCreated} onNavigateSettings={() => setCurrentPage("settings")} />
          )}
          {currentPage === "session" && activeSessionId && (
            <SessionPage sessionId={activeSessionId} />
          )}
          {currentPage === "history" && (
            <HistoryPage onSelectSession={handleSelectSession} />
          )}
          {currentPage === "login" && (
            <LoginPage onSuccess={() => setCurrentPage("home")} />
          )}
          {currentPage === "pendientes" && <PendientesPage onSelectSession={handleSelectSession} />}
          {currentPage === "settings" && <SettingsPage />}
        </ErrorBoundary>
      </AppShell>
    </AppThemeProvider>
  );
};
