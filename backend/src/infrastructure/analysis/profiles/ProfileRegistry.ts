import { ProjectProfileSummaryDto } from "@audio-to-text/shared";
import { ProjectProfile } from "./ProjectProfile.js";
import { DIAMANTE_PROFILE } from "./diamanteProfile.js";
import { GENERIC_PROFILE } from "./genericProfile.js";

export class ProfileRegistry {
  private static readonly PROFILES: Record<string, ProjectProfile> = {
    [DIAMANTE_PROFILE.id]: DIAMANTE_PROFILE,
    [GENERIC_PROFILE.id]: GENERIC_PROFILE
  };

  public static getProfile(id?: string | null): ProjectProfile {
    if (!id || typeof id !== "string") {
      return GENERIC_PROFILE;
    }
    const cleanId = id.trim().toLowerCase();
    return this.PROFILES[cleanId] ?? GENERIC_PROFILE;
  }

  public static listProfiles(): ProjectProfileSummaryDto[] {
    return Object.values(this.PROFILES).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description
    }));
  }

  public static renderProfile(profile: ProjectProfile): string {
    if (profile.id === GENERIC_PROFILE.id) {
      return `PERFIL DE PROYECTO: ${profile.name}\nSin reglas de negocio específicas: aplica solo las reglas generales.`;
    }

    const sections: string[] = [`PERFIL DE PROYECTO: ${profile.name}`];

    // B1. Repositorios y Arquitectura
    const b1Lines: string[] = [];
    if (profile.repositories.length > 0) {
      b1Lines.push(...profile.repositories.map((r) => `- ${r}`));
    }
    if (profile.architectureRules.length > 0) {
      b1Lines.push(...profile.architectureRules.map((a) => `- ${a}`));
    }
    if (b1Lines.length > 0) {
      sections.push(`== B1. REPOSITORIOS Y ARQUITECTURA ==\n${b1Lines.join("\n")}`);
    }

    // B2. Flujo de entrega
    const b2Lines: string[] = [];
    if (profile.deliveryFlow) {
      b2Lines.push(profile.deliveryFlow);
    }
    if (profile.deliveryRequirements.length > 0) {
      b2Lines.push(...profile.deliveryRequirements);
    }
    if (b2Lines.length > 0) {
      sections.push(`== B2. FLUJO DE ENTREGA (en cada issue) ==\n${b2Lines.join("\n")}`);
    }

    // B3. Reglas de negocio del dominio
    if (profile.businessRules.length > 0) {
      const b3Lines = profile.businessRules.map((r) => `- ${r}`);
      sections.push(`== B3. REGLAS DE NEGOCIO DEL DOMINIO ==\n${b3Lines.join("\n")}`);
    }

    // B4. Decisión pendiente
    if (profile.pendingDecisions.length > 0) {
      const b4Lines = profile.pendingDecisions.map((d) => `- ${d}`);
      sections.push(`== B4. DECISIÓN PENDIENTE ==\n${b4Lines.join("\n")}`);
    }

    // B5. Glosario
    const b5Lines: string[] = [];
    if (profile.people.length > 0) {
      const peopleStr = profile.people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(", ");
      b5Lines.push(`Personas: ${peopleStr}`);
    }
    if (profile.domainTerms.length > 0) {
      b5Lines.push(`Términos: ${profile.domainTerms.join(", ")}`);
    }
    if (profile.places.length > 0) {
      b5Lines.push(`Lugares/clientes: ${profile.places.join(", ")}`);
    }
    if (profile.files.length > 0) {
      b5Lines.push(`Archivos: ${profile.files.join(", ")}`);
    }
    if (profile.asrCorrections.length > 0) {
      const asrStr = profile.asrCorrections
        .map((c) => `${c.heard.map((h) => `"${h}"`).join(" / ")} → "${c.correct}"`)
        .join("; ");
      b5Lines.push(`Errores típicos del ASR → forma correcta: ${asrStr}`);
    }
    if (b5Lines.length > 0) {
      sections.push(`== B5. GLOSARIO ==\n${b5Lines.join("\n")}`);
    }

    // B6. Tabla de referencia de horas
    if (profile.referenceHours.length > 0) {
      const b6Lines = profile.referenceHours.map((rh) => `- ${rh.label}: ${rh.hours} h`);
      sections.push(`== B6. TABLA DE REFERENCIA DE HORAS ==\n${b6Lines.join("\n")}`);
    }

    // B7. Términos internos prohibidos en la salida
    if (profile.internalTerms.length > 0) {
      const b7Str = profile.internalTerms.map((t) => `"${t}"`).join(", ");
      sections.push(`== B7. TÉRMINOS INTERNOS PROHIBIDOS EN LA SALIDA (los usa el validador) ==\n${b7Str}`);
    }

    return sections.join("\n\n");
  }
}
