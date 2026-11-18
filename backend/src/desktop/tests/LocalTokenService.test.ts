import { describe, it, expect } from "vitest";
import { LocalTokenService } from "../infrastructure/security/LocalTokenService.js";
import { LOCAL_USER_ID, LOCAL_USER_EMAIL } from "../infrastructure/sqlite/migrations.js";
import { UnauthorizedError } from "../../domain/errors/UnauthorizedError.js";

describe("LocalTokenService", () => {
  const launchToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const tokenService = new LocalTokenService(launchToken);

  it("verifica correctamente el token de lanzamiento exacto", () => {
    const payload = tokenService.verifyAccessToken(launchToken);
    expect(payload.userId).toBe(LOCAL_USER_ID);
    expect(payload.email).toBe(LOCAL_USER_EMAIL);
  });

  it("rechaza token con valor incorrecto de la misma longitud", () => {
    const wrongToken = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => tokenService.verifyAccessToken(wrongToken)).toThrow(UnauthorizedError);
  });

  it("rechaza token con longitud distinta sin lanzar excepción de timingSafeEqual", () => {
    const shortToken = "short-token";
    const longToken = launchToken + "extra";

    expect(() => tokenService.verifyAccessToken(shortToken)).toThrow(UnauthorizedError);
    expect(() => tokenService.verifyAccessToken(longToken)).toThrow(UnauthorizedError);
    expect(() => tokenService.verifyAccessToken("")).toThrow(UnauthorizedError);
  });

  it("generateTokens lanza NotImplementedError en modo escritorio", () => {
    expect(() =>
      tokenService.generateTokens({ userId: LOCAL_USER_ID, email: LOCAL_USER_EMAIL })
    ).toThrow(/NotImplementedError/);
  });
});
