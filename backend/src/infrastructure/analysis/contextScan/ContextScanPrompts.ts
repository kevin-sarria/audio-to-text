import path from "node:path";
import {
  ProjectInventory,
  DocumentRef,
  ManifestInfo,
  DeploymentFileInfo
} from "./ProjectInventory.js";
import { DocumentContent, ReadLogEntry } from "./DocumentReader.js";
import { ScanSectionKey, SCAN_SECTIONS } from "./ContextScanSchema.js";
import { redactSecrets } from "./SecretRedactor.js";

export const SUMMARY_SYSTEM_PROMPT = `Eres un extractor de hechos técnicos y reglas de negocio de documentación de software.
Tu tarea es resumir secciones de documentos extrayendo ÚNICAMENTE hechos presentes de forma explícita en el texto.
REGLAS:
1. Conserva literalmente códigos de reglas (ej. RN-01, RN-12, BR-3), nombres de roles, nombres de entidades, flujos, endpoints, fechas y versiones.
2. NO inventes ni supongas nada que no esté en el texto.
3. Responde EXCLUSIVAMENTE un objeto JSON válido con la estructura:
{"hechos": ["hecho 1", "hecho 2", ...]}
Si no hay hechos relevantes, responde {"hechos": []}.`;

export function buildSummaryUserPrompt(
  fileLabel: string,
  sectionTitle: string,
  text: string
): string {
  const { text: cleanText } = redactSecrets(text);
  return `Documento: ${fileLabel}\nSección: ${sectionTitle}\n\nTexto a resumir:\n"""\n${cleanText}\n"""\n\nExtrae los hechos técnicos y de negocio en formato JSON:`;
}

export function buildScanSystemPrompt(): string {
  const sectionsListDesc = SCAN_SECTIONS.map(
    (s, i) => `${i + 1}. "${s.key}": ${s.title}`
  ).join("\n");

  return `Eres un analista de software experto y riguroso. Tu misión es documentar un proyecto para que otra IA de desarrollo redacte issues y tareas técnicas precisas a partir de reuniones de equipo.

REGLAS CRÍTICAS DE ANÁLISIS:
1. SOLO HECHOS VERIFICABLES: Basa tus afirmaciones únicamente en el INVENTARIO o en los DOCUMENTOS entregados. Queda TERMINANTEMENTE PROHIBIDO completar con lo típico del framework (capas, patrones, carpetas, comandos o puertos que no aparezcan). Si no hay evidencia clara para una sección, colócala en "no_encontrado".
2. FUENTE EXACTA Y VALOR LITERAL: Cada dato debe llevar el campo "fuente" con la ruta relativa exacta del archivo donde se encuentra (o "inventario" si proviene del inventario determinístico). Cuando exista un literal comprobable (versión exacta, nombre de script, puerto, ruta de carpeta o código de regla), inclúyelo en el campo "valor".
3. REPOSITORIOS Y LAYOUT: Copia con exactitud la cantidad, nombres y tipo de repositorios del inventario ("layout" y "repositories"). Múltiples entradas .git corresponden a repositorios separados, salvo que layout sea "monorepo".
4. COMANDOS ESTRICTOS: Solo puedes citar comandos que aparezcan explícitamente en "inventario.commands" (campo "runAs") y asignados al repositorio correcto. Si un repositorio no tiene script de pruebas, dilo explícitamente.
5. PRECEDENCIA Y CONTRADICCIONES:
   - El código y la configuración real (manifiestos, workflows de CI/CD, Dockerfile, Nginx, código fuente) SIEMPRE tienen precedencia sobre la documentación.
   - Si dos documentos se contradicen, gana el que tenga fecha de modificación más reciente (indicada junto a cada archivo).
   - Toda discrepancia debe registrarse en la sección "contradicciones" indicando "descripcion", "fuentes", qué versión "gana" y el "motivo" ("codigo_sobre_documento", "mas_reciente" o "sin_resolver").
6. GLOSARIO DE NEGOCIO Y CÓDIGO: En "glosario", "termino_reunion" es la palabra o frase que usan las personas o la UI/i18n (ej. "Sede"), y "nombre_codigo" es la entidad, modelo o tabla real presente en el código o inventario (ej. "CostCenter"). NO inventes entradas.

PARTICULARIDADES DE "como_escribir_issues":
Debes detallar las reglas particulares del proyecto encontradas en plantillas de issue/PR, tareas obligatorias (ej. escribir scripts de migración SQL, actualizar documentación) y cómo citar códigos de reglas de negocio.

ESQUEMA DE RESPUESTA REQUERIDO (JSON puro, en español):
{
  "secciones": {
    "proposito": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "repositorios": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "tecnologias": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "capas_estructura": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "glosario": [ { "termino_reunion": "...", "sinonimos": ["..."], "nombre_codigo": "...", "fuente": "..." } ],
    "roles_permisos": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "flujos": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "reglas_negocio_ubicacion": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "reglas_inquebrantables": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "cambios_base_datos": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "verificacion": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "ramas_pr": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "despliegue": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "como_escribir_issues": [ { "dato": "...", "fuente": "...", "valor": "..." } ],
    "contradicciones": [
      {
        "descripcion": "...",
        "fuentes": ["..."],
        "gana": "...",
        "motivo": "codigo_sobre_documento" | "mas_reciente" | "sin_resolver"
      }
    ],
    "preguntas_abiertas": [ "pregunta 1", "pregunta 2" ]
  },
  "no_encontrado": [ "clave_de_seccion_sin_evidencia" ]
}

Las secciones disponibles son exactamente:
${sectionsListDesc}

Si una sección no tiene evidencia en los archivos, añade su clave a "no_encontrado" y déjala como arreglo vacío.

==================================================
RECORDATORIO DE REGLAS CRÍTICAS:
1. NUNCA inventes tecnologías, capas, comandos ni reglas que no estén en los textos.
2. Cada dato lleva su "fuente" exacta y "valor" literal comprobable.
3. Copia layout y repositorios exactamente del inventario.
4. Solo usa comandos de verificación listados en el inventario.
5. Código gana sobre documentos viejos; documentos recientes ganan sobre documentos antiguos.
6. Glosario fiel a términos reales encontrados.
RESPONDE EXCLUSIVAMENTE CON EL OBJETO JSON VÁLIDO.
==================================================`;
}

export function buildScanUserPrompt(
  inventory: ProjectInventory,
  contents: DocumentContent[],
  readLog: ReadLogEntry[]
): string {
  // Construir inventario compacto enriquecido con fechas
  const enrichedManifests = inventory.manifests.map((m) => ({
    ...m,
    lastModified: inventory.files[m.path]?.lastModified || null
  }));

  const enrichedDeployment = inventory.deployment.map((d) => ({
    ...d,
    lastModified: inventory.files[d.path]?.lastModified || null
  }));

  const enrichedDocuments = inventory.documents.map((doc) => ({
    path: doc.path,
    repo: doc.repo,
    category: doc.category,
    priority: doc.priority,
    lastModified: doc.lastModified,
    dateSource: doc.dateSource
  }));

  // Solo el nombre de la carpeta: la ruta local completa del usuario no se envía al proveedor.
  const compactInventory = {
    rootPath: path.basename(inventory.rootPath),
    layout: inventory.layout,
    workspaceManifests: inventory.workspaceManifests,
    repositories: inventory.repositories,
    manifests: enrichedManifests,
    commands: inventory.commands,
    deployment: enrichedDeployment,
    tree: inventory.tree,
    domain: inventory.domain,
    documents: enrichedDocuments
  };

  // El inventario también pasa por el borrado de secretos: los hechos de despliegue
  // (proxy_pass, run:, remotos) pueden traer IPs, tokens o credenciales.
  const inventoryJson = redactSecrets(JSON.stringify(compactInventory, null, 2)).text;

  // Documentos leídos
  let docsText = "";
  for (const c of contents) {
    const { text: cleanDocText } = redactSecrets(c.text);
    const modeLabel =
      c.mode === "full" ? "completo" : "resumen por secciones";
    docsText += `--- ARCHIVO: ${c.ref.path} | ${c.ref.category} | última modificación: ${c.ref.lastModified} (${c.ref.dateSource}) | ${modeLabel} ---\n${cleanDocText}\n\n`;
  }

  // Archivos no leídos completos
  const notFullyRead = readLog.filter((l) => l.status !== "complete");
  let notReadText = "Ninguno. Todos los documentos fueron leídos completos.";
  if (notFullyRead.length > 0) {
    notReadText = notFullyRead
      .map(
        (l) =>
          `- ${l.path}: ${l.status}${l.reason ? ` (${l.reason})` : ""}${
            l.sections ? ` [${l.sections} secciones procesadas]` : ""
          }`
      )
      .join("\n");
  }

  return `=== INVENTARIO (hechos extraídos por código, no los contradigas) ===
${inventoryJson}

=== DOCUMENTOS (orden de prioridad; fecha del último cambio) ===
${docsText}
=== ARCHIVOS NO LEÍDOS COMPLETOS ===
${notReadText}

RECORDATORIO FINAL DE REGLAS:
- Regla 1: Solo hechos del inventario o de los documentos entregados; sin inventar.
- Regla 3: Respeta el layout y los repositorios del inventario.
- Regla 4: Solo comandos reales de "commands" del inventario.
- Regla 5: Código gana a documentos; fechas más recientes ganan a fechas viejas.

Genera el JSON de análisis cumpliendo el esquema solicitado:`;
}

export function buildRetryPrompt(previousRaw: string, error: string): string {
  const snippet = (previousRaw || "").slice(0, 4000);
  return `Tu respuesta anterior no cumple el esquema requerido: ${error}.
A continuación se muestra el inicio de lo que enviaste:
"""
${snippet}
"""

Por favor corrige los errores y devuelve el objeto JSON COMPLETO y VÁLIDO conforme al esquema.`;
}

export function buildMissingSectionsPrompt(keys: ScanSectionKey[]): string {
  const keysStr = keys.map((k) => `"${k}"`).join(", ");
  return `Las siguientes secciones quedaron vacías o incompletas en tu respuesta anterior: ${keysStr}.
Por favor genera ÚNICAMENTE estas secciones faltantes siguiendo el mismo formato JSON:
{
  "secciones": {
    // únicamente las claves solicitadas
  },
  "no_encontrado": [ // incluye aquí las claves si no hay evidencia en los archivos ]
}
Recuerda que si no existe evidencia en los documentos o en el inventario para alguna de ellas, debes agregarla a "no_encontrado".`;
}
