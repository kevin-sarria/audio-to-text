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
import { registerFormSchema, RegisterFormData } from "./schemas.js";
import { api } from "../../lib/api.js";
import { useAppStore } from "../../store/index.js";

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const setUser = useAppStore((s) => s.setUser);
  const setAccessToken = useAppStore((s) => s.setAccessToken);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerFormSchema)
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      const response = await api.post<any>("/auth/register", {
        email: data.email,
        password: data.password,
        fullName: data.fullName
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setAccessToken(response.data.tokens.accessToken);
        onSuccess?.();
      }
    } catch (err: any) {
      setServerError(err.message || "Error al registrar usuario.");
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ mt: 1 }}>
      <Typography variant="h5" component="h1" gutterBottom sx={{ textAlign: "center" }}>
        Crear Cuenta
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
        id="fullName"
        label="Nombre Completo"
        autoComplete="name"
        autoFocus
        error={!!errors.fullName}
        helperText={errors.fullName?.message}
        {...register("fullName")}
      />

      <TextField
        margin="normal"
        required
        fullWidth
        id="email"
        label="Correo Electrónico"
        autoComplete="email"
        error={!!errors.email}
        helperText={errors.email?.message}
        {...register("email")}
      />

      <TextField
        margin="normal"
        required
        fullWidth
        id="password"
        label="Contraseña (mínimo 8 caracteres)"
        type="password"
        autoComplete="new-password"
        error={!!errors.password}
        helperText={errors.password?.message}
        {...register("password")}
      />

      <TextField
        margin="normal"
        required
        fullWidth
        id="confirmPassword"
        label="Confirmar Contraseña"
        type="password"
        autoComplete="new-password"
        error={!!errors.confirmPassword}
        helperText={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button
        type="submit"
        fullWidth
        variant="contained"
        disabled={isSubmitting}
        sx={{ mt: 3, mb: 2, py: 1.2 }}
      >
        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Registrarse"}
      </Button>

      {onSwitchToLogin && (
        <Box textAlign="center" sx={{ mt: 1 }}>
          <Button variant="text" size="small" onClick={onSwitchToLogin}>
            ¿Ya tienes cuenta? Inicia sesión aquí
          </Button>
        </Box>
      )}
    </Box>
  );
};
