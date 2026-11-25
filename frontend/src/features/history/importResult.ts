import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";

export interface ImportMessage {
  severity: "success" | "info" | "warning";
  message: string;
}

export function describeImportResult(r: ImportBotMeetingsResultDto): ImportMessage {
  if (r.folderMissing) {
    return {
      severity: "warning",
      message: `La carpeta de entrega del bot no existe todavía: ${r.folder}. Ejecuta el bot o configura la carpeta en Configuración.`
    };
  }

  const parts: string[] = [];
  if (r.imported > 0) {
    parts.push(r.imported === 1 ? "Se importó 1 reunión nueva." : `Se importaron ${r.imported} reuniones nuevas.`);
    if (r.alreadyImported > 0) {
      parts[0] = parts[0]!.replace(/\.$/, "") + (r.alreadyImported === 1 ? " (1 ya estaba importada)." : ` (${r.alreadyImported} ya estaban importadas).`);
    }
  } else if (r.alreadyImported > 0) {
    parts.push(`No hay reuniones nuevas. ${r.alreadyImported} ya ${r.alreadyImported === 1 ? "estaba importada" : "estaban importadas"}.`);
  } else {
    parts.push("No hay reuniones nuevas para importar.");
  }

  if (r.failed.length > 0) {
    const first = r.failed[0]!;
    parts.push(
      `${r.failed.length} ${r.failed.length === 1 ? "archivo no se pudo importar" : "archivos no se pudieron importar"} (${first.file}: ${first.reason}).`
    );
    return { severity: "warning", message: parts.join(" ") };
  }

  return { severity: r.imported > 0 ? "success" : "info", message: parts.join(" ") };
}
