import { ProjectProfile } from "./ProjectProfile.js";

export const DIAMANTE_PROFILE: ProjectProfile = {
  id: "diamante",
  name: "DIAMANTE (Limpieza Inteligente)",
  description: "Reglas de arquitectura, flujo de entrega, dominio y glosario para DIAMANTE",

  // B1. REPOSITORIOS Y ARQUITECTURA
  repositories: [
    "backend (backend-diamante, .NET 8): Controllers/, Controllers/Mobile/, Logic/, Logic/Mobile/, Models/DTOs/Mobile/, db_changes/ (scripts AAAAMMDD_0NN solo si hay columnas nuevas). Flujo Controller → Logic → ApplicationDbContext; NO existen Services. Pruebas: xUnit.",
    "panel (frontend-diamante, React 19 + Ant Design 6): componente → hook → servicio → httpClient → API (más adaptadores). Pruebas: unitarias + Playwright. Diseño de marca: #1c3fac, primario #5b7cfa, cabeceras #1c5fb8, radio 8px.",
    "app (diamante-app-mobile, Expo SDK 57, offline-first): expo-router, SQLite + cola de sincronización, pantallas mínimo 360x640, NFC requiere dev build. Pruebas: Jest + tsc."
  ],
  architectureRules: [
    "Canal por defecto cuando no se especifica: panel.",
    "La app no modifica endpoints compartidos del panel: lo nuevo va en /api/mobile/... (Controllers/Mobile/, Logic/Mobile/).",
    "Borrado lógico en todo el sistema: DeletedAt + IsActive.",
    "Prohibido inventar nombres de proyectos o namespaces (Diamante.API, Diamante.Core, Diamante.Data) y librerías (FluentValidation, Yup, Zod, TanStack, ClosedXML, EPPlus) salvo como \"verificar en el repo\".",
    "En \"Archivos sugeridos\": carpetas o módulos, no rutas concretas, rotulados \"(verificar en el repo)\"."
  ],
  defaultChannel: "panel",
  mobileRoutePrefix: "/api/mobile",
  forbiddenTerms: [
    "Diamante.API",
    "Diamante.Core",
    "Diamante.Data",
    "FluentValidation",
    "Yup",
    "Zod",
    "TanStack"
  ],
  restrictedTerms: ["ClosedXML", "EPPlus"],

  // B2. FLUJO DE ENTREGA
  deliveryFlow: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
  deliveryRequirements: [
    "Todo issue incluye: pruebas (xUnit / Playwright + unitarias / Jest), actualización de docs/REGLAS_DE_NEGOCIO.md, script en db_changes solo si hay cambio de esquema.",
    "Documentos que el agente lee primero (lista exacta; no escribir otros): AI_CONTEXT.md, CLAUDE.md, CONTEXTO.md, BITACORA.md, docs/REGLAS_DE_NEGOCIO.md."
  ],
  allowedDocuments: [
    "AI_CONTEXT.md",
    "CLAUDE.md",
    "CONTEXTO.md",
    "BITACORA.md",
    "docs/REGLAS_DE_NEGOCIO.md",
    "REGLAS_DE_NEGOCIO.md"
  ],

  // B3. REGLAS DE NEGOCIO DEL DOMINIO
  businessRules: [
    "Estados de la matriz de hallazgos: Abierto, En corrección, Validar Diamante, Cerrado.",
    "Novedades = quejas del servicio. Estados de novedad: Abierta, En proceso, Solucionada, Cerrada; aplican a novedades del servicio, NO a novedades por insumo faltante. Si la reunión dice que ya van en una PR, es EN CURSO (regla A9).",
    "Turnos: solo Diurno y Nocturno; los mixtos se integran a diurnos; la hora de corte es un parámetro configurable. El corte se dijo \"a partir de las 7\" y \"de 6 a 7 diurnos\" sin a. m./p. m.: nunca convertirlo a 19:00 ni a otro formato (regla A2).",
    "Dashboard: información diaria para supervisor/visualización; lo parametrizable son los reportes.",
    "Rutinas y centros de costo: las rutinas deben asociarse al mantenimiento (por ejemplo \"Oficina Regional Cali\") y no al centro de costo \"Cubrimientos Cali\". Un mantenimiento es la sede/cliente donde llega el personal.",
    "Indicador de cobertura: contrasta marcaciones de Limpieza Inteligente con el personal requerido por turno del CRM y el total de colaboradores del ERP (LRP). Si el CRM no devuelve el dato, es gestión externa, no issue de código.",
    "Método de inicio de actividad: NFC, QR o ninguno; se parametriza una vez por centro de costo. Autodetección del método sin parametrizar (activar dos sensores a la vez) se dejó \"de último en las propuestas\" → BACKLOG. \"Reconocer el sitio con cámara\" es parte de ese mismo ítem, no un issue de panel ni de app.",
    "Usuarios: la plataforma recibe una \"sábana de usuarios\" de Lady con los usuarios activos y toma todos los que aparezcan. Traer también los pendientes se resuelve pidiéndoselo a Lady (gestion_externa).",
    "Matriz de maquinaria y \"máquina descripción\": son archivos de la carpeta compartida (no tablas de BD). \"máquina descripción\" es la misma matriz con una columna nueva de rendimiento.",
    "Borrado masivo: inicialmente en ubicaciones (edificios, áreas, pisos, espacios de trabajo), tomando como referencia la selección múltiple y eliminación del módulo de rutinas; \"evaluar otros módulos\" no se implementa en esta etapa.",
    "Exportación a Excel de solicitudes: filtros por periodo; campos: fechas, tiempo de gestión, estados, justificaciones, comentarios, responsables y demás.",
    "Reprogramación: de actividades de las rutinas, en especial las de frecuencia semanal, que no se ejecutaron en la fecha programada. Canal por defecto: panel.",
    "Aislamientos en llamados por ubicación: opcional (no obligatorio). Ya está resuelto.",
    "Si se pide cambiar un nombre en llamados (\"asignación automática\"): la frase es ambigua sobre cuál es el nombre actual; el nombre nuevo no está definido."
  ],
  matrixStates: ["Abierto", "En corrección", "Validar Diamante", "Cerrado"],

  // B4. DECISIÓN PENDIENTE (confirmar con Kevin)
  pendingDecisions: [
    "Alcance de dimensionamiento. El hallazgo pide recomendaciones de eficiencia operativa (propuestas de equipos o robots) y que se inyecte la columna de rendimiento de la matriz. Dos lecturas: (1) solo inyectar el rendimiento y ajustar el prompt (DeepSeek); (2) inyectar el rendimiento Y que el prompt genere las recomendaciones de equipos/robots (Gemini). Ambas son 8 h de backend. Lectura recomendada: (2), porque la matriz de maquinaria es el insumo natural para proponer equipos. Mientras no se confirme: el issue sale con (2) como valor por defecto y la otra lectura como pregunta NO BLOQUEANTE. Sin pantallas de panel ni endpoints móviles."
  ],
  scopeDefaults: [
    {
      topic: "dimensionamiento",
      disallowedRepos: ["panel", "app"],
      description:
        "Dimensionamiento: solo backend, 8 h (inyectar la columna de rendimiento de la matriz y que el prompt genere las recomendaciones de equipos/robots). Sin pantallas de panel ni endpoints móviles."
    },
    {
      topic: "reprogram",
      disallowedRepos: ["app"],
      description:
        "Reprogramación: backend + panel, sin app. Pregunta NO BLOQUEANTE de canal (valor por defecto: panel)."
    }
  ],
  ambiguousChannelPatterns: [
    /\b(?:c[aá]mara|reconoc(?:er|imiento|a))\b.*\b(?:sitio|lugar)\b/i,
    /\b(?:sitio|lugar)\b.*\b(?:c[aá]mara|reconoc(?:er|imiento|a))\b/i
  ],

  // B5. GLOSARIO
  people: [
    { name: "Isa" },
    { name: "Cristian" },
    { name: "Juan", role: "revisor de PR y líder del proceso" },
    { name: "Juan Esteban", role: "módulo de formularios" },
    { name: "Alexis", role: "usuario de QA, no responsable", neverResponsible: true },
    { name: "Leo", role: "usuario de QA, no responsable", neverResponsible: true },
    { name: "Lady", role: "fuente de usuarios; externa", external: true },
    { name: "Diego Meléndez", role: "API de Tri; externo", external: true },
    { name: "María" },
    { name: "Valeria" },
    { name: "Suzuki" }
  ],
  domainTerms: [
    "aislamientos",
    "novedades (quejas del servicio)",
    "solicitudes",
    "llamados",
    "marcaciones",
    "dimensionamiento",
    "mantenimiento (= sede/cliente)",
    "centro de costo",
    "rutinas",
    "sábana de usuarios",
    "CRM",
    "ERP (LRP)",
    "Tri"
  ],
  places: [
    "Hospital San Vicente Fundación",
    "Cubrimientos Cali (lectura dudosa: Escali / Scali)",
    "Bicitrack",
    "Sociedad Portuaria"
  ],
  files: [
    "matriz de maquinaria",
    '"máquina descripción" (archivo de la carpeta compartida con columna rendimiento)'
  ],
  asrCorrections: [
    { heard: ["Lexus"], correct: "Alexis" },
    { heard: ["prón", "pront"], correct: "prompt" },
    { heard: ["valida de amante", "validar de amate"], correct: "Validar Diamante" },
    { heard: ["RAME", "TRAME", "derame"], correct: "derrame" },
    { heard: ["al EC"], correct: "Excel" },
    { heard: ["Bcirat"], correct: "Bicitrack" },
    { heard: ["artillas"], correct: "actividades" },
    { heard: ["Paneba"], correct: "Juan Esteban (dudoso)" }
  ],
  externalParties: [
    "crm",
    "lady",
    "diego meléndez",
    "diego melendez",
    "api de tri",
    "certificaciones"
  ],
  glossaryTerms: [
    "aislamientos",
    "san vicente",
    "hospital san vicente fundación",
    "bicitrack",
    "matriz de maquinaria",
    "máquina descripción",
    "cubrimientos cali",
    "sociedad portuaria",
    "dimensionamiento",
    "sábana de usuarios",
    "centro de costo",
    "validar diamante",
    "actividades de las rutinas"
  ],
  acronyms: ["LRP", "CRM", "NFC", "QR", "ERP"],
  sensitiveScopeTerms: [
    "roles",
    "permisos",
    "límites",
    "limites",
    "perfiles de usuario",
    "perfil de usuario"
  ],

  // B6. TABLA DE REFERENCIA DE HORAS
  referenceHours: [
    {
      label: "Cambio de texto/etiqueta en panel",
      keys: ["cambio de texto", "etiqueta"],
      hours: 2,
      repo: "panel"
    },
    {
      label: "Select con búsqueda (componente reutilizable + aplicarlo)",
      keys: ["select con búsqueda", "select con busqueda", "select"],
      hours: 4,
      repo: "panel"
    },
    {
      label: "Endpoint de exportación a Excel (backend)",
      keys: ["exportación a excel", "exportacion a excel", "exportar solicitudes"],
      hours: 8,
      repo: "backend"
    },
    {
      label: "Botón con filtros (panel)",
      keys: ["botón de exportación", "boton de exportacion", "botón con filtros", "boton con filtros"],
      hours: 4,
      repo: "panel"
    },
    {
      label: "Endpoint de borrado masivo (backend)",
      keys: ["borrado masivo"],
      hours: 8,
      repo: "backend"
    },
    {
      label: "Selección múltiple + borrado (panel)",
      keys: ["selección múltiple + borrado", "seleccion multiple + borrado", "borrado masivo"],
      hours: 8,
      repo: "panel"
    },
    {
      label: "Reprogramación (backend / panel)",
      keys: ["reprogramación", "reprogramacion"],
      hours: 8
    },
    {
      label: "Incorporar un dato nuevo al cálculo de dimensionamiento (backend)",
      keys: ["dimensionamiento"],
      hours: 8,
      repo: "backend"
    }
  ],

  // B7. TÉRMINOS INTERNOS PROHIBIDOS EN LA SALIDA
  internalTerms: [
    "Paso 1",
    "Paso 2",
    "openQuestions",
    "tabla de referencia",
    "decisión de arquitectura",
    "decisiones de arquitectura",
    "decisión de alcance",
    "decisiones de alcance",
    "estimación estándar",
    "estimacion estandar",
    "según decisión",
    "segun decision"
  ]
};
