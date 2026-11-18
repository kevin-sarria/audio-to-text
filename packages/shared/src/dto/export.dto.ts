import { z } from "zod";
import { ExportFormat } from "../enums.js";

export const ExportSessionQuerySchema = z.object({
  format: z.nativeEnum(ExportFormat)
});

export type ExportSessionQuery = z.infer<typeof ExportSessionQuerySchema>;
