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
     - Extrae issues de desarrollo de software conforme al estándar de calidad de ingeniería (Rol, Pasos, Restricciones, Criterios de Aceptación, Verificación y Estimaciones en horas por repositorio).
   - **Reunión Comercial (Cliente Actual / Prospecto)**:
     - Detecta negociaciones, dolores del cliente, presupuestos y plazos.
     - Genera automáticamente una **Propuesta Comercial Ejecutiva** formal (`DRAFT_FOR_REVIEW`) con diagnóstico, solución propuesta, entregables, cronograma por fases, inversión y términos de pago en Markdown estructurado.

---

## 🏗️ Arquitectura y Principios

- **Clean Architecture & SOLID**:
  - `src/domain/`: Modelos puros (`MeetingTypes.ts`, `CommercialProposal.ts`) e interfaces de servicios (`IMeetingClassifier.ts`, `ICommercialProposalGenerator.ts`).
  - `src/infrastructure/`: Implementaciones de conectores de red (`HeadlessMeetingBotConnector.ts`, `LocalAudioCaptureConnector.ts`) y servicios de IA (`MeetingClassifierLlmService.ts`, `CommercialProposalLlmService.ts`).
  - `src/application/`: Casos de uso orquestadores (`ProcessMeetingSessionUseCase.ts`).
- **Límite de Código Estricto**: Ningún archivo supera las 500 líneas de código.

---

## 🧪 Pruebas Automatizadas

```bash
npx vitest run algorithm-manager-bot/src/tests/ProcessMeetingSession.test.ts
```
