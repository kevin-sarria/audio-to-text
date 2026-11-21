import { describe, it, expect } from "vitest";
import { ProfileRegistry } from "../../infrastructure/analysis/profiles/ProfileRegistry.js";
import { DIAMANTE_PROFILE } from "../../infrastructure/analysis/profiles/diamanteProfile.js";
import { GENERIC_PROFILE } from "../../infrastructure/analysis/profiles/genericProfile.js";
import { MeetingAnalysisPrompts } from "../../infrastructure/analysis/MeetingAnalysisPrompts.js";
import { MeetingAnalysisResponseParser } from "../../infrastructure/analysis/MeetingAnalysisResponseParser.js";

describe("Perfiles de proyecto (Parte B como datos)", () => {
  it("el registro resuelve diamante, genérico y cae a genérico con un id desconocido o vacío", () => {
    expect(ProfileRegistry.getProfile("diamante").id).toBe("diamante");
    expect(ProfileRegistry.getProfile("generic").id).toBe("generic");
    expect(ProfileRegistry.getProfile("no-existe").id).toBe("generic");
    expect(ProfileRegistry.getProfile(undefined).id).toBe("generic");
    expect(ProfileRegistry.getProfile(null).id).toBe("generic");
    expect(ProfileRegistry.getProfile("").id).toBe("generic");
  });

  it("listProfiles devuelve id, nombre y descripción de cada perfil", () => {
    const list = ProfileRegistry.listProfiles();
    const ids = list.map((p) => p.id);
    expect(ids).toContain("diamante");
    expect(ids).toContain("generic");
    for (const p of list) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("el render de DIAMANTE contiene B1–B7, la lista exacta de documentos, la tabla de horas y el glosario", () => {
    const text = ProfileRegistry.renderProfile(DIAMANTE_PROFILE);
    for (let n = 1; n <= 7; n++) expect(text).toContain(`== B${n}.`);
    for (const doc of ["AI_CONTEXT.md", "CLAUDE.md", "CONTEXTO.md", "BITACORA.md", "docs/REGLAS_DE_NEGOCIO.md"]) {
      expect(text).toContain(doc);
    }
    expect(text).toContain("Reprogramación (backend / panel)");
    expect(text).toContain("Alexis (usuario de QA, no responsable)");
    expect(text).toContain("Leo (usuario de QA, no responsable)");
    expect(text).toContain('"artillas" → "actividades"');
    expect(text).toContain("/api/mobile");
  });

  it("el perfil genérico no contiene nada de DIAMANTE y deja vacías las listas que alimentan validadores", () => {
    const text = ProfileRegistry.renderProfile(GENERIC_PROFILE);
    expect(text).not.toMatch(/diamante/i);
    expect(GENERIC_PROFILE.allowedDocuments).toEqual([]);
    expect(GENERIC_PROFILE.forbiddenTerms).toEqual([]);
    expect(GENERIC_PROFILE.referenceHours).toEqual([]);
    expect(GENERIC_PROFILE.mobileRoutePrefix).toBeNull();
    // Los términos internos son de la herramienta: aplican a cualquier proyecto.
    expect(GENERIC_PROFILE.internalTerms).toEqual(DIAMANTE_PROFILE.internalTerms);
  });
});

describe("Prompt v10 en dos capas", () => {
  const partA = MeetingAnalysisPrompts.getGeneralRulesPrompt();

  it("la Parte A tiene A1–A15 y ningún dato de un proyecto", () => {
    for (let n = 1; n <= 15; n++) expect(partA).toContain(`== A${n}. `);
    for (const forbidden of ["DIAMANTE", "Diamante", "Lady", "Juan", "Cubrimientos", "Alexis", "AI_CONTEXT.md", "/api/mobile", "xUnit", "19:00"]) {
      expect(partA).not.toContain(forbidden);
    }
  });

  it("los prompts de etapa 1, etapa 2 y respaldo incluyen Parte A, perfil y contexto de la carpeta, en ese orden", () => {
    const builders = [
      MeetingAnalysisPrompts.buildStep1Prompt("Contexto propio de la carpeta", DIAMANTE_PROFILE),
      MeetingAnalysisPrompts.buildStep2Prompt("Contexto propio de la carpeta", DIAMANTE_PROFILE),
      MeetingAnalysisPrompts.buildSingleStepPrompt("Contexto propio de la carpeta", DIAMANTE_PROFILE)
    ];
    for (const prompt of builders) {
      const a = prompt.indexOf("== A1. ");
      const b = prompt.indexOf("PERFIL DE PROYECTO: DIAMANTE");
      const c = prompt.indexOf("Contexto propio de la carpeta");
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
    }
  });

  it("con el perfil genérico el prompt no menciona DIAMANTE ni su glosario", () => {
    const prompt = MeetingAnalysisPrompts.buildStep1Prompt("Monorepo React + Express", GENERIC_PROFILE);
    expect(prompt).not.toMatch(/diamante/i);
    expect(prompt).not.toContain("Lady");
    expect(prompt).toContain("Monorepo React + Express");
  });

  it("el esquema de la etapa 1 pide el campo cierre {frase, timestamp} y referencia A1–A15, no las reglas 1–23", () => {
    const step1 = MeetingAnalysisPrompts.buildStep1Prompt(undefined, DIAMANTE_PROFILE);
    expect(step1).toContain('"cierre": {"frase"');
    expect(step1).toContain("A1–A15");
    expect(step1).not.toMatch(/reglas 1[–-]23/);
  });
});

describe("Parser de la etapa 1: cierre y cierre_posterior", () => {
  const wrap = (punto: object) =>
    JSON.stringify({ summary: "r", puntos: [{ id: "P1", cita: "c", timestamp: "01:00", clase: "cerrado", accion: "seguimiento", repo: "panel", ...punto }] });

  it("acepta el campo v10 cierre y lo unifica con el formato del normalizador", () => {
    const data = MeetingAnalysisResponseParser.parseStep1Extraction(wrap({ cierre: { frase: "ya estaba", timestamp: "02:00" } }));
    const p = data.puntos[0] as any;
    expect(p.cierre_posterior?.cita).toBe("ya estaba");
    expect(p.cierre_posterior?.timestamp).toBe("02:00");
  });

  it("sigue aceptando el campo legado cierre_posterior", () => {
    const data = MeetingAnalysisResponseParser.parseStep1Extraction(wrap({ cierre_posterior: { cita: "ya va en la PR", timestamp: "03:00" } }));
    const p = data.puntos[0] as any;
    expect(p.cierre_posterior?.cita).toBe("ya va en la PR");
    expect(p.cierre?.frase).toBe("ya va en la PR");
  });
});
