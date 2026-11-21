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
import { WarningHint } from "./WarningHints.js";

export const SUMMARY_SYSTEM_PROMPT = `Eres un extractor de hechos técnicos y reglas de negocio de documentación de software.
Tu tarea es resumir secciones de documentos extrayendo ÚNICAMENTE hechos presentes de forma explícita en el texto.
REGLAS:
1. Conserva literalmente códigos de reglas (ej. RN-01, RN-12, BR-3), nombres de personas y roles, nombres de entidades, flujos, endpoints, rutas, comandos, fechas y versiones.
2. Copia cada hecho con las MISMAS palabras del texto (puedes recortar la frase, no reescribirla): después se citará literalmente contra el documento original.
3. Cada hecho dice el dato, no el tema: «Los PR los aprueba solo <nombre>», no «Hay un aprobador de PR».
4. NO inventes ni supongas nada que no esté en el texto.
5. Responde EXCLUSIVAMENTE un objeto JSON válido con la estructura:
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

REGLA 0 — CADA LÍNEA RESPONDE LA PREGUNTA, NO LA NOMBRA:
"valor" es la respuesta concreta: nombres de personas, roles, entidades, ramas o repos; cantidades; rutas; comandos; identificadores; URLs públicas. Una línea que solo dice de qué trata no sirve a quien redacta issues.
- Malo: "Aprobador de pull requests".
  Bueno: "Los PR los aprueba solo María López; sin su aprobación no se fusionan".
- Malo: "Estrategia de migraciones".
  Bueno: "No hay migraciones: el esquema se crea con EnsureCreated al arrancar; un cambio de columnas en una base existente necesita un script manual en db/scripts/".
- Malo: "Roles permitidos en la app móvil".
  Bueno: "A la app móvil solo entran los roles Supervisor y Tecnico".
- Malo: "Comando de pruebas de api".
  Bueno: "Las pruebas de api se corren con dotnet test".
Si no encuentras el dato concreto, no escribas la línea: pon la sección en "no_encontrado" o la duda en "preguntas_abiertas".

REGLAS CRÍTICAS DE ANÁLISIS:
1. SOLO HECHOS VERIFICABLES: Basa tus afirmaciones únicamente en el INVENTARIO o en los DOCUMENTOS entregados. Queda TERMINANTEMENTE PROHIBIDO completar con lo típico del framework (capas, patrones, carpetas, comandos o puertos que no aparezcan). Si no hay evidencia clara para una sección, colócala en "no_encontrado".
2. CITA Y FUENTE: Cada dato lleva "cita" (texto copiado literalmente de la fuente, máximo 200 caracteres, sin reescribirlo) y "fuente" (ruta relativa exacta del archivo, o "inventario" si sale del inventario). Si el dato no está escrito tal cual y lo deduces de varias fuentes, deja "cita" en null y pon esas rutas en "deducido_de". Usa "impacto" (opcional) para decir en una frase por qué importa al redactar un issue.
3. REPOSITORIOS Y LAYOUT: Copia con exactitud la cantidad, nombres y tipo de repositorios del inventario ("layout" y "repositories"). Las carpetas ya vienen clasificadas: "repositories" son los repos activos del proyecto; "otherFolders" son copias de trabajo de git, clones duplicados y carpetas sin git, y NO forman parte del proyecto activo. No les atribuyas tecnologías, comandos, reglas ni flujos. Su clasificación ya explica qué son: no especules sobre su propósito (por ejemplo, forks o marcas blancas) ni hagas preguntas sobre ellas.
4. COMANDOS ESTRICTOS: Solo puedes citar comandos que aparezcan explícitamente en "inventario.commands" (campo "runAs") y asignados al repositorio correcto. Si un repositorio no tiene script de pruebas, dilo explícitamente.
5. PRECEDENCIA Y CONTRADICCIONES:
   - El código y la configuración real (manifiestos, workflows de CI/CD, Dockerfile, Nginx, código fuente) SIEMPRE tienen precedencia sobre la documentación.
   - Si dos documentos se contradicen, gana el que tenga fecha de modificación más reciente (indicada junto a cada archivo).
   - Toda discrepancia debe registrarse en la sección "contradicciones" indicando "descripcion", "fuentes", qué versión "gana" y el "motivo" ("codigo_sobre_documento", "mas_reciente" o "sin_resolver").
6. GLOSARIO DE NEGOCIO Y CÓDIGO: En "glosario", "termino_reunion" es la palabra o frase que usan las personas o la UI/i18n (ej. "Sede"), y "nombre_codigo" es la entidad, modelo o tabla real presente en el código o inventario (ej. "CostCenter"). Pon dos palabras como sinónimos solo si una fuente las equipara. Si un término general agrupa varios tipos, escribe "nombre_codigo" como "A o B" y no pongas los tipos como sinónimos del general. NO inventes entradas.

QUÉ RESPUESTA CONCRETA PIDE CADA SECCIÓN:
- proposito: qué hace el sistema, para quién y con qué clientes (web, móvil, terceros).
- trampas: lo que un desarrollador nuevo rompería. Cada trampa dice QUÉ pasa y CUÁNDO te afecta, con su cita. Busca: advertencias en los documentos ("ojo", "cuidado", "nunca", "no tocar", "importante", "en producción", ⚠); configuración local que apunta a recursos compartidos o remotos; sesión única por usuario, límites de intentos, bloqueo de cuentas, datos que se gastan al probarlos; clientes distintos (web, móvil, terceros) sobre el mismo backend con reglas de acceso distintas; almacenamiento que cambia según el entorno (disco o nube); requisitos que condicionan todo (funcionar sin conexión, varios clientes en la misma base, zona horaria, idioma). Revisa una por una las POSIBLES TRAMPAS que trae el bloque de pistas.
- repositorios: qué contiene cada repo activo y cómo se relacionan.
- tecnologias: nombre y versión exacta.
- capas_estructura: carpetas reales y qué va en cada una.
- roles_permisos: nombres exactos de los roles y a qué cliente o pantalla entra cada uno; cómo se comprueban.
- flujos: pasos concretos del usuario, con nombres de pantallas, entidades o endpoints.
- reglas_negocio_ubicacion: archivos exactos de las reglas y formato de su código (ej. RN-01).
- reglas_inquebrantables: la regla misma, con su código si tiene.
- cambios_base_datos: el mecanismo exacto (migraciones, scripts en una ruta, creación automática) y los pasos.
- verificacion: el comando exacto por repositorio.
- ramas_pr: nombres de las ramas, quién aprueba (nombre) y cómo se fusiona.
- despliegue: qué rama despliega a qué entorno y con qué mecanismo.
- como_escribir_issues: plantillas de issue/PR, tareas obligatorias (scripts SQL, documentación, pruebas) y cómo citar los códigos de reglas.

ESQUEMA DE RESPUESTA REQUERIDO (JSON puro, en español). Cada hecho:
{ "valor": "respuesta concreta", "cita": "texto literal de la fuente o null", "fuente": "ruta/relativa/archivo", "deducido_de": ["solo si cita es null"], "impacto": "opcional" }
{
  "secciones": {
    "proposito": [ HECHO ],
    "trampas": [ HECHO ],
    "repositorios": [ HECHO ],
    "tecnologias": [ HECHO ],
    "capas_estructura": [ HECHO ],
    "glosario": [ { "termino_reunion": "...", "sinonimos": ["..."], "nombre_codigo": "...", "cita": "...", "fuente": "..." } ],
    "roles_permisos": [ HECHO ],
    "flujos": [ HECHO ],
    "reglas_negocio_ubicacion": [ HECHO ],
    "reglas_inquebrantables": [ HECHO ],
    "cambios_base_datos": [ HECHO ],
    "verificacion": [ HECHO ],
    "ramas_pr": [ HECHO ],
    "despliegue": [ HECHO ],
    "como_escribir_issues": [ HECHO ],
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
0. Cada "valor" responde la pregunta (nombres, rutas, comandos, cantidades); nunca solo el tema.
1. NUNCA inventes tecnologías, capas, comandos ni reglas que no estén en los textos.
2. Cada dato lleva su "cita" literal y su "fuente" exacta; si lo deduces, "cita": null y "deducido_de".
3. Copia layout y repositorios exactamente del inventario; "otherFolders" no son parte del proyecto activo.
4. Solo usa comandos de verificación listados en el inventario.
5. Código gana sobre documentos viejos; documentos recientes ganan sobre documentos antiguos.
6. Glosario fiel a términos reales encontrados.
RESPONDE EXCLUSIVAMENTE CON EL OBJETO JSON VÁLIDO.
==================================================`;
}

export function buildScanUserPrompt(
  inventory: ProjectInventory,
  contents: DocumentContent[],
  readLog: ReadLogEntry[],
  hints: WarningHint[] = []
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
    otherFolders: inventory.otherFolders.map((f) => ({
      path: f.path,
      kind: f.kind,
      ownerPath: f.ownerPath,
      branch: f.branch,
      lastModified: f.lastModified,
      notes: f.notes
    })),
    manifests: enrichedManifests,
    commands: inventory.commands,
    deployment: enrichedDeployment,
    tree: inventory.tree,
    domain: inventory.domain,
    identicalDocuments: inventory.identicalDocuments,
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
    const historical = c.ref.priority === 5 ? " | HISTÓRICO: no es fuente de lo vigente si hay algo más nuevo" : "";
    const identical = c.duplicates?.length ? ` | idéntico en: ${c.duplicates.join(", ")}` : "";
    docsText += `--- ARCHIVO: ${c.ref.path} | ${c.ref.category} | última modificación: ${c.ref.lastModified} (${c.ref.dateSource}) | ${modeLabel}${identical}${historical} ---\n${cleanDocText}\n\n`;
  }

  const hintsText =
    hints.length === 0
      ? "Ninguna."
      : hints.map((h) => `- ${h.path}:${h.line} [${h.kind}] ${h.text}`).join("\n");

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

=== POSIBLES TRAMPAS (frases de advertencia y configuración remota encontradas por código; confírmalas con su cita) ===
${hintsText}

RECORDATORIO FINAL DE REGLAS:
- Regla 0: Cada "valor" da el dato concreto, no el tema; con su "cita" literal.
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

/**
 * Re-pedido de las líneas que nombran el tema sin dar el dato. Se reenvían junto con
 * los datos (los proveedores no guardan la conversación).
 */
export function buildTopicsPrompt(topics: Array<{ section: string; valor: string; fuente: string }>): string {
  const list = topics.map((t) => `- [${t.section}] "${t.valor}" (fuente: ${t.fuente})`).join("\n");
  const sections = [...new Set(topics.map((t) => `"${t.section}"`))].join(", ");
  return `Estas líneas de tu respuesta anterior nombran el tema pero no dan el dato:
${list}

Para cada una, busca en el INVENTARIO y en los DOCUMENTOS la respuesta concreta (nombres, rutas, comandos, cantidades) y devuélvela con su "cita" literal y su "fuente". Si el dato no está, no incluyas la línea.
Devuelve ÚNICAMENTE las secciones ${sections}, solo con los hechos que reemplazan a esas líneas, en el mismo formato JSON:
{ "secciones": { "<seccion>": [ { "valor": "...", "cita": "...", "fuente": "...", "impacto": "..." } ] }, "no_encontrado": [] }`;
}
