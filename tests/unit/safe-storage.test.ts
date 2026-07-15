import { describe, expect, it } from "vitest";
import { SafeStorage, createSafeStorage } from "../../src/scripts/core/safe-storage";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

describe("SafeStorage", () => {
  it("读写、删除字符串与 JSON", () => {
    const storage = createMemoryStorage();
    const safe = createSafeStorage(() => storage);

    expect(safe.get("missing", "fallback")).toBe("fallback");
    expect(safe.set("theme", "light")).toBe(true);
    expect(safe.get("theme")).toBe("light");
    expect(safe.setJSON("state", { index: 2 })).toBe(true);
    expect(safe.getJSON("state", { index: 0 })).toEqual({ index: 2 });
    expect(safe.remove("theme")).toBe(true);
    expect(safe.get("theme")).toBeNull();
  });

  it("隔离 storage getter 和原生方法抛出的异常", () => {
    const unavailable = new SafeStorage(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const broken = new SafeStorage(() => ({
      get length(): number {
        throw new Error("blocked");
      },
      clear: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    }));

    for (const safe of [unavailable, broken]) {
      expect(safe.get("key", "fallback")).toBe("fallback");
      expect(safe.getJSON("key", { ok: true })).toEqual({ ok: true });
      expect(safe.set("key", "value")).toBe(false);
      expect(safe.remove("key")).toBe(false);
    }
  });

  it("隔离无效 JSON、守卫失败与序列化错误", () => {
    const storage = createMemoryStorage();
    const safe = new SafeStorage(() => storage);
    storage.setItem("invalid", "{");
    storage.setItem("wrong-shape", JSON.stringify({ value: "2" }));

    const isState = (value: unknown): value is { value: number } =>
      Boolean(value && typeof value === "object" && typeof (value as { value?: unknown }).value === "number");
    expect(safe.getJSON("invalid", { value: 1 }, isState)).toEqual({ value: 1 });
    expect(safe.getJSON("wrong-shape", { value: 1 }, isState)).toEqual({ value: 1 });

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(safe.setJSON("cyclic", cyclic)).toBe(false);
  });
});
