import { db, PendingUpload } from "./db.js";
import { api } from "./api.js";

export class OfflineQueueManager {
  private isProcessing: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.processQueue().catch(console.error);
      });
    }
  }

  public async enqueueUpload(file: File, sourceLanguage?: string): Promise<number> {
    return await db.pendingUploads.add({
      fileName: file.name,
      fileBlob: file,
      sourceLanguage,
      createdAt: new Date()
    });
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;

    try {
      const items = await db.pendingUploads.toArray();
      for (const item of items) {
        if (!item.id) continue;
        try {
          const formData = new FormData();
          formData.append("audio", item.fileBlob, item.fileName);
          if (item.sourceLanguage) {
            formData.append("sourceLanguage", item.sourceLanguage);
          }

          await api.uploadWithProgress("/sessions", formData);
          await db.pendingUploads.delete(item.id);
        } catch (err) {
          console.warn(`Error procesando subida diferida ${item.fileName}:`, err);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const offlineQueue = new OfflineQueueManager();
