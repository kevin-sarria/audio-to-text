/**
 * Capa de compatibilidad hacia atrás (v10).
 * Re-exporta las constantes derivadas de DIAMANTE_PROFILE.
 * @deprecated El código nuevo debe consumir ProjectProfile o DIAMANTE_PROFILE directamente.
 */

import { DIAMANTE_PROFILE } from "../profiles/diamanteProfile.js";
import {
  GlossaryPerson,
  AsrCorrection,
  PendingScopeDecision
} from "../profiles/ProjectProfile.js";

export type { GlossaryPerson, AsrCorrection, PendingScopeDecision };

/** @deprecated Usar DIAMANTE_PROFILE.scopeDefaults */
export const SCOPE_DEFAULTS: PendingScopeDecision[] = DIAMANTE_PROFILE.scopeDefaults;

/** @deprecated Usar DIAMANTE_PROFILE.scopeDefaults */
export const PENDING_SCOPE_DECISIONS = SCOPE_DEFAULTS;

/** @deprecated Usar DIAMANTE_PROFILE.ambiguousChannelPatterns */
export const AMBIGUOUS_CHANNEL_TERMS: RegExp[] = DIAMANTE_PROFILE.ambiguousChannelPatterns;

/** @deprecated Usar DIAMANTE_PROFILE.people */
export const GLOSSARY_PEOPLE: GlossaryPerson[] = DIAMANTE_PROFILE.people;

/** @deprecated Usar DIAMANTE_PROFILE.matrixStates */
export const GLOSSARY_MATRIX_STATES: string[] = DIAMANTE_PROFILE.matrixStates;

/** @deprecated Usar DIAMANTE_PROFILE.domainTerms */
export const GLOSSARY_DOMAIN_TERMS: string[] = DIAMANTE_PROFILE.domainTerms;

/** @deprecated Usar DIAMANTE_PROFILE.places */
export const GLOSSARY_PLACES: string[] = DIAMANTE_PROFILE.places;

/** @deprecated Usar DIAMANTE_PROFILE.files */
export const GLOSSARY_FILES: string[] = DIAMANTE_PROFILE.files;

/** @deprecated Usar DIAMANTE_PROFILE.asrCorrections */
export const ASR_CORRECTIONS: AsrCorrection[] = DIAMANTE_PROFILE.asrCorrections;

/** @deprecated Usar DIAMANTE_PROFILE.externalParties */
export const EXTERNAL_PARTIES: string[] = DIAMANTE_PROFILE.externalParties;

/** @deprecated Usar DIAMANTE_PROFILE.glossaryTerms */
export const GLOSSARY_TERMS: string[] = DIAMANTE_PROFILE.glossaryTerms;

/**
 * @deprecated Siglas y formas correctas aceptadas aunque no aparezcan literales en la transcripción.
 */
export function glossaryAcceptedForms(): Set<string> {
  const forms = new Set<string>();
  for (const c of DIAMANTE_PROFILE.asrCorrections) forms.add(c.correct.toLowerCase());
  for (const p of DIAMANTE_PROFILE.people) forms.add(p.name.toLowerCase());
  for (const t of DIAMANTE_PROFILE.glossaryTerms) forms.add(t.toLowerCase());
  for (const a of DIAMANTE_PROFILE.acronyms) forms.add(a.toLowerCase());
  return forms;
}

/**
 * @deprecated Renderiza la capa de glosario anterior. Usar ProfileRegistry.renderProfile(profile).
 */
export function renderGlossaryLayer(): string {
  const people = GLOSSARY_PEOPLE.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(", ");
  return `[CAPA 3 — GLOSARIO]
Personas: ${people}
Estados de la matriz de hallazgos: ${GLOSSARY_MATRIX_STATES.join(", ")}
Términos del dominio: ${GLOSSARY_DOMAIN_TERMS.join(", ")}
Lugares/clientes: ${GLOSSARY_PLACES.join(", ")}
Archivos: ${GLOSSARY_FILES.join(", ")}
Terceros (sus pendientes son gestion_externa, nunca issue de código): CRM, Lady, Diego Meléndez (API de Tri), certificaciones
`;
}
