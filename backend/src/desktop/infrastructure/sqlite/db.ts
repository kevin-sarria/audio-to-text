import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "./migrations.js";

// Se carga con getBuiltinModule (Node >= 22.3) y no con un import estático: Vite/Vitest
// no reconocen aún el módulo integrado `node:sqlite` y le quitan el prefijo "node:".
function loadSqlite(): typeof import("node:sqlite") {
  const sqlite = process.getBuiltinModule?.("node:sqlite");
  if (!sqlite) {
    throw new Error("node:sqlite no está disponible. Requiere Node >= 22.5 (Electron >= 40).");
  }
  return sqlite;
}

// Silenciar ExperimentalWarning específico de node:sqlite
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, ...args: any[]) {
  if (typeof warning === "string" && warning.includes("SQLite")) return;
  if (
    warning &&
    typeof warning === "object" &&
    warning.name === "ExperimentalWarning" &&
    String(warning.message).includes("SQLite")
  ) {
    return;
  }
  return (originalEmitWarning as any).apply(process, [warning, ...args]);
};

export interface OpenDatabaseOptions {
  dbPath?: string;
}

export function openSqliteDatabase(options?: OpenDatabaseOptions): DatabaseSync {
  let db: DatabaseSync;
  try {
    const targetPath = options?.dbPath || ":memory:";
    if (targetPath !== ":memory:") {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }
    db = new (loadSqlite().DatabaseSync)(targetPath);
  } catch (err) {
    console.error("Error al inicializar base de datos SQLite integrada (node:sqlite):", err);
    throw new Error(
      `No se pudo cargar o inicializar node:sqlite. Verifica la versión de Node/Electron: ${
        (err as Error).message
      }`
    );
  }

  // PRAGMAs obligatorios de rendimiento e integridad relacional
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // en :memory: WAL puede no ser soportado o no tener efecto
  }
  db.exec("PRAGMA foreign_keys = ON;");

  // Ejecución de migraciones
  runMigrations(db);

  return db;
}
