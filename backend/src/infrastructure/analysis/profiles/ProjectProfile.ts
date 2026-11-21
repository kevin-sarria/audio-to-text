export interface ReferenceHoursEntry {
  label: string;
  keys: string[];
  hours: number;
  repo?: "backend" | "panel" | "app";
}

export interface GlossaryPerson {
  name: string;
  role?: string;
  /** true = persona externa al equipo de desarrollo (sus pendientes son gestión externa). */
  external?: boolean;
  /** true = nunca debe figurar como responsable de un ítem. */
  neverResponsible?: boolean;
}

export interface AsrCorrection {
  heard: string[];
  correct: string;
}

export interface PendingScopeDecision {
  /** Raíz del tema (minúsculas, sin tildes opcionales) que se busca en títulos de issues. */
  topic: string;
  /** Repos en los que NO se debe crear issue mientras la decisión siga pendiente. */
  disallowedRepos: Array<"backend" | "panel" | "app">;
  description: string;
}

export interface ProjectProfile {
  id: string;
  name: string;
  description: string;
  // B1
  repositories: string[]; // líneas de texto de B1 (repos, stack, carpetas, pruebas, diseño)
  architectureRules: string[]; // resto de líneas de B1
  defaultChannel: "backend" | "panel" | "app" | null;
  mobileRoutePrefix: string | null; // "/api/mobile"
  forbiddenTerms: string[]; // namespaces y librerías inventados: siempre Error
  restrictedTerms: string[]; // librerías permitidas solo rotuladas "(verificar en el repo)"
  // B2
  deliveryFlow: string;
  deliveryRequirements: string[];
  allowedDocuments: string[]; // lista exacta; vacía = el validador de documentos no aplica
  // B3
  businessRules: string[];
  matrixStates: string[];
  // B4
  pendingDecisions: string[];
  scopeDefaults: PendingScopeDecision[]; // tipo actual de ProjectGlossary
  ambiguousChannelPatterns: RegExp[];
  // B5
  people: GlossaryPerson[];
  domainTerms: string[];
  places: string[];
  files: string[];
  asrCorrections: AsrCorrection[];
  externalParties: string[];
  glossaryTerms: string[];
  acronyms: string[]; // LRP, CRM, NFC, QR, ERP… (se aceptan tal cual)
  sensitiveScopeTerms: string[]; // roles, permisos, límites: si aparecen en la salida y no en la transcripción → Error
  // B6
  referenceHours: ReferenceHoursEntry[];
  // B7
  internalTerms: string[];
}
