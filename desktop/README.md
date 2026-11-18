# Audio2Text Desktop (@audio-to-text/desktop)

Aplicación de escritorio instalable para Windows y Linux construida sobre Electron, Express embebido, SQLite (`node:sqlite`) y Whisper.

## Requisitos de desarrollo
- Node.js ≥ 22.14
- npm ≥ 10
- En Linux: `gnome-keyring` o `kwallet` para almacenamiento seguro de claves (`safeStorage`).

## Flujo de desarrollo local
```bash
# 1. Compilar paquetes compartidos y frontend
npm run build:shared
npm run build:web

# 2. Descargar binarios locales (whisper.cpp y ffmpeg)
npm run fetch:binaries --workspace=@audio-to-text/desktop

# 3. Iniciar aplicación en modo desarrollo
npm run dev:desktop
```

## Empaquetado y Distribución
```bash
# Windows (Genera instalador NSIS x64 en desktop/release)
npm run dist:desktop

# O específicamente por plataforma:
npm run dist:win --workspace=@audio-to-text/desktop
npm run dist:linux --workspace=@audio-to-text/desktop
```

### Firma de código y SmartScreen
Los ejecutables no cuentan con certificado EV configurado en CI. En Windows, SmartScreen mostrará una advertencia estándar de editor desconocido ("Windows protegió su PC") hasta acumular reputación o configurar un certificado de firma en `electron-builder`.
