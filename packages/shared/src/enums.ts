export enum AuthProvider {
  LOCAL = "LOCAL",
  GOOGLE = "GOOGLE"
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DELETED = "DELETED"
}

export enum SessionStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED"
}

export enum ExportFormat {
  SRT = "srt",
  VTT = "vtt",
  TXT = "txt",
  MD = "md",
  DOCX = "docx",
  PDF = "pdf",
  XLSX = "xlsx"
}
