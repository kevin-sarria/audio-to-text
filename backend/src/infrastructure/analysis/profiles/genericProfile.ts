import { ProjectProfile } from "./ProjectProfile.js";

export const GENERIC_PROFILE: ProjectProfile = {
  id: "generic",
  name: "Genérico (sin reglas de negocio)",
  description: "Sin reglas de negocio específicas: aplica solo las reglas generales",

  repositories: [],
  architectureRules: [],
  defaultChannel: null,
  mobileRoutePrefix: null,
  forbiddenTerms: [],
  restrictedTerms: [],

  deliveryFlow: "",
  deliveryRequirements: [],
  allowedDocuments: [],

  businessRules: [],
  matrixStates: [],

  pendingDecisions: [],
  scopeDefaults: [],
  ambiguousChannelPatterns: [],

  people: [],
  domainTerms: [],
  places: [],
  files: [],
  asrCorrections: [],
  externalParties: [],
  glossaryTerms: [],
  acronyms: [],
  sensitiveScopeTerms: [],

  referenceHours: [],

  // B7: términos de la herramienta, aplican a todos los perfiles
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
