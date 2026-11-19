# Audio-to-Text: Transcripción y Diarización

Monorepo para procesamiento, transcripción y diarización de audio con arquitectura limpia, Express, BullMQ, Prisma (MySQL 8.0), Redis y React 18 (Vite + MUI v5).

## Arquitectura

- **Monorepo**: npm workspaces (`packages/shared`, `backend`, `frontend`).
- **Estructura del Proyecto**:
  ```text
  audio-to-text/
  ├── backend/               # API Express, BullMQ workers y capa de persistencia Prisma
  │   ├── prisma/            # Esquema y scripts de migración/seed
  │   ├── src/               # Clean Architecture (domain, application, infrastructure, interfaces)
  │   ├── Dockerfile         # Imagen para la API REST/SSE
  │   ├── Dockerfile.worker  # Imagen para los workers BullMQ y FFmpeg
  │   └── tsconfig.json      # Extiende ../tsconfig.base.json
  ├── frontend/              # SPA / PWA React 18, Vite, MUI v5 y Zustand
  │   ├── src/               # Componentes, estado y lógica de cliente
  │   ├── Dockerfile         # Imagen de build y servicio estático con Nginx
  │   └── vite.config.ts     # Configuración de Vite y PWA
  ├── packages/
  │   └── shared/            # DTOs, interfaces compartidas y enums
  ├── infra/                 # Configuraciones de proxy reverso (Nginx) y servicios
  └── docker-compose.yml     # Orquestación de contenedores (MySQL, Redis, API, Worker, Web)
  ```
- **Clean Architecture** en `backend`:
  - `domain`: Entidades, objetos de valor, interfaces de repositorios y servicios puros sin dependencias externas.
  - `application`: Casos de uso de autenticación, transcripción, exportación y retención.
  - `infrastructure`: Prisma ORM, FFmpeg, clientes BullMQ, exportadores (SRT, VTT, TXT, MD, DOCX, PDF), adaptadores de almacenamiento y seguridad Argon2id/JWT.
  - `interfaces`: Rutas y controladores Express, middlewares de seguridad (Helmet, CORS, Rate Limit, reCAPTCHA v3) y validación Zod.
- **Pipeline de Workers Asíncronos (BullMQ)**:
  - W1 `preprocessor`: Conversión a WAV mono 16kHz PCM_S16LE con FFmpeg y cálculo de duración.
  - W2 `transcriber`: Transcripción y detección de hablantes (whisper.cpp o API).
  - W3 `persistence`: Transacción en base de datos para guardar hablantes y segmentos, emitiendo notificación SSE.
  - `retention.worker`: Purga horaria de archivos de audio expirados (>48h) preservando metadatos.
- **Frontend SPA / PWA**: React 18, Vite, MUI v5, Zustand, Dexie (almacenamiento offline) y soporte PWA.

## Requisitos previos

- Node.js >= 20
- Docker y Docker Compose
- FFmpeg instalado en el sistema (para ejecución local fuera de Docker)

## Puesta en marcha

1. Clonar e instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno:
   ```bash
   cp .env.example .env
   # Ajustar variables según corresponda
   ```

3. Levantar infraestructura con Docker:
   ```bash
   docker compose up -d mysql redis
   ```

4. Generar y migrar Prisma:
   ```bash
   npm run prisma:generate
   ```

5. Ejecutar en modo desarrollo:
   ```bash
   # En terminales separadas o con concurrencia
   npm run dev:api
   npm run dev:worker
   npm run dev:web
   ```

6. Ejecutar pruebas automatizadas:
   ```bash
   npm run test
   ```

## Novedades: Resúmenes Técnicos e Issues con IA

- **Resúmenes Estructurados para Agentes de Código**: Análisis profundo de reuniones de audio generando arquitectura, decisiones y tareas en formato issue optimizadas para herramientas como Cursor, Antigravity o Claude Code.
- **Carpetas de Proyecto (Project Harnesses)**: Guarda el stack tecnológico, módulos y convenciones de cada proyecto. Incluye un **Escáner Automático de Repositorio** que analiza la estructura, dependencias y documentación para generar el contexto técnico en un clic.
- **Soporte Multimodelo y Extensible**:
  - **Google Gemini Pro Local (Sin API Key)**: Conexión directa a través de la CLI `agy` y tu cuenta Pro de Google local.
  - **DeepSeek, Ollama, OpenRouter, LM Studio**: Integración sin limitaciones mediante endpoints compatibles con OpenAI.
  - **Proveedores Cloud Estándar**: Groq Cloud, Google Gemini (AI Studio), OpenAI GPT-4o.
- **Seguridad**: Almacén nativo cifrado (`ISecretVault`) para las credenciales y proxy backend seguro para evitar bloqueos por CORS.

## Reglas Obligatorias para Desarrolladores y Agentes de IA

Consulta el archivo [AI_GUIDELINES.md](file:///c:/Users/Estaduardo/Documents/proyectos/audio-to-text/AI_GUIDELINES.md) para conocer las políticas arquitectónicas y de calidad:
- **Pruebas Obligatorias**: Ningún cambio puede ser subido a GitHub sin que pasen el 100% de las pruebas unitarias y de integración de backend y frontend.
- **Resolución de SecretVault y Modelos**: Reglas estrictas para el manejo de IDs de proveedores y prevención de cruce de modelos incompatibles.
- **Experiencia de Usuario**: Prohibición de llamadas silenciosas o automáticas a APIs de pago sin confirmación explícita del usuario.

## Aplicación de Escritorio (Desktop)

Compilar el ejecutable e instalador para Windows:
```bash
npm --prefix desktop run build
npm --prefix desktop run dist:win
```
Los artefactos generados se ubican en `desktop/release/`:
- Instalador NSIS: `desktop/release/Audio2Text Setup 1.0.0.exe`
- Ejecutable portátil: `desktop/release/win-unpacked/Audio2Text.exe`

