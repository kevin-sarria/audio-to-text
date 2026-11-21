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

## 4. Escáner de Repositorios con IA (Contexto Técnico v2)

- Ubicación: `POST /api/project-folders/scan-context`.
- Arquitectura y módulo: Todo el escaneo reside en `backend/src/infrastructure/analysis/contextScan/`, compuesto por funciones puras y clases testeables sin red:
  - `ScanIgnore.ts`: Directorios ignorados (`IGNORED_DIRS`), soporte de `.gitignore` recursivo/apilado (`GitignoreMatcher`), filtro estricto de secretos (`isSecretFile`) y archivos binarios (`isBinaryFile`). Nunca se lee ningún archivo clasificado como secreto.
  - `SecretRedactor.ts`: Sanitización obligatoria antes de enviar texto a cualquier modelo. Redacta `[REDACTADO:<tipo>]` para llaves privadas, connection strings (URI y ADO), API keys de múltiples proveedores, JWTs, asignaciones de passwords/tokens (respetando placeholders como `<...>` o `${...}`), IPs (ignorando localhost y versiones semver), ARNs de AWS, suscripciones de Azure y correos electrónicos. Es idempotente.
  - `ProjectInventory.ts`: Fachada del inventario determinístico (`buildInventory`); reexporta los tipos de `inventory/types.ts`. Las piezas viven en `inventory/`:
    - `folderClassifier.ts` + `gitMeta.ts`: **clasifica cada carpeta antes de analizar**. Repo principal y submódulo aportan; la copia de trabajo (`.git` es un archivo `gitdir: …/worktrees/x`), el clon duplicado (mismo remoto normalizado y mismo HEAD o un ancestro; gana el más avanzado) y la carpeta sin git (solo cuando hay repos; los agrupadores que contienen repos se recorren) van a `otherFolders`, se describen en una línea y el recorrido no entra en ellas. Si un documento de un repo activo dice que una carpeta sin git está obsoleta o reemplazada, se anota con la fuente. Las rutas se comparan con `realpath` (Windows puede pasar nombres cortos 8.3) y nunca se expone la ruta local de un repo dueño que esté fuera de la carpeta.
    - Layout a partir de los repos principales: 0 → `no-git`, 2 o más → `multi-repo` (un `.sln` o workspace dentro de uno de ellos no lo vuelve monorepo), 1 con workspace en su raíz → `monorepo`, si no `single-repo`.
    - `manifests/` (npm, .NET, Maven, Gradle, Pip, Poetry, Go, Cargo, Composer, Gem y comandos `runAs`), `deploymentParser.ts` (Docker, Compose, Workflows, Nginx, Procfile, PM2), `documentClassifier.ts`, `domainNames.ts` (rutas del dominio) y `gitDates.ts` (fecha por archivo: último commit o mtime).
  - `ScanBudget.ts`: Presupuesto de tokens por modelo (`DEFAULT_MODEL_INPUT_CHARS`) con overrides configurables desde `SettingsStore` (`contextScanModelLimits` y `contextScanMaxSummaryCalls`).
  - `DocumentReader.ts`: Lectura prioritaria de documentación (instrucciones de agentes → negocio → plantillas → configs). Si un documento supera el presupuesto, se divide por secciones Markdown (`#`, `##`, `###`) y se resume por chunks mediante IA (`summarize`). Nunca se corta texto en silencio: todo queda registrado en `readLog` como `complete`, `sections` o `omitted` con su motivo.
  - `ContextScanSchema.ts`: Contrato de respuesta en JSON puro con Zod para las 16 secciones fijas: propósito, repositorios, tecnologías, capas, glosario, roles/permisos, flujos, reglas de negocio, reglas inquebrantables, base de datos, verificación, ramas/PR, despliegue, cómo escribir issues, contradicciones y preguntas abiertas.
  - `ContextScanPrompts.ts`: Prompts del sistema con reglas críticas numeradas al inicio y al final. Precedencia: código real > documentación; fechas recientes > fechas antiguas.
  - Esquema de cada hecho (`ContextScanSchema.ts`): `valor` (la **respuesta concreta**, no el tema), `cita` (texto literal de la fuente, ≤200 caracteres), `fuente`, opcionales `impacto` y `deducido_de`. El formato anterior (`dato` sin `valor`) se acepta copiando `dato` a `valor`.
  - `SourceVerifier.ts` + `verification/` (`citeMatcher.ts`, `sourceResolver.ts`): verificación **por cita**. `confirmado` = la cita (o el valor literal, solo en la fuente indicada) aparece tras normalizar mayúsculas, tildes, espacios, comillas y Markdown, aceptando recortes con «…»; si no está en la fuente indicada se busca en los demás archivos conocidos y se corrige la fuente. La fuente queda como `archivo:línea`. `deducido` = sin cita pero con `deducido_de` existentes. `sin_confirmar` = la fuente existe pero la cita no aparece. Se descarta: fuente inexistente, secreta o fuera del proyecto; ruta citada que no existe (relativa a la raíz o a cualquier repo) **sin** cita confirmada; comando que no está en `inventory.commands` de su repo **sin** cita confirmada. Las fuentes se resuelven también relativas a cada repo y por nombre de archivo suelto. «CI/CD» y similares no cuentan como rutas.
  - Temas (`FactConcreteness.ts` + `TopicRefiner.ts`): una verificación previa marca los hechos cuyo `valor` no trae nada concreto (los nombres de los repos del proyecto y referencias como «(RN-02)» no cuentan); se re-piden **una vez** al modelo con los datos, y la verificación final descarta los que sigan siendo temas. Si un valor es tema pero su cita confirmada trae el dato, se conserva y el render muestra la cita (`mostrar_cita`). El reporte trae `topicRateFirstAnswer`, `topicsDiscarded`, `topicsReplaced` y `deduced`.
  - `ContextScanRenderer.ts`: Renderiza el Markdown final inyectando hechos garantizados del inventario (`**Del inventario:**`) en §2, §3, §11, §13 y §14 (con sus 5 viñetas fijas obligatorias). Incluye tabla de glosario y lista de archivos no leídos completos.
  - `ContextScanOrchestrator.ts`: Orquesta el flujo: inventario → lectura/resumen → llamada principal → 1 reintento si el JSON es inválido → 1 re-pedido si hay secciones incompletas → verificación de fuentes → renderizado → reporte `ProjectContextScanReportDto`.
  - Qué se redacta con `redactSecrets`: los documentos y los resúmenes, el JSON del inventario (los hechos de despliegue y los remotos pueden traer IPs o tokens) y el contexto final, porque ese texto viaja al proveedor en cada generación de issues. Del inventario solo se envía el nombre de la carpeta raíz, nunca la ruta local completa. El reintento y el re-pedido de secciones reenvían el inventario y los documentos, porque los proveedores no recuerdan la llamada anterior.
  - Pendiente (fase 4 del documento de mejora): campos del formulario con datos que solo sabe el usuario (personas, producción, vocabulario, formato de issues), lectura de etiquetas e issues remotas de GitHub/GitLab, actualización incremental con `git diff` y editor del glosario en tabla.
  - `ContextScanEvaluator.ts`: Evalúa la fidelidad del contexto contra casos de prueba (`expected.json`), detectando hechos faltantes y alucinaciones (`falseFacts`).

### 4.1 Evaluación con Fixtures
Para evaluar el escáner contra fixtures reales sin requerir un repositorio externo:
```bash
# Todos los fixtures con el proveedor por defecto (gasta cuota de la cuenta de Google)
npm --workspace backend run eval:context-scan -- --fixture all --provider google-account --model gemini-3.8-flash-low --label antes
# Piso sin IA: mide lo que aporta solo el inventario, gratis
npm --workspace backend run eval:context-scan -- --fixture all --provider none
# Un proveedor con API key
npm --workspace backend run eval:context-scan -- --fixture tres-repos --provider openai --model gpt-4o-mini
```
- La API key se lee exclusivamente de la variable de entorno `SCAN_EVAL_API_KEY`.
- Fixtures en `backend/src/tests/fixtures/context-scan/`: `tres-repos`, `monorepo`, `sin-git` (archivos estáticos; `dot-git`, `dot-env` y `dot-gitignore` se renombran al copiar) y `multi-repo-git`, que trae `scenario.json` y se construye con git real: repos con commits fechados, merges de PR, una copia de trabajo, un clon duplicado y un prototipo sin git (`backend/src/tests/helpers/gitScenario.ts`).
- Cada `expected.json` mezcla hechos (`inventory`, `report`, `context-contains`, `context-not-contains`) con **preguntas fijas** (`tipo: "pregunta"`, `seccion`, `respuesta`). Una pregunta cuenta como respondida solo si una misma línea de su sección trae todos los términos (`a|b` = alternativas, `pref*` = prefijo, el resto palabra completa). `fase` indica qué fase del plan de mejora debería responderla.
- Métricas (`ContextScanMetrics.ts`): preguntas respondidas, % de líneas que son **temas** (nombran la pregunta sin responderla, según `FactConcreteness.ts`) y % de «sin confirmar».
- Cada corrida se guarda en `backend/eval-results/context-scan/` (ignorado por git) para comparar antes y después.

- **Aviso de Facturación y Privacidad:** La interfaz gráfica exhibe de forma obligatoria tanto la advertencia de consumo de tokens (indicando que los documentos largos se resumen por partes) como el aviso del proveedor destino al que se envían los archivos saneados.

---

## 5. Módulo de IA para Issues Técnicas (v10: reglas generales A1–A15 + perfil de proyecto)

Los modelos siguen el prompt literalmente, así que cada regla se escribe explícita y, cuando se puede, **se verifica por código**. El módulo debe funcionar con cualquier modelo: si un modelo falla, se corrige con una regla general o un validador, nunca con un parche para ese modelo.

### 5.1 Capas del prompt (`backend/src/infrastructure/analysis/`)
- **Parte A — Reglas generales (A1–A15):** `MeetingAnalysisPrompts.getGeneralRulesPrompt()`. No contiene nombres ni datos de ningún proyecto; una prueba lo verifica.
- **Parte B — Perfil del proyecto:** `profiles/` (un archivo por proyecto: `diamanteProfile.ts`, `genericProfile.ts`; registro en `ProfileRegistry.ts`). Contiene arquitectura y repos (B1), flujo de entrega y lista exacta de documentos (B2), reglas de negocio (B3), decisiones pendientes (B4), glosario y correcciones del ASR (B5), tabla de horas (B6) y términos internos prohibidos (B7). El prompt lo renderiza y **los validadores leen sus listas del mismo perfil**: no hay listas de proyecto escritas en los validadores.
- **Contexto técnico de la carpeta:** el texto de la carpeta vinculada (o el que el usuario edite en el panel lateral) va después del perfil, sin tocarlo.
- **Cambiar de proyecto = añadir un perfil** en `profiles/`, registrarlo en `ProfileRegistry` y elegirlo en la carpeta. No se toca la Parte A ni los validadores.
- `glossary/ProjectGlossary.ts` queda solo como capa de compatibilidad que re-exporta datos del perfil DIAMANTE.

### 5.2 Resolución del perfil y metadatos de generación
- Perfil: `profileId` del request → `profileId` de la carpeta vinculada → `"generic"` (un id desconocido también cae a genérico). La migración SQLite 5 marcó como `diamante` las carpetas existentes cuyo nombre o contexto dice DIAMANTE.
- Cada análisis guarda `generationMeta` (proveedor, modelo, perfil, fecha, duración, intentos, respaldo, análisis parcial, errores que quedaron y avisos). El panel lo muestra ("Generado con …") y lo usa para preseleccionar el mismo modelo al regenerar.
- `GET /api/project-profiles` lista los perfiles disponibles.

### 5.3 Pipeline
1. **Saneamiento y cobertura:** `TranscriptSanitizer` repara JSON incrustado; `TranscriptCoverageDetector` detecta tramos sin audio. Con cobertura < 90 % no se generan issues (lo decide el código). Con huecos > 60 s y cobertura suficiente, el resumen empieza con "Análisis parcial" (lo antepone el código si el modelo no lo hace).
2. **Etapa 1 — Extracción:** JSON con `clase`, `accion`, `quien_lo_lleva` y `cierre {frase, timestamp}` (el parser también acepta el legado `cierre_posterior`). Reintento único si faltan ítems de la matriz.
3. **Normalización determinista (`ExtractionPointNormalizer`, con el perfil):** cierres posteriores → cerrado; terceros del perfil → gestion_externa; responsables no nombrados → null; app sin frase de app → canal por defecto; BLOQUEANTE inválidas → NO BLOQUEANTE.
4. **Etapa 2 — Redacción:** issues solo desde puntos `nuevo` + `codigo`, con hasta 2 reintentos si un validador de tipo Error falla (o si la respuesta no es JSON).
5. **Validadores (`validators/`):** Error = rechazar y reintentar; Aviso = marcar para revisión. Los errores que sobreviven al último intento y los avisos se guardan en `generationMeta` y se ven en el panel.

### 5.4 Validadores del documento v10 → dónde están
| Validador | Archivo | Estado |
|---|---|---|
| Cobertura de la matriz / pedido de código sin issue / cerrado sin frase de cierre / mismo ítem en dos secciones | `MeetingAnalysisV9Validators.ts` | ya existía (v9) |
| Marcas existentes y fuera de tramos sin audio; cobertura < 90 %; "Análisis parcial" | `MeetingAnalysisCoverageValidators.ts`, `MeetingAnalysisErrorValidators.ts` | ya existía (v7); el antepuesto automático es nuevo en v10 |
| Cita literal en el segmento; etiquetas permitidas; horas numéricas y totales; dependencias existentes; > 8 preguntas | `MeetingAnalysisErrorValidators.ts` | ya existía |
| Responsable no nombrado / "Hablante N"; BLOQUEANTE sin issue o sin "Si me equivoco"; app sin frase de app; /api/mobile sin issue de app | `MeetingAnalysisV8Validators.ts`, `MeetingAnalysisCoverageValidators.ts` | ya existía (v6–v8) |
| Canal ambiguo (cámara) | `MeetingAnalysisV9Validators.ts` (patrones del perfil) | ya existía (v9) |
| Documentos fuera de la lista, namespaces y librerías prohibidas | `MeetingAnalysisErrorValidators.ts` | ya existía; ahora lee B1/B2 del perfil |
| Términos internos (B7) en cualquier texto de salida | `MeetingAnalysisV10Validators.ts` | nuevo en v10 |
| Prompt sin las 6 secciones o que termina cortado | `MeetingAnalysisV10Validators.ts` | secciones ya existía; final cortado nuevo en v10 |
| Título con etiquetas o paréntesis | `MeetingAnalysisV10Validators.ts` | nuevo en v10 |
| Hora del día no literal, aunque esté dentro de [Supuesto] | `MeetingAnalysisV10Validators.ts` | nuevo en v10 (se mantiene también la regex fija anterior) |
| Alcance extra en títulos (centralizar, refactorizar, unificar) | `MeetingAnalysisV10Validators.ts` | nuevo en v10 |
| Rutas de app fuera del prefijo móvil del perfil | `MeetingAnalysisV10Validators.ts` | nuevo en v10 |
| Roles, permisos o límites no mencionados (resumen, preguntas, decisiones, issues) | `MeetingAnalysisV10Validators.ts` | ya existía en v8; ahora lee la lista del perfil |
| Sustantivo del requerimiento cambiado (Aviso) | `MeetingAnalysisV10Validators.ts` | nuevo en v10 |
| Estimación > 50 % de la tabla de horas (Aviso); backlog duplicado (Aviso); siglas fuera del glosario (Aviso) | `MeetingAnalysisQualityValidators.ts`, `MeetingAnalysisV8Validators.ts` | ya existía; horas y siglas leen el perfil |

### 5.5 Set de evaluación por proyecto
`evaluation/cases/<proyecto>/<reunión>/transcript.txt` (transcripción congelada) + `expected.json` (resultado esperado, horas por repo, ítems requeridos en En curso y Decisiones por palabra clave o marca, sustantivos que se deben conservar y trampas conocidas). `EvaluationRunner.loadCase(casesDir, "diamante/2026-11-18_08-04-57")` y `evaluate(caso, salida, perfil)`. Objetivo: 3 o más reuniones por proyecto; un cambio de reglas solo se acepta si no empeora ningún caso. Antes de adoptar un modelo nuevo, correr los casos con él.

---

## 6. Resumen de Comandos de Verificación

```bash
# Ejecutar todas las pruebas unitarias y de integración
npm test

# Ejecutar pruebas específicas del backend
npm --workspace backend run test

# Ejecutar evaluación de escaneo de contexto técnico
npm --workspace backend run eval:context-scan

# Ejecutar pruebas específicas del frontend
npm --prefix frontend run test

# Reconstruir binario e instalador desktop para Windows
npm --prefix desktop run build
npm --prefix desktop run dist:win
```
