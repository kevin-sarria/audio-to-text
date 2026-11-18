import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import { ISecretVault } from "../../backend/src/desktop/infrastructure/settings/ISecretVault.js";

export class ElectronSecretVault implements ISecretVault {
  private filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "secrets.json");
  }

  private ensureEncryptionAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "No hay almacén seguro de claves disponible en este sistema. Instala gnome-keyring o kwallet."
      );
    }

    if (process.platform === "linux") {
      const backend = (safeStorage as any).getSelectedStorageBackend?.();
      if (backend === "basic_text") {
        throw new Error(
          "No hay almacén seguro de claves en este sistema. Instala gnome-keyring o kwallet."
        );
      }
    }
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = await fsp.readFile(this.filePath, "utf-8");
        return JSON.parse(content);
      }
    } catch (err) {
      console.warn("[ElectronSecretVault] No se pudo leer secrets.json, iniciando vacío:", err);
    }
    return {};
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsp.mkdir(dir, { recursive: true });

    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    const json = JSON.stringify(secrets, null, 2);

    await fsp.writeFile(tempPath, json, "utf-8");
    await fsp.rename(tempPath, this.filePath);
  }

  public async get(name: string): Promise<string | null> {
    this.ensureEncryptionAvailable();
    const secrets = await this.loadSecrets();
    const encryptedBase64 = secrets[name];
    if (!encryptedBase64) return null;

    try {
      const buffer = Buffer.from(encryptedBase64, "base64");
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.error(`[ElectronSecretVault] Error descifrando clave '${name}':`, err);
      return null;
    }
  }

  public async set(name: string, value: string): Promise<void> {
    this.ensureEncryptionAvailable();
    const encryptedBuffer = safeStorage.encryptString(value);
    const encryptedBase64 = encryptedBuffer.toString("base64");

    const secrets = await this.loadSecrets();
    secrets[name] = encryptedBase64;
    await this.saveSecrets(secrets);
  }

  public async delete(name: string): Promise<void> {
    const secrets = await this.loadSecrets();
    if (name in secrets) {
      delete secrets[name];
      await this.saveSecrets(secrets);
    }
  }

  public async has(name: string): Promise<boolean> {
    const secrets = await this.loadSecrets();
    return Boolean(secrets[name]);
  }
}
