import fs from "node:fs/promises";
import path from "node:path";
import { IStorageService } from "../../domain/services/IStorageService.js";

export class LocalStorageService implements IStorageService {
  private basePath: string;

  constructor(basePath: string = "./storage") {
    this.basePath = path.resolve(basePath);
  }

  public async save(sourcePathOrBuffer: string | Buffer, destinationKey: string): Promise<string> {
    const fullPath = this.getAbsolutePath(destinationKey);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });

    if (Buffer.isBuffer(sourcePathOrBuffer)) {
      await fs.writeFile(fullPath, sourcePathOrBuffer);
    } else {
      await fs.copyFile(sourcePathOrBuffer, fullPath);
    }

    return destinationKey;
  }

  public async get(key: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(key);
    return await fs.readFile(fullPath);
  }

  public async delete(key: string): Promise<void> {
    const fullPath = this.getAbsolutePath(key);
    try {
      await fs.unlink(fullPath);
    } catch (error: any) {
      // Idempotente: ENOENT no es error si el archivo ya no existe
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  public async exists(key: string): Promise<boolean> {
    const fullPath = this.getAbsolutePath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public getAbsolutePath(key: string): string {
    // Prevenir path traversal: la ruta resuelta debe quedar estrictamente dentro de basePath.
    // Cubre "../x", "a/../../x", separadores "\" y rutas absolutas (incluida otra unidad en Windows).
    const fullPath = path.resolve(this.basePath, key);
    const relative = path.relative(this.basePath, fullPath);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Clave de almacenamiento inválida (fuera del almacenamiento): ${key}`);
    }
    return fullPath;
  }
}
