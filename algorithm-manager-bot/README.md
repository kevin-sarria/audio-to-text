# Algorithm Manager Bot

Módulo inteligente de asistencia para reuniones empresariales con arquitectura dual (Bot Remoto Headless vs Captura Local de Escritorio).

---

## 🌟 Capacidades Principales

1. **Arquitectura Dual de Conexión**:
   - **Modo Remoto (Headless Bot)**: Asistente que se conecta directamente a salas virtuales de Google Meet, Microsoft Teams o Zoom mediante Chromium headless con emulación WebRTC para captura de audio bidireccional.
   - **Modo Local (Escritorio / On-Premise)**: Módulo embebible en aplicaciones de escritorio (Electron / Node.js) que reutiliza la infraestructura existente de `audio-to-text` (WASAPI Loopback y micrófono) sin necesidad de reconfigurar APIs ni tokens.

2. **Detección Automática del Tipo de Reunión**:
   - **Reunión Interna (Ingeniería / Sprints / Arquitectura)**:
     - Detecta debates técnicos, dailies, planning y arquitectura.
     - Aplica el estándar de 20 reglas universales v7 para saneamiento y derivación directa a issues de desarrollo para agentes de código.
   - **Reunión Comercial (Cliente Actual / Prospecto)**:
     - Detecta negociaciones, dolores del cliente, presupuestos y plazos mencionados.
     - Genera automáticamente una **Propuesta Comercial Ejecutiva** formal (`DRAFT_FOR_REVIEW`) con diagnóstico, solución propuesta, entregables, cronograma por fases, inversión estimada y términos de pago en Markdown estructurado.

3. **Resumen estilo Fireflies**: al terminar cada reunión (interna o comercial) genera `Resumen_<sesión>.md` y `Resumen_<sesión>.json` con resumen ejecutivo, puntos de acción con responsable y cita textual, decisiones, temas, preguntas abiertas, participantes con tiempo de habla y capítulos con marcas de tiempo. Las tareas y decisiones sin respaldo textual en la transcripción se descartan. Si no hay modelo de IA o este falla, se entrega un resumen mínimo con los participantes y una nota.

---

## 🚀 Cómo Empezar a Usarlo Ahora Mismo

Puedes ejecutar el bot directamente desde la raíz del proyecto con el comando:

```bash
# Modo Interactivo con menú guiado:
npm run bot

# Probar inmediatamente con una reunión de cliente (genera propuesta comercial en Markdown):
npm run bot client

# Probar inmediatamente con una reunión interna (diagnóstico y preparación de issues):
npm run bot internal

# Procesar una transcripción guardada en archivo:
npm run bot -- --file mi-reunion.txt

# Conectar bot a una sala virtual:
npm run bot -- --join https://meet.google.com/abc-defg-hij
```

---

## 🏗️ Arquitectura y Principios

- **Clean Architecture & SOLID**:
  - `src/domain/`: Modelos puros (`MeetingTypes.ts`, `CommercialProposal.ts`) e interfaces de servicios (`IMeetingClassifier.ts`, `ICommercialProposalGenerator.ts`).
  - `src/infrastructure/`: Conectores (`HeadlessMeetingBotConnector.ts`, `LocalAudioCaptureConnector.ts`), fábrica de clientes LLM (`LlmClientFactory.ts`), y servicios de IA (`MeetingClassifierLlmService.ts`, `CommercialProposalLlmService.ts`, `MeetingSummaryLlmService.ts`, `MeetingSummaryValidator.ts`), y el renderizador de resumen (`MeetingSummaryMarkdownRenderer.ts`).
  - `src/application/`: Caso de uso orquestador (`ProcessMeetingSessionUseCase.ts`).
  - `src/cli.ts`: Entrada ejecutable de consola.
- **Límite de Código Estricto**: Ningún archivo supera las 500 líneas de código.

---

## 🧪 Pruebas Automatizadas

```bash
npm run bot:test
# o directamente con vitest:
npx vitest run algorithm-manager-bot/src/tests/ProcessMeetingSession.test.ts
```
