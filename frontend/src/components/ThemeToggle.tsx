import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { Brightness4, Brightness7 } from "@mui/icons-material";
import { useColorMode } from "../theme/ThemeProvider.js";

export const ThemeToggle: React.FC = () => {
  const { mode, toggleColorMode } = useColorMode();

  return (
    <Tooltip title={`Cambiar a modo ${mode === "light" ? "oscuro" : "claro"}`}>
      <IconButton onClick={toggleColorMode} color="inherit" aria-label="Cambiar tema de color">
        {mode === "dark" ? <Brightness7 /> : <Brightness4 />}
      </IconButton>
    </Tooltip>
  );
};
