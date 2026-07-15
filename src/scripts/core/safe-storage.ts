export type StorageProvider = () => Storage | null;

export class SafeStorage {
  readonly #provider: StorageProvider;

  constructor(provider: StorageProvider = () => window.localStorage) {
    this.#provider = provider;
  }

  #storage(): Storage | null {
    try {
      return this.#provider();
    } catch {
      return null;
    }
  }

  get(key: string, fallback: string | null = null): string | null {
    try {
      return this.#storage()?.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: string): boolean {
    try {
      const storage = this.#storage();
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      const storage = this.#storage();
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  getJSON<T>(key: string, fallback: T, guard?: (value: unknown) => value is T): T {
    const value = this.get(key);
    if (value === null) return fallback;
    try {
      const parsed: unknown = JSON.parse(value);
      return !guard || guard(parsed) ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  }

  setJSON(key: string, value: unknown): boolean {
    try {
      return this.set(key, JSON.stringify(value));
    } catch {
      return false;
    }
  }
}

export const createSafeStorage = (provider?: StorageProvider): SafeStorage => new SafeStorage(provider);

