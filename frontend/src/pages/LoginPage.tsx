import React, { useState } from "react";
import { Box, Paper } from "@mui/material";
import { LoginForm } from "../features/auth/LoginForm.js";
import { RegisterForm } from "../features/auth/RegisterForm.js";

interface LoginPageProps {
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
      <Paper elevation={2} sx={{ p: { xs: 3, sm: 4 }, width: "100%", maxWidth: 450, borderRadius: 3 }}>
        {mode === "login" ? (
          <LoginForm
            onSuccess={onSuccess}
            onSwitchToRegister={() => setMode("register")}
          />
        ) : (
          <RegisterForm
            onSuccess={onSuccess}
            onSwitchToLogin={() => setMode("login")}
          />
        )}
      </Paper>
    </Box>
  );
};
