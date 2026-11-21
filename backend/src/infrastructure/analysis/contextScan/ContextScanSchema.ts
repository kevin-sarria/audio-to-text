import { z } from "zod";

export const SCAN_SECTIONS = [
  { key: "proposito", title: "Qué hace el sistema y para quién" },
  { key: "trampas", title: "Trampas: lo que un desarrollador nuevo rompería" },
  { key: "repositorios", title: "Repositorios" },
  { key: "tecnologias", title: "Tecnologías y versiones" },
  { key: "capas_estructura", title: "Capas y estructura de carpetas" },
  { key: "glosario", title: "Glosario (cómo se dice en las reuniones → nombre en el código)" },
  { key: "roles_permisos", title: "Roles y permisos" },
  { key: "flujos", title: "Flujos principales del usuario" },
  { key: "reglas_negocio_ubicacion", title: "Dónde están las reglas de negocio y cómo se citan" },
  { key: "reglas_inquebrantables", title: "Reglas que no se pueden romper" },
  { key: "cambios_base_datos", title: "Cómo se cambia la base de datos" },
  { key: "verificacion", title: "Cómo se verifica un cambio" },
  { key: "ramas_pr", title: "Ramas, PR y quién aprueba" },
  { key: "despliegue", title: "Despliegue y entornos" },
  { key: "como_escribir_issues", title: "Cómo escribir issues en este proyecto" },
  { key: "contradicciones", title: "Contradicciones encontradas" },
  { key: "preguntas_abiertas", title: "Preguntas que no se pudieron resolver con el código" }
] as const;

export type ScanSectionKey = (typeof SCAN_SECTIONS)[number]["key"];

export const DATA_SECTION_KEYS = [
  "proposito",
  "trampas",
  "repositorios",
  "tecnologias",
  "capas_estructura",
  "roles_permisos",
  "flujos",
  "reglas_negocio_ubicacion",
  "reglas_inquebrantables",
  "cambios_base_datos",
  "verificacion",
  "ramas_pr",
  "despliegue",
  "como_escribir_issues"
] as const;

export type DataSectionKey = (typeof DATA_SECTION_KEYS)[number];

/**
 * confirmado: la cita (o el valor literal) aparece en la fuente.
 * deducido: el modelo lo infiere de fuentes que existen, pero no está literal.
 * sin_confirmar: la fuente existe pero no se encontró la cita.
 */
export const FactStatusSchema = z.enum(["confirmado", "deducido", "sin_confirmar"]);
export type FactStatus = z.infer<typeof FactStatusSchema>;

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined));

/**
 * Un hecho: `valor` es la respuesta concreta (no el tema), `cita` el texto literal
 * de la fuente. Acepta el formato anterior (`dato` sin `valor`) copiando `dato` a `valor`.
 */
export const ScanItemSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const o: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    if ((typeof o.valor !== "string" || !o.valor.trim()) && typeof o.dato === "string") o.valor = o.dato;
    if ((typeof o.fuente !== "string" || !o.fuente.trim()) && Array.isArray(o.deducido_de) && o.deducido_de.length) {
      o.fuente = o.deducido_de.join(", ");
    }
    return o;
  },
  z.object({
    valor: z.string().min(1, "El valor no puede estar vacío"),
    cita: optionalText,
    fuente: z.string().min(1, "La fuente no puede estar vacía"),
    impacto: optionalText,
    deducido_de: z.array(z.string()).optional(),
    /** Etiqueta del tema (formato anterior). No se muestra. */
    dato: z.string().optional(),
    estado: FactStatusSchema.optional(),
    /** Lo marca el verificador: el valor nombra el tema sin responderlo. */
    tema: z.boolean().optional(),
    /** Lo marca el verificador: el valor es un tema pero la cita confirmada trae el dato. */
    mostrar_cita: z.boolean().optional()
  })
);
export type ScanItem = z.infer<typeof ScanItemSchema>;

export const GlossaryItemSchema = z.object({
  termino_reunion: z.string().min(1),
  sinonimos: z.array(z.string()).default([]),
  nombre_codigo: z.string().min(1),
  fuente: z.string().min(1),
  cita: optionalText,
  estado: FactStatusSchema.optional()
});
export type GlossaryItem = z.infer<typeof GlossaryItemSchema>;

export const ContradictionSchema = z.object({
  descripcion: z.string().min(1),
  fuentes: z.array(z.string()).min(1),
  gana: z.string().default("sin resolver"),
  motivo: z
    .enum(["codigo_sobre_documento", "mas_reciente", "sin_resolver"])
    .default("sin_resolver")
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

export const ScanSectionsObjectSchema = z
  .object({
    proposito: z.array(ScanItemSchema).default([]),
    trampas: z.array(ScanItemSchema).default([]),
    repositorios: z.array(ScanItemSchema).default([]),
    tecnologias: z.array(ScanItemSchema).default([]),
    capas_estructura: z.array(ScanItemSchema).default([]),
    roles_permisos: z.array(ScanItemSchema).default([]),
    flujos: z.array(ScanItemSchema).default([]),
    reglas_negocio_ubicacion: z.array(ScanItemSchema).default([]),
    reglas_inquebrantables: z.array(ScanItemSchema).default([]),
    cambios_base_datos: z.array(ScanItemSchema).default([]),
    verificacion: z.array(ScanItemSchema).default([]),
    ramas_pr: z.array(ScanItemSchema).default([]),
    despliegue: z.array(ScanItemSchema).default([]),
    como_escribir_issues: z.array(ScanItemSchema).default([]),
    glosario: z.array(GlossaryItemSchema).default([]),
    contradicciones: z.array(ContradictionSchema).default([]),
    preguntas_abiertas: z.array(z.string()).default([])
  })
  .passthrough()
  .default({});

export const ScanResponseSchema = z
  .object({
    secciones: ScanSectionsObjectSchema.default({}),
    no_encontrado: z
      .array(
        z.enum([
          "proposito",
          "trampas",
          "repositorios",
          "tecnologias",
          "capas_estructura",
          "glosario",
          "roles_permisos",
          "flujos",
          "reglas_negocio_ubicacion",
          "reglas_inquebrantables",
          "cambios_base_datos",
          "verificacion",
          "ramas_pr",
          "despliegue",
          "como_escribir_issues",
          "contradicciones",
          "preguntas_abiertas"
        ])
      )
      .default([])
  })
  .passthrough();

export type ScanResponse = z.infer<typeof ScanResponseSchema>;

export function extractJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*```$/, "");
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export function parseScanResponse(
  raw: string
): { ok: true; data: ScanResponse } | { ok: false; error: string } {
  try {
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);
    const validated = ScanResponseSchema.parse(parsed);
    return { ok: true, data: validated };
  } catch (err: any) {
    let msg = "";
    if (err instanceof z.ZodError) {
      msg = `Error de validación del esquema: ${err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`;
    } else {
      msg = `Error al parsear JSON: ${err?.message || String(err)}`;
    }
    return { ok: false, error: msg.slice(0, 1500) };
  }
}

export function findIncompleteSections(data: ScanResponse): ScanSectionKey[] {
  const notFoundSet = new Set<string>(data.no_encontrado || []);
  const incomplete: ScanSectionKey[] = [];

  for (const item of SCAN_SECTIONS) {
    const key = item.key;
    if (key === "contradicciones" || key === "preguntas_abiertas") {
      // Vacías = "ninguna", no son incompletas
      continue;
    }

    if (notFoundSet.has(key)) {
      continue;
    }

    const secData = data.secciones[key as keyof typeof data.secciones];

    if (!secData || !Array.isArray(secData) || secData.length === 0) {
      incomplete.push(key);
      continue;
    }

    // Verificar si los items tienen dato vacío o solo espacios
    if (key === "glosario") {
      const glosarioItems = secData as GlossaryItem[];
      const allEmpty = glosarioItems.every(
        (g) => !g.termino_reunion?.trim() || !g.nombre_codigo?.trim()
      );
      if (allEmpty) {
        incomplete.push(key);
      }
    } else {
      const scanItems = secData as ScanItem[];
      const allEmpty = scanItems.every((si) => !si.valor || !si.valor.trim());
      if (allEmpty) {
        incomplete.push(key);
      }
    }
  }

  return incomplete;
}
