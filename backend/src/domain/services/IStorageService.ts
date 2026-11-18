export interface IStorageService {
  save(sourcePathOrBuffer: string | Buffer, destinationKey: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getAbsolutePath(key: string): string;
}
