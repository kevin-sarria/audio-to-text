// Fija el modo escritorio ANTES de que se evalúe `infrastructure/config/env.ts`.
// Debe ser el primer import de cualquier punto de entrada del modo escritorio: los imports ESM
// se evalúan en orden, y env.ts decide su esquema (web o escritorio) al cargarse.
process.env.APP_MODE = "desktop";
if (!process.env.MAX_UPLOAD_MB) {
  process.env.MAX_UPLOAD_MB = "2048";
}
