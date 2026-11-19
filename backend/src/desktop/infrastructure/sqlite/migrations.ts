import type { DatabaseSync } from "node:sqlite";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_USER_EMAIL = "local@desktop.invalid";

const MIGRATIONS: string[] = [
  // Migración 1: Esquema base 3FN alineado con schema.prisma
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'LOCAL',
    google_sub TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    preferences TEXT
  );

  CREATE TABLE IF NOT EXISTS transcription_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    guest_token_hash TEXT UNIQUE,
    original_file_name TEXT NOT NULL,
    file_format TEXT NOT NULL,
    duration_seconds REAL,
    file_size_bytes INTEGER NOT NULL,
    storage_path TEXT,
    audio_expires_at TEXT NOT NULL,
    is_audio_purged INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    source_language TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS speakers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    custom_name TEXT,
    UNIQUE(session_id, label)
  );

  CREATE TABLE IF NOT EXISTS transcription_segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE RESTRICT,
    start_time_ms INTEGER NOT NULL CHECK (start_time_ms >= 0),
    end_time_ms INTEGER NOT NULL CHECK (end_time_ms > start_time_ms),
    content TEXT NOT NULL,
    confidence_score REAL
  );

  CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    target_language TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(session_id, target_language)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_audio_expires ON transcription_sessions (audio_expires_at, is_audio_purged);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON transcription_sessions (status);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON transcription_sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON transcription_sessions (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_speakers_session_id ON speakers (session_id);
  CREATE INDEX IF NOT EXISTS idx_segments_session_start ON transcription_segments (session_id, start_time_ms);
  CREATE INDEX IF NOT EXISTS idx_segments_speaker_id ON transcription_segments (speaker_id);
  CREATE INDEX IF NOT EXISTS idx_translations_session_id ON translations (session_id);

  INSERT OR IGNORE INTO users (id, email, password_hash, auth_provider, status, created_at, updated_at)
  VALUES ('${LOCAL_USER_ID}', '${LOCAL_USER_EMAIL}', NULL, 'LOCAL', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

  INSERT OR IGNORE INTO user_profiles (id, user_id, full_name)
  VALUES ('00000000-0000-4000-8000-000000000002', '${LOCAL_USER_ID}', 'Usuario Local');
  `,
  // Migración 2: Tabla meeting_analyses para resúmenes e issues de programación para agentes de IA
  `
  CREATE TABLE IF NOT EXISTS meeting_analyses (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    project_context TEXT,
    summary TEXT NOT NULL,
    key_decisions TEXT NOT NULL,
    topics_discussed TEXT NOT NULL,
    issues TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_meeting_analyses_session_id ON meeting_analyses (session_id);
  `,
  // Migración 3: Carpetas de Proyecto (harnesses de contexto), project_folder_id en sesiones y title en análisis
  `
  CREATE TABLE IF NOT EXISTS project_folders (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    technical_context TEXT NOT NULL,
    default_provider TEXT,
    default_model TEXT,
    custom_api_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_project_folders_user_id ON project_folders (user_id);

  ALTER TABLE transcription_sessions ADD COLUMN project_folder_id TEXT REFERENCES project_folders(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_sessions_project_folder ON transcription_sessions (project_folder_id);

  ALTER TABLE meeting_analyses ADD COLUMN title TEXT;
  `,
  // Migración 4: Soporte enriquecido para fidelidad, ya resuelto, en curso, preguntas abiertas, backlog y totales
  `
  ALTER TABLE meeting_analyses ADD COLUMN already_resolved TEXT;
  ALTER TABLE meeting_analyses ADD COLUMN in_progress TEXT;
  ALTER TABLE meeting_analyses ADD COLUMN global_open_questions TEXT;
  ALTER TABLE meeting_analyses ADD COLUMN backlog TEXT;
  ALTER TABLE meeting_analyses ADD COLUMN repo_hours_totals TEXT;
  `
];

export function runMigrations(db: DatabaseSync): void {
  const versionRow = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  const currentVersion = versionRow?.user_version ?? 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    const migrationSql = MIGRATIONS[i];
    if (migrationSql) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(migrationSql);
        db.exec(`PRAGMA user_version = ${i + 1}`);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
  }
}
