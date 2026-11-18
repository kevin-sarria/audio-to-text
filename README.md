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
