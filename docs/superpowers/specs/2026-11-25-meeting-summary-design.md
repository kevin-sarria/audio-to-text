# Resumen de reuniones estilo Fireflies — diseño

Subproyecto 1 de 4 (1 Resumen · 2 Biblioteca · 3 Calendario · 4 Integraciones).
Alcance: `algorithm-manager-bot`. Sin cambios en backend ni frontend.

## Objetivo
Al terminar cada reunión, el bot genera un resumen estructurado (ejecutivo, temas, decisiones, puntos de acción, preguntas abiertas, participantes con tiempo de habla y capítulos con marcas de tiempo), para reuniones internas y comerciales.

## Salida
Formato A: `resumen.md` (legible) y `resumen.json` (estructurado, base de los subproyectos 2 y 4) en la carpeta de salida, junto al `.docx` de transcripción, el `.xlsx` de issues y la propuesta comercial (que no cambian). Además se imprime un extracto en consola.

## Modelo (`src/domain/models/MeetingSummary.ts`)
```
MeetingSummary {
  sessionId, generatedAt, language
  executiveSummary: string                       // 3-5 líneas
  topics:        { title, summary }[]
  decisions:     { text, evidence }[]
  actionItems:   { task, owner?, dueDate?, evidence }[]
  openQuestions: { text, askedBy? }[]
  participants:  { name, speakingSeconds, speakingPercent }[]
  chapters:      { title, startSec, endSec }[]
}
```

## Componentes
| Pieza | Capa | Responsabilidad |
|---|---|---|
| `IMeetingSummarizer` | domain/services | Transcripción → `MeetingSummary`. |
| `MeetingSummaryLlmService` | infrastructure/ai | Llama al LLM con JSON estricto, valida, reintenta, fusiona parciales. |
| `SpeakingStatsCalculator` | domain | Participantes y tiempos de habla calculados sin IA. |
| `MeetingSummaryMarkdownRenderer` | infrastructure/export | `MeetingSummary` → `resumen.md` y extracto de consola. |

Cambios en código existente:
- `ExtractedUtterance` / `TranscriptUtterance` ganan `offsetSec` (segundos desde el inicio de la reunión); lo rellenan los drivers de Meet y Teams.
- `ProcessMeetingSessionUseCase` y `AutonomousMeetingBotService` generan el resumen en toda reunión. El `internalSummary` fijo del caso interno se reemplaza por el resumen real.

Principio: los números (tiempo de habla, porcentajes) los calcula el código; el texto lo escribe el LLM.

## Flujo
1. Se reúnen las intervenciones (`speakerName`, `text`, `offsetSec`).
2. `SpeakingStatsCalculator` calcula participantes.
3. `MeetingSummaryLlmService` genera el resto.
4. Se escriben `resumen.md` y `resumen.json` y se muestra el extracto.
5. Si es comercial, la propuesta se genera como hoy.

## Transcripciones largas
Una sola llamada si la transcripción cabe bajo un umbral de caracteres configurable. Si no, se divide en bloques por tiempo, cada bloque genera un resumen parcial y una llamada final los fusiona.

## Reglas de calidad
- Tareas y decisiones requieren `evidence` textual presente en la transcripción; si no aparece, el ítem se descarta.
- `owner` y `dueDate` solo si se dijeron; si no, quedan vacíos.
- Capítulos sin solapes y con `startSec`/`endSec` dentro de la duración real.
- El resumen sale en el idioma dominante de la transcripción.

## Errores
JSON inválido o fallo del LLM: un reintento pidiendo corregir el JSON. Si falla de nuevo, resumen mínimo solo con participantes y tiempos, con una nota de que el resumen con IA no se generó. Nunca bloquea la entrega del `.docx`, el `.xlsx` ni la propuesta.

## Pruebas (vitest, LLM simulado)
- Tiempo de habla con intervenciones conocidas.
- Descarte de ítems cuya evidencia no está en el texto.
- Fusión de parciales en transcripciones largas.
- Reintento y fallback ante respuesta inválida.
- Render de `resumen.md` con todas las secciones.

## Fuera de alcance
Guardado y búsqueda de reuniones (2), calendario (3), correo/Slack/Jira (4), mover el tipo a `packages/shared`.
