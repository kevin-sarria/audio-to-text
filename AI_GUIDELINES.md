# Guía de Desarrollo y Reglas para Agentes de IA

Este documento establece las políticas de arquitectura, integración de modelos de lenguaje (LLM) y la **obligación estricta de pruebas automatizadas** para cualquier desarrollador o agente de IA que colabore en este proyecto.

---

## 1. Regla de Oro: Pruebas Automatizadas Obligatorias Antes de Subir Cambios

> [!IMPORTANT]
> **Toda funcionalidad nueva, modificación en rutas, controladores o capa de infraestructura DEBE incluir sus pruebas unitarias y de integración exigentes antes de crear un commit o subir cambios a GitHub.**

Antes de realizar `git commit` o `git push`:
1. Ejecutar las pruebas del backend:
   ```bash
   npm --workspace backend run test
   ```
2. Ejecutar las pruebas del frontend:
   ```bash
   npm --prefix frontend run test
   ```
3. Verificar que los paquetes compilen limpiamente sin errores de TypeScript:
   ```bash
   npm --workspace packages/shared run build
   npm --workspace backend run build
   npm --prefix frontend run build
   ```

Si alguna prueba falla o se detecta una regresión, está terminantemente prohibido hacer commit o push hasta que esté completamente corregida y probada.

### 1.1 Compilar el instalador desktop después de cada cambio en `main`

> [!IMPORTANT]
> **Cada vez que se sube un cambio a `main` (push, merge o fast-forward), se debe compilar la nueva versión del instalador de escritorio.** No se da por terminado un cambio en `main` hasta que el instalador esté regenerado.

Pasos, en este orden (el instalador empaqueta `frontend/dist`, así que el frontend debe compilarse primero):
1. Compilar todo el monorepo:
   ```bash
   npm run build
   ```
2. Cerrar Audio2Text si está abierto desde `desktop/release/win-unpacked/` (electron-builder reemplaza esa carpeta y falla si los archivos están en uso).
3. Generar el instalador de Windows:
   ```bash
   npm --prefix desktop run dist:win
   ```
4. Verificar que exista `desktop/release/Audio2Text Setup <versión>.exe` con fecha actual e informar su ruta.

Si `desktop/resources/bin/win32/` está vacío, ejecutar antes `npm --prefix desktop run fetch:binaries`.

---

## 2. Arquitectura de Proveedores de IA y Almacén Cifrado (SecretVault)

El sistema soporta tanto proveedores integrados por defecto como proveedores dinámicos y extensibles (DeepSeek, Ollama, OpenRouter, LM Studio, etc.).

### 2.1 Identificadores de Proveedores y SecretVault
- Cada proveedor personalizado tiene un ID único con prefijo `custom-` (ej. `custom-deepseek-5876`).
- Las claves de API se guardan de forma segura en `ISecretVault` usando dicho ID como clave de búsqueda.
- Al invocar la generación de resúmenes e issues, el frontend envía el ID exacto (`custom-deepseek-5876`) o su URL base.
- **PROHIBIDO:** Usar claves ficticias como `"dummy-key"` o enviar identificadores genéricos `"custom"` sin resolver el ID real. Si un proveedor cloud no tiene clave, el sistema debe lanzar un error descriptivo indicando al usuario que ingrese su API Key.
- Los servidores locales (`localhost`, `127.0.0.1`, Ollama, LM Studio) no requieren clave obligatoria.

### 2.2 Prevención de Errores CORS
- Los navegadores y webviews de Electron bloquean las peticiones directas de `fetch()` hacia servidores de LLMs (como DeepSeek u OpenAI) porque estas APIs no incluyen encabezados `Access-Control-Allow-Origin: *`.
- **Regla:** Cualquier verificación o prueba de conexión debe realizarse **a través del backend** mediante el endpoint:
  ```http
  POST /api/desktop/settings/custom-providers/test
  ```
- El backend ejecuta la llamada servidor a servidor en Node.js, inmune a bloqueos de CORS, devolviendo la respuesta real del proveedor.

### 2.3 Prevención de Cruce de Modelos
- No se deben enviar modelos de un proveedor a otro incompatible (ej. solicitar `gemini-2.5-pro` a un endpoint de DeepSeek).
- `LlmMeetingAnalysisService` sanitiza automáticamente el modelo: si se detecta un modelo incompatible para el proveedor seleccionado, aplica de inmediato el modelo por defecto configurado para ese proveedor.

---

## 3. Experiencia de Usuario en la Generación de Issues (Sin Disparos Silenciosos)

- **Generación Consciente:** Al entrar a la pestaña de *"RESUMEN & ISSUES IA"*, la aplicación **NO debe disparar llamadas automáticas en segundo plano** sin la acción explícita del usuario.
- El usuario debe tener la oportunidad de revisar la carpeta de proyecto vinculada, ajustar el contexto técnico o cambiar el modelo.
- La ejecución con la IA solo se inicia cuando el usuario hace clic conscientemente en el botón **"Generar Resumen e Issues con IA"**.

---

## 4. Escáner de Repositorios con IA (Auto-generación de Contexto)

- Ubicación: `POST /api/project-folders/scan-context`.
- La función `scanRepositoryStructure` inspecciona árboles de directorios, manifiestos (`package.json`, `csproj`, `pom.xml`, etc.), `README.md` y archivos de arquitectura.
- **Seguridad y Privacidad:** Está terminantemente prohibido leer o incluir en el prompt archivos de secretos: `.env`, `.env.*`, archivos `.key`, `.pem`, certificados o binarios.
- **Aviso de Facturación:** La interfaz gráfica siempre debe exhibir de forma visible la advertencia de consumo de tokens para que el cliente esté al tanto de los costos asociados a APIs de pago.

---

## 5. Módulo de IA para Issues Técnicas (reglas 1–22, pipeline en 2 etapas)

Los modelos siguen el prompt literalmente, así que cada regla se escribe explícita y, cuando se puede, **se verifica por código**. El módulo debe funcionar con cualquier modelo: si un modelo falla, se corrige con una regla universal o un validador, nunca con un parche para ese modelo.

### 5.1 Capas del prompt (`backend/src/infrastructure/analysis/`)
- **Capa 1 — Reglas universales (1–22):** `MeetingAnalysisPrompts.getUniversalRulesPrompt()`.
- **Capa 2 — Contexto del proyecto:** contexto de la carpeta vinculada + lista exacta de documentos + tabla de referencia de horas.
- **Capa 3 — Glosario:** `glossary/ProjectGlossary.ts` es la **fuente única**: el prompt lo renderiza y los validadores usan las mismas listas (personas, terceros, correcciones del ASR, decisiones de alcance pendientes). Para cambiar el glosario, edita solo ese archivo.

### 5.2 Pipeline
1. **Saneamiento y cobertura:** `TranscriptSanitizer` repara JSON incrustado; `TranscriptCoverageDetector` detecta tramos sin audio. Con cobertura < 90 % no se generan issues (lo decide el código).
2. **Etapa 1 — Extracción:** JSON con `clase` (cerrado / en_curso / nuevo / backlog), `accion` (codigo / gestion_externa / decision / seguimiento), `quien_lo_lleva` y `cierre_posterior`.
3. **Normalización determinista (`ExtractionPointNormalizer`):** aplica por código las reglas 6, 7, 21 y 22 antes de redactar: cierres posteriores → cerrado; terceros (CRM, Lady…) → gestion_externa; responsables no nombrados en el segmento → null; app sin frase explícita de app → panel; BLOQUEANTE sin "si me equivoco" → NO BLOQUEANTE.
4. **Etapa 2 — Redacción:** issues solo desde puntos `nuevo` + `codigo`, con hasta 2 reintentos si un validador de tipo Error falla (o si la respuesta no es JSON).
5. **Validadores (`validators/`):** Error = rechazar y reintentar; Aviso = marcar para revisión. Los v8 están en `MeetingAnalysisV8Validators.ts`.

### 5.3 Set de evaluación
`evaluation/cases/<id>/transcript.txt` (transcripción congelada) + `expected.json` (resultado esperado y trampas conocidas: temas sin issue, responsables prohibidos, valores ambiguos). `EvaluationRunner` compara una salida contra el caso. Antes de adoptar un modelo nuevo, correr el caso de referencia con él.

---

## 6. Resumen de Comandos de Verificación

```bash
# Ejecutar todas las pruebas unitarias y de integración
npm test

# Ejecutar pruebas específicas del backend
npm --workspace backend run test

# Ejecutar pruebas específicas del frontend
npm --prefix frontend run test

# Reconstruir binario e instalador desktop para Windows
npm --prefix desktop run build
npm --prefix desktop run dist:win
```
