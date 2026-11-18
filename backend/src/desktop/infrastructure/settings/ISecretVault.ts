export interface ISecretVault {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
  has(name: string): Promise<boolean>;
}

export class InMemorySecretVault implements ISecretVault {
  private store = new Map<string, string>();

  public async get(name: string): Promise<string | null> {
    return this.store.get(name) ?? null;
  }

  public async set(name: string, value: string): Promise<void> {
    this.store.set(name, value);
  }

  public async delete(name: string): Promise<void> {
    this.store.delete(name);
  }

  public async has(name: string): Promise<boolean> {
    return this.store.has(name);
  }
}
