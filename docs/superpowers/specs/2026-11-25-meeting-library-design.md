# Biblioteca de reuniones — diseño

Subproyecto 2 de 4 (1 Resumen · **2 Biblioteca** · 3 Calendario · 4 Integraciones).
Alcance: `algorithm-manager-bot` (archivo de entrega), `backend` (importador, SQLite, API), `frontend` (Historial, página de sesión, Pendientes) y `packages/shared` (contrato).

## Objetivo
Que las reuniones que atiende el bot queden dentro de la app: aparecen en el Historial junto a los audios, se pueden buscar, abrir con su resumen completo (puntos de acción, decisiones, temas, participantes, capítulos) y seguir sus tareas pendientes entre reuniones.

## Decisiones tomadas
- **Reutilizar el modelo de sesiones.** Cada reunión del bot es una fila de `transcription_sessions` con origen `BOT` y sin audio, con sus `speakers` y `transcription_segments`. No hay tablas ni pantallas paralelas.
- **Entrega por archivo.** El bot escribe un `reunion_<sessionId>.json`; la app lo importa. No hay llamadas entre procesos ni acceso del bot a la base de datos.
- **Búsqueda sin FTS5.** El SQLite integrado de Node no trae FTS5 en esta máquina y no se puede asegurar para Electron. Se busca con `LIKE` sobre un texto normalizado.
- **Alcance:** importar, ver el resumen completo, búsqueda de texto, filtros y lista de pendientes, en cuatro fases independientes.

## 1. Archivo de entrega

El bot escribe `reunion_<sessionId>.json` en su carpeta de salida al terminar la reunión, junto a los demás entregables. Se escribe primero a `reunion_<sessionId>.json.tmp` y se renombra al final, para que la app nunca lea un archivo a medias.

```
{
  schemaVersion: 1,
  sessionId: string,                 // clave de deduplicación
  platform: "GOOGLE_MEET" | "MICROSOFT_TEAMS" | "ZOOM" | "LOCAL_DESKTOP",
  meetingUrl: string,
  startedAt: string,                 // ISO
  endedAt: string,                   // ISO
  meetingType: "INTERNAL" | "COMMERCIAL_CLIENT",
  classificationReason: string,
  utterances: [{ speakerName: string, text: string, offsetSec: number }],
  summary: MeetingSummary            // el tipo del subproyecto 1
}
```

El tipo y su esquema zod viven en `packages/shared` (`BotMeetingDeliverySchema`). `AutonomousMeetingRecord` gana `deliveryFilePath`. La carpeta de salida del bot no cambia.

## 2. Importador (backend)

`ImportBotMeetings.execute()`:
1. Lee la carpeta de entrega (`botOutputDir` en los ajustes del bot; por defecto la `output/` del bot). Si no existe, devuelve `{ imported: 0, alreadyImported: 0, failed: [], folderMissing: true }`.
2. Procesa cada `reunion_*.json` (ignora `.tmp`). Un archivo ilegible, con JSON inválido, con `schemaVersion` no soportado o que no cumple el esquema se registra en `failed: [{ file, reason }]` y no frena a los demás.
3. Si ya existe una sesión con `(source = 'BOT', external_id = sessionId)`, cuenta `alreadyImported` y no hace nada (nunca pisa el estado `done` de los puntos de acción).
4. Si no existe, crea todo en **una transacción**: sesión, hablantes, segmentos, resumen y puntos de acción. Si falla, no queda nada a medias.
5. Nunca modifica, mueve ni borra los archivos de origen.

Se dispara al arrancar la app (sin bloquearla; un fallo se registra en el log) y con `POST /api/desktop/library/import`. Las sesiones importadas pertenecen al usuario local de la app.

**Cómo se construye la sesión:**
- `original_file_name` = `Reunión <plataforma> <fecha local dd/mm/aaaa hh:mm>` (la columna es obligatoria y es lo que muestra el Historial).
- `status = COMPLETED`, `file_format = 'bot'`, `file_size_bytes = 0`, `storage_path = NULL`, `is_audio_purged = 1`, `audio_expires_at = created_at`.
- `occurred_at = startedAt`; `duration_seconds = endedAt - startedAt` si es válido, si no el fin del último segmento; `source_language = summary.language`.
- Un `speakers` por cada `speakerName` distinto (`label = speakerName`).
- Segmento *i*: `start_time_ms = offsetSec × 1000`; `end_time_ms` = inicio del siguiente si es mayor que el propio, si no `start + 1000`. El último usa `start + min(palabras / 2,5 , 30) s`, con mínimo de 1000 ms. La base exige `end > start`.
- `source_meta` (JSON): plataforma, enlace, tipo de reunión y motivo de clasificación.

## 3. Modelo de datos (migración 6)

Todo es aditivo; no toca filas existentes.

**`transcription_sessions`** gana: `source TEXT NOT NULL DEFAULT 'AUDIO'`, `external_id TEXT`, `occurred_at TEXT`, `source_meta TEXT`, e índice único parcial sobre `(source, external_id) WHERE external_id IS NOT NULL`. Las consultas de fecha usan `COALESCE(occurred_at, created_at)`.

**`meeting_summaries`** (una por sesión, `ON DELETE CASCADE`): `language`, `executive_summary`, `note`, `generated_at` y, como JSON, `topics`, `decisions`, `open_questions`, `participants`, `chapters`.

**`action_items`** (`ON DELETE CASCADE`): `id`, `session_id`, `position`, `task`, `owner`, `due_date` (texto libre, tal como lo dijo la reunión), `evidence`, `done INTEGER NOT NULL DEFAULT 0`, `done_at`. Índices por `session_id` y por `done`. Va en tabla propia porque se marcan y se listan entre reuniones.

**`session_search`** (`session_id` PK, `ON DELETE CASCADE`): `title_text`, `body_text`, `indexed_at`. Texto en minúsculas y sin tildes.

## 4. Búsqueda

- **Qué se indexa:** título, nombres de hablantes, transcripción completa y, si existe, resumen ejecutivo, decisiones, temas y puntos de acción (también para sesiones de audio con análisis).
- **Normalización:** por carácter (`NFD`, quitar marcas combinantes, minúsculas), de modo que la longitud se conserva y las posiciones del texto normalizado valen para el original.
- **Consulta:** se parte `q` por espacios, se ignoran términos de menos de 2 letras, se admiten como máximo 5 términos y todos deben aparecer (`AND`). Se escapan `%` y `_` con `ESCAPE`.
- **Índice perezoso:** antes de buscar se reindexan las sesiones sin fila o cuyo análisis o resumen se modificó después de `indexed_at`. No se engancha a la transcripción ni al guardado del análisis.
- **Fragmento:** unos 60 caracteres a cada lado de la primera coincidencia, tomados del texto original. Se devuelve como `{ text, ranges: [[inicio, fin]] }` (nunca HTML) para que el frontend resalte sin riesgo de inyección.
- **Orden:** con `q`, por número de coincidencias y luego por fecha; sin `q`, por fecha descendente.

## 5. API

Todo bajo `/api/desktop/library/*` (rutas solo de escritorio, autenticadas con la cookie local; cada consulta se limita al usuario local). El listado conserva `page` y `limit`. En modo web el Historial sigue usando `/sessions`.

| Endpoint | Función |
|---|---|
| `POST /library/import` | Ejecuta el importador y devuelve su resultado. |
| `GET /library/sessions` | Filtros nuevos: `source` (`AUDIO`/`BOT`), `q`, `from`, `to` (instantes ISO sobre la fecha de la reunión), `participant` (coincidencia normalizada con el nombre del hablante), `folderId`. Cada ítem añade `source`, `occurredAt` y, con `q`, `snippet` y `matchCount`. |
| `GET /library/sessions/:id/meeting-summary` | Resumen con los puntos de acción (con `id` y `done`), o `null` si no hay. |
| `GET /library/action-items` | Filtros `status` (`open`/`done`/`all`), `owner`, `sessionId`; cada ítem incluye título y fecha de su reunión. |
| `PATCH /library/action-items/:id` | Cuerpo `{ done: boolean }`; fija o limpia `done_at`. |
| `GET /library/participants` | Nombres de los participantes de las reuniones (sin tiempo de habla). |

Los tipos de respuesta y los esquemas zod de entrada van en `packages/shared`. El validador ya devuelve el detalle del campo que falla.

## 6. Pantallas

1. **Historial.** Etiqueta "Bot" o "Audio" por fila. Buscador con espera de 300 ms y mínimo 2 letras, con el fragmento resaltado. Filtros de origen, fechas (el frontend convierte el día local a instantes ISO), participante y carpeta. Botón "Importar reuniones del bot" que informa cuántas importó, cuántas ya existían y cuáles fallaron. Estado vacío que explica cómo ejecutar el bot.
2. **Página de sesión (origen Bot).** Sin reproductor de audio. La primera pestaña es **"Resumen de reunión"**: resumen ejecutivo (con aviso si es el resumen mínimo), puntos de acción con casilla, responsable, fecha y cita (al pulsar la cita salta a la transcripción en ese momento), decisiones, temas, preguntas abiertas, participantes con barra de tiempo de habla y capítulos (saltan a la transcripción). "Transcripción" y "Resumen & Issues IA" se mantienen.
3. **Pendientes (página nueva).** Puntos de acción sin hacer, agrupados por reunión, con casilla y filtro por responsable. El menú muestra el contador.
4. **Ajustes del bot.** Campo `botOutputDir` en `MeetingBotSettingsSection`.

## 7. Fases de entrega

Cada fase funciona y se prueba sola.
- **F1 Importar:** contrato en `packages/shared`, el bot escribe `reunion_*.json`, migración 6, importador, endpoint, botón, etiqueta Bot, sin reproductor, ajuste `botOutputDir`.
- **F2 Resumen:** `GET /library/sessions/:id/meeting-summary`, `PATCH /library/action-items/:id` y la pestaña "Resumen de reunión".
- **F3 Búsqueda:** `session_search`, índice perezoso, parámetro `q` y buscador.
- **F4 Filtros y pendientes:** filtros `source`, `from`/`to`, `participant`, `folderId`; `GET /library/action-items` y la página Pendientes; `GET /library/participants`.

## 8. Errores

- Archivo inválido o de esquema no soportado: se informa y se omite; el resto se importa.
- Carpeta de entrega inexistente: resultado `folderMissing`, no es un error de servidor.
- Fallo al insertar una reunión: la transacción se revierte; esa reunión cuenta como fallida y se reintenta en la siguiente importación.
- Consulta `q` sin términos válidos: se trata como sin búsqueda.
- Sesión sin resumen: `meeting-summary` devuelve `null` y la pestaña no se muestra.

## 9. Pruebas

- **Contrato:** el esquema acepta un archivo válido y rechaza versiones distintas, utterances vacías y campos faltantes.
- **Importador:** crea la sesión con todas las columnas obligatorias; deduplica; ignora `.tmp`; un archivo malo no frena a los demás; la transacción se revierte si falla; no toca los archivos de origen; construye segmentos con `end > start`.
- **Migración 6:** parte de una base con datos y conserva las filas; el índice único impide duplicar.
- **Búsqueda:** sin tildes y sin mayúsculas, `AND` de términos, escape de comodines, fragmento con rangos correctos sobre el texto original, reindexado perezoso tras cambiar el análisis.
- **API:** filtros combinados, acceso (usuario y invitado), `PATCH` de puntos de acción.
- **Frontend:** lógica de filtros y fechas, debounce, resaltado de fragmentos, estado vacío y cálculo del contador.
- **Bot:** escribe `reunion_*.json` por escritura atómica y el contenido valida contra el esquema compartido.

## 10. Fuera de alcance

Calendario (subproyecto 3), correo/Slack/Jira (subproyecto 4), editar el resumen o los puntos de acción, cancelar análisis, borrar o mover los archivos de entrega, FTS5, reproducción de audio de reuniones del bot y asignar carpeta de proyecto automáticamente al importar.
