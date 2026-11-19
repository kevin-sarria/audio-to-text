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

## 5. Módulo de IA para Issues Técnicas y Pipeline en 2 Pasos

Para garantizar máxima precisión y erradicar cualquier invención o alucinación de los modelos, el análisis de reuniones técnicas se rige por un **pipeline en dos pasos** y **8 reglas de fidelidad obligatorias**:

### 5.1 Pipeline en 2 Pasos
1. **Paso 1 (Extracción, Clasificación y Detección de Ruido):** El LLM procesa la transcripción cruda y extrae:
   - Resumen ejecutivo estricto.
   - Puntos `alreadyResolved` (CERRADO / YA HECHO: no generan issue).
   - Puntos `inProgress` (EN CURSO: con responsable asignado; no se duplican, solo tareas de integración).
   - Requerimientos `newItems` (NUEVO: pasan al paso 2).
   - Puntos `backlog` (PARA BACKLOG: no bloqueantes, sin prompt de desarrollo).
   - Decisiones clave y `globalOpenQuestions` (términos dudosos o ruido de audio con citas textuales y timestamps).
2. **Paso 2 (Generación de Issues por Repositorio):** Genera las tareas técnicas **únicamente a partir de la lista estructurada del Paso 1**, evitando inventar módulos fuera de lo conversado.
3. **Fallback Resiliente:** Si el pipeline de dos pasos experimenta fallas de conectividad o formato, conmuta de forma segura a un análisis de paso único estructurado.

### 5.2 Las 8 Reglas Obligatorias de Fidelidad y Salida
1. **Fidelidad Estricta (Anti-invención):** Solo afirmar lo dicho explícitamente en la reunión. Si se requiere un campo o endpoint no mencionado, rotularlo como `"PROPUESTO (por confirmar)"`. Los archivos son hipótesis: rotular `"Archivos sugeridos (verificar en el repo)"`. Criterios de aceptación deducidos deben llevar el prefijo `[Supuesto]`.
2. **Ruido de Transcripción y Hablantes:** No intentar adivinar palabras mal captadas por el audio; formular preguntas abiertas citando timestamp y fragmento.
3. **Preguntas Abiertas Obligatorias:** Cada issue contiene `"openQuestions"` (`"Ninguna"` solo si no hay ambigüedades).
4. **Clasificación Previa:** No duplicar lo que ya esté resuelto o en curso por miembros del equipo.
5. **Aislamiento por Repositorio:** Exactamente un issue por repositorio (`backend` / `panel` / `app`). Si una funcionalidad abarca múltiples repos, se divide en issues separados vinculados mediante `"Depende de ISSUE-N"`.
6. **Estimación y Verificación Aritmética:**
   - Desglose por issue: `"Backend: Xh | Panel: Yh | App: Zh | Total: Th"`.
   - Considerar scripts en `db_changes` con formato `AAAAMMDD_0NN.sql`, pruebas automatizadas y soporte offline/pantalla móvil en apps.
   - Verificación de sumas: El backend recalcula y valida programáticamente las sumas de horas por repositorio (`repoHoursTotals`), impidiendo discrepancias aritméticas o símbolos aproximados (`~`).
7. **Flujo de PR y Dependencias:** Cada issue define rama corta desde dev, revisión, captura de pantalla y dependencias entre ramas.
8. **Orden Estricto del Documento:** Resumen ejecutivo → Ya resuelto → En curso → Decisiones clave → Preguntas abiertas globales → Issues (agrupados por repo) → Backlog → Totales de horas por repo.

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
