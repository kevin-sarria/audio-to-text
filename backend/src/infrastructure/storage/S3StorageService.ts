import { IStorageService } from "../../domain/services/IStorageService.js";
import { NotImplementedError } from "../../domain/errors/NotImplementedError.js";

export class S3StorageService implements IStorageService {
  constructor(
    private bucketName: string,
    private region: string
  ) {}

  public async save(_sourcePathOrBuffer: string | Buffer, _destinationKey: string): Promise<string> {
    throw new NotImplementedError("S3StorageService.save");
  }

  public async get(_key: string): Promise<Buffer> {
    throw new NotImplementedError("S3StorageService.get");
  }

  public async delete(_key: string): Promise<void> {
    // Idempotente stub
    throw new NotImplementedError("S3StorageService.delete");
  }

  public async exists(_key: string): Promise<boolean> {
    throw new NotImplementedError("S3StorageService.exists");
  }

  public getAbsolutePath(key: string): string {
    return `s3://${this.bucketName}/${key}`;
  }
}
