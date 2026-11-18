import { describe, it, expect } from "vitest";
import { loginFormSchema } from "../features/auth/schemas.js";

describe("Login Zod Schema Unit Tests", () => {
  it("valida exitosamente credenciales correctas", () => {
    const valid = {
      email: "usuario@empresa.com",
      password: "SuperSecretPassword123!"
    };

    const result = loginFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rechaza formato de correo electrónico no válido", () => {
    const invalidEmail = {
      email: "correo-invalido-sin-arroba",
      password: "password123"
    };

    const result = loginFormSchema.safeParse(invalidEmail);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("Correo electrónico no válido");
    }
  });

  it("rechaza contraseña vacía", () => {
    const emptyPassword = {
      email: "usuario@empresa.com",
      password: ""
    };

    const result = loginFormSchema.safeParse(emptyPassword);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("La contraseña es requerida");
    }
  });
});
