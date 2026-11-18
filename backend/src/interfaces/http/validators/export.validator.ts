import { z } from "zod";
import { ExportFormat } from "@audio-to-text/shared";

export const ExportSessionQueryValidator = z.object({
  format: z.nativeEnum(ExportFormat)
});
