import { createTheme, ThemeOptions } from "@mui/material/styles";

export const getDesignTokens = (mode: "light" | "dark"): ThemeOptions => ({
  palette: {
    mode,
    ...(mode === "light"
      ? {
          primary: {
            main: "#2563eb", // Azul neutro accesible
            light: "#3b82f6",
            dark: "#1d4ed8"
          },
          background: {
            default: "#f8fafc",
            paper: "#ffffff"
          },
          text: {
            primary: "#0f172a",
            secondary: "#64748b"
          },
          divider: "#e2e8f0"
        }
      : {
          primary: {
            main: "#3b82f6",
            light: "#60a5fa",
            dark: "#2563eb"
          },
          background: {
            default: "#0f172a",
            paper: "#1e293b"
          },
          text: {
            primary: "#f8fafc",
            secondary: "#94a3b8"
          },
          divider: "#334155"
        })
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif"
    ].join(","),
    h5: {
      fontWeight: 600
    },
    h6: {
      fontWeight: 600
    }
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          borderRadius: 8
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow:
            mode === "light"
              ? "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
              : "0 1px 3px 0 rgb(0 0 0 / 0.3)"
        }
      }
    }
  }
});

export const createAppTheme = (mode: "light" | "dark") =>
  createTheme(getDesignTokens(mode));
