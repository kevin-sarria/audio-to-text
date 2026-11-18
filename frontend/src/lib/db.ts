import Dexie, { Table } from "dexie";

export interface PendingUpload {
  id?: number;
  fileName: string;
  fileBlob: Blob;
  sourceLanguage?: string;
  createdAt: Date;
}

export interface CachedSession {
  id: string;
  data: any;
  updatedAt: Date;
}

export class AudioToTextDatabase extends Dexie {
  public pendingUploads!: Table<PendingUpload, number>;
  public cachedSessions!: Table<CachedSession, string>;

  constructor() {
    super("AudioToTextDB");
    this.version(1).stores({
      pendingUploads: "++id, fileName, createdAt",
      cachedSessions: "id, updatedAt"
    });
  }
}

export const db = new AudioToTextDatabase();
