# Control del bot desde la app de escritorio — diseño

Fecha: 2026-11-25. Estado: aprobado en conversación, pendiente de revisión del usuario.

## 1. Problema

El bot de reuniones solo se maneja por consola y falla sin avisar:

- Con `--headless` el navegador va oculto. Si Google pide cuenta, el bot espera 90 s a un login en una ventana invisible y sigue de largo sin hacer nada.
- `HeadlessMeetingBotConnector` se traga el error (`console.warn`) y devuelve `CONNECTED_AND_RECORDING` siempre; el CLI imprime "se ha unido" antes de entrar. Hay falsos éxitos.
- `MeetingBotConfigManager.detectLinkedGoogleAccount` da la cuenta por vinculada si existe la carpeta `Default` del perfil, que aparece al abrir el navegador aunque no se inicie sesión.
- La app guarda perfil y ajustes bajo `desktop/` y el CLI los lee de la raíz del repo (heurística con `process.cwd()`): un login hecho en un lugar no sirve en el otro.
- La app no puede entrar a una llamada: no hay endpoint y `isMeetingActive` está fijo en `false`.

## 2. Objetivo y alcance

Desde la app de escritorio: pegar un enlace de Meet o Teams, entrar, ver el estado en vivo, terminar, y que la reunión quede importada en la biblioteca. Configurar la sesión de Google y a dónde puede entrar el bot. Integración con el escritorio: notificaciones, bandeja del sistema, fin automático de la reunión, datos en la carpeta del usuario.

Fuera de alcance: calendario (subproyecto 3), Zoom (no hay driver), modo web (el bot necesita un navegador local; las rutas `/bot` de la web quedan como están), cambios en cómo se genera el resumen.

## 3. Arquitectura

```
Frontend (Ajustes → bot)  --HTTP-->  /api/desktop/bot/*
                                         |
                                  BotSessionService  --usa--> drivers Meet/Teams (algorithm-manager-bot)
                                         | eventos                 AutonomousMeetingBotService
                                         v
                              callback onBotEvent (opción de startDesktopServer)
                                         |
                              desktop/src/main.ts: Notification + Tray
```

El backend no importa Electron: `startDesktopServer` recibe `onBotEvent` y `main.ts` lo conecta a notificaciones y bandeja.

### 3.1 BotSessionService (`backend/src/desktop/bot/`)

- Una sola sesión activa. `join` con otra activa responde 409.
- Estados: `OPENING`, `NEEDS_LOGIN`, `WAITING_ADMISSION`, `LISTENING`, `ENDING`, `ENDED`, `FAILED`. Cada cambio guarda `{state, message, meetingUrl, platform, startedAt, error?}` y emite un evento.
- Los drivers reciben `profileDir` por parámetro (no por `process.cwd()`) y un callback `onStatus(state, message)` en lugar de `console.warn`. `joinAndListen` resuelve con el estado real alcanzado o lanza con un motivo; nunca simula éxito.
- Al terminar (`leave` o fin automático): finaliza con `AutonomousMeetingBotService`, escribe el JSON de entrega en el directorio de salida, ejecuta `ImportBotMeetings` y emite `ENDED` con el resultado de la importación.

### 3.2 Rutas y datos del bot

Carpeta `<userData>/bot/` con `profile/` (perfil del navegador), `settings.json` y `output/` (por defecto, si `botOutputDir` está vacío). Un `BotPaths` recibe `userDataDir` y reemplaza la heurística de `process.cwd()` en la ruta de escritorio. El perfil viejo de la raíz del repo no se migra: hay que iniciar sesión una vez más.

### 3.3 Login verificable

- `POST /login`: abre el navegador visible con el perfil del bot.
- `POST /login/verify`: abre el perfil sin ventana, navega a `myaccount.google.com` y decide: sesión válida si no hay redirección a `accounts.google.com` y se lee el correo; devuelve `{linked, email}`. Sin sesión: `{linked:false}`.
- `GET /session` y el estado de la interfaz usan solo el resultado verificado; se elimina la detección por la carpeta `Default`.
- `POST /unlink`: cierra el navegador del bot y borra el perfil.

### 3.4 Dónde puede entrar el bot

Ajustes nuevos en la config del bot: `botAllowedPlatforms` (`GOOGLE_MEET`, `MICROSOFT_TEAMS`; Zoom aparece desactivado) y `botAllowedDomains` (por defecto `meet.google.com`, `teams.microsoft.com`, `teams.live.com`). `join` valida: esquema https, host exacto o subdominio de uno permitido, plataforma permitida y con driver. Si no cumple responde 400 con el motivo.

### 3.5 Fin automático

El driver comprueba cada 5 s. La reunión termina si: la URL salió de la sala; aparece el texto de fin ("saliste de la llamada", "la reunión ha terminado" y equivalentes en inglés); el navegador se cerró; el bot lleva solo en la sala más de 2 min (conteo de participantes); o esperó admisión más de 10 min (en ese caso `FAILED` con motivo, sin generar reunión). Los umbrales son constantes con nombre.

### 3.6 API (`/api/desktop/bot/`)

| Ruta | Función |
|---|---|
| `POST /join {url}` | Valida y entra; devuelve la sesión. |
| `GET /session` | Estado actual (o `idle`). |
| `POST /leave` | Termina y genera la reunión. |
| `POST /login`, `POST /login/verify`, `POST /unlink` | Sesión de Google. |
| `GET /config`, `PUT /config` | Ajustes, incluida la lista de permitidos. |

Autenticación y aislamiento igual que el resto de `/api/desktop/*`.

### 3.7 Escritorio (Electron)

- Notificaciones del sistema: admitido, necesita iniciar sesión, reunión terminada e importada (con título), error.
- Bandeja: icono según estado; menú con "Terminar reunión" (solo con sesión activa), "Abrir app" y "Salir". Con sesión activa, cerrar la ventana la oculta a la bandeja en lugar de cerrar la app; "Salir" termina la sesión del bot antes de cerrar.
- Si la bandeja no está disponible, solo se omiten el icono y el menú; las notificaciones siguen.

### 3.8 Interfaz (Ajustes → bot)

Tarjeta "Reunión en vivo": campo de enlace, Entrar, estado paso a paso consultando `GET /session` cada 2 s, Terminar, mensaje de error con motivo. Tarjeta de login: botón Iniciar sesión y botón Verificar con el resultado. Editor de plataformas y dominios permitidos. Quedan los campos actuales (nombre, avatar, navegador, carpeta de salida).

## 4. Manejo de errores

Todo fallo termina en `FAILED` con un mensaje en español que se muestra en la app y en una notificación; el navegador se cierra siempre (`finally`). Si Google exige verificación adicional, el estado es `NEEDS_LOGIN` y el navegador se muestra para que el usuario lo resuelva. Un cierre inesperado del navegador pasa a fin de reunión si ya hubo transcripción, y a `FAILED` si no.

## 5. Pruebas

Automatizadas: máquina de estados con driver falso (cada transición, `join` doble, fin automático por cada causa), validación de la lista de permitidos (casos de host falso como `meet.google.com.evil.com`), verificación de login con stub, rutas HTTP, `BotPaths`, helpers del frontend. Manual (no automatizable): entrar a una llamada real de Meet, verificar admisión, texto en vivo, fin automático y la reunión importada.

## 6. Riesgos

- Google puede pedir verificación o bloquear el acceso automatizado; no se intenta saltar, se muestra el navegador.
- Meet y Teams cambian sus clases HTML; los selectores del driver pueden romperse (ya ocurría).
- Puppeteer debe quedar empaquetado en el proceso principal (`main.cjs`); el paso `predist` ya valida dependencias prohibidas y debe seguir pasando.
