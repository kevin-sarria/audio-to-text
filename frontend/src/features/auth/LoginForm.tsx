import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress
} from "@mui/material";
import { loginFormSchema, LoginFormData } from "./schemas.js";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToRegister }) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const setUser = useAppStore((s) => s.setUser);
  const setAccessToken = useAppStore((s) => s.setAccessToken);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema)
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const response = await api.post<any>("/auth/login", data);
      if (response.success && response.data) {
        setUser(response.data.user);
        setAccessToken(response.data.tokens.accessToken);
        onSuccess?.();
      }
    } catch (err: any) {
      setServerError(err.message || "Error al iniciar sesión.");
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ mt: 1 }}>
      <Typography variant="h5" component="h1" gutterBottom sx={{ textAlign: "center" }}>
        Iniciar Sesión
      </Typography>

      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}

      <TextField
        margin="normal"
        required
        fullWidth
        id="email"
        label="Correo Electrónico"
        autoComplete="email"
        autoFocus
        error={!!errors.email}
        helperText={errors.email?.message}
        {...register("email")}
      />

      <TextField
        margin="normal"
        required
        fullWidth
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={!!errors.password}
        helperText={errors.password?.message}
        {...register("password")}
      />

      <Button
        type="submit"
        fullWidth
        variant="contained"
        disabled={isSubmitting}
        sx={{ mt: 3, mb: 2, py: 1.2 }}
      >
        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Acceder"}
      </Button>

      {onSwitchToRegister && (
        <Box textAlign="center" sx={{ mt: 1 }}>
          <Button variant="text" size="small" onClick={onSwitchToRegister}>
            ¿No tienes cuenta? Regístrate aquí
          </Button>
        </Box>
      )}
    </Box>
  );
};
