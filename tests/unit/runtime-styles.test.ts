import { describe, expect, it, vi } from "vitest";
import { RuntimeStyles } from "../../src/scripts/core/runtime-styles";

class FakeStyleDeclaration {
  readonly values = new Map<string, string>();

  setProperty(property: string, value: string): void {
    this.values.set(property, value);
  }

  removeProperty(property: string): string {
    const previous = this.values.get(property) ?? "";
    this.values.delete(property);
    return previous;
  }
}

class FakeStyleRule {
  readonly style = new FakeStyleDeclaration();

  constructor(readonly selectorText: string) {}
}

class FakeStyleSheet {
  readonly cssRules: FakeStyleRule[] = [];

  insertRule(ruleText: string, index: number): number {
    const selectorText = ruleText.slice(0, ruleText.indexOf("{")).trim();
    this.cssRules.splice(index, 0, new FakeStyleRule(selectorText));
    return index;
  }

  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

const asSheet = (sheet: FakeStyleSheet): CSSStyleSheet => sheet as unknown as CSSStyleSheet;
const asElement = (element: FakeElement): Element => element as unknown as Element;

const getOnlyRule = (sheet: FakeStyleSheet): FakeStyleRule => {
  expect(sheet.cssRules).toHaveLength(1);
  return sheet.cssRules[0];
};

describe("RuntimeStyles", () => {
  it("set 创建规则、规范化数字，并支持更新和删除属性", () => {
    const sheet = new FakeStyleSheet();
    const target = new FakeElement();
    const provider = vi.fn(() => asSheet(sheet));
    const styles = new RuntimeStyles(provider);

    styles.set(null, "width", 10);
    styles.set(undefined, "width", 10);
    expect(provider).not.toHaveBeenCalled();

    styles.set(asElement(target), "width", 10);
    const id = target.getAttribute("data-aria-runtime-style");
    expect(id).toMatch(/^aria-/);
    expect(getOnlyRule(sheet).selectorText).toBe(
      `[data-aria-runtime-style="${id}"]:not(#aria-runtime-a):not(#aria-runtime-b):not(#aria-runtime-c)`,
    );
    expect(getOnlyRule(sheet).style.values.get("width")).toBe("10");

    styles.set(asElement(target), "width", "25px");
    expect(getOnlyRule(sheet).style.values.get("width")).toBe("25px");

    styles.remove(asElement(target), "width");
    expect(getOnlyRule(sheet).style.values.has("width")).toBe(false);
    styles.remove(asElement(target), "missing");
    styles.remove(null, "width");
    styles.remove(undefined, "width");
    expect(sheet.cssRules).toHaveLength(1);
  });

  it("样式表替换后重建规则并恢复全部缓存值", () => {
    const firstSheet = new FakeStyleSheet();
    const secondSheet = new FakeStyleSheet();
    const target = new FakeElement();
    let activeSheet = firstSheet;
    const styles = new RuntimeStyles(() => asSheet(activeSheet));

    styles.set(asElement(target), "--x", "12px");
    styles.set(asElement(target), "--opacity", 0.5);
    const originalId = target.getAttribute("data-aria-runtime-style");

    activeSheet = secondSheet;
    // 即使传入值没有变化，也应先发现 link 已替换并恢复整条规则。
    styles.set(asElement(target), "--x", "12px");

    expect(firstSheet.cssRules).toHaveLength(0);
    expect(getOnlyRule(secondSheet).selectorText).toBe(
      `[data-aria-runtime-style="${originalId}"]:not(#aria-runtime-a):not(#aria-runtime-b):not(#aria-runtime-c)`,
    );
    expect(getOnlyRule(secondSheet).style.values).toEqual(
      new Map([
        ["--x", "12px"],
        ["--opacity", "0.5"],
      ]),
    );
  });

  it("clear 删除规则、内部标识和缓存，且可安全重复调用", () => {
    const sheet = new FakeStyleSheet();
    const target = new FakeElement();
    const styles = new RuntimeStyles(() => asSheet(sheet));
    styles.set(asElement(target), "left", "20px");
    const firstId = target.getAttribute("data-aria-runtime-style");

    styles.clear(asElement(target));
    expect(sheet.cssRules).toHaveLength(0);
    expect(target.getAttribute("data-aria-runtime-style")).toBeNull();
    styles.clear(asElement(target));
    styles.clear(null);
    styles.clear(undefined);

    styles.set(asElement(target), "left", "30px");
    expect(target.getAttribute("data-aria-runtime-style")).not.toBe(firstId);
    expect(getOnlyRule(sheet).style.values.get("left")).toBe("30px");
  });

  it("dispose 清理该实例管理的全部元素", () => {
    const sheet = new FakeStyleSheet();
    const first = new FakeElement();
    const second = new FakeElement();
    const styles = new RuntimeStyles(() => asSheet(sheet));
    styles.set(asElement(first), "top", "1px");
    styles.set(asElement(second), "top", "2px");
    expect(sheet.cssRules).toHaveLength(2);

    styles.dispose();
    expect(sheet.cssRules).toHaveLength(0);
    expect(first.getAttribute("data-aria-runtime-style")).toBeNull();
    expect(second.getAttribute("data-aria-runtime-style")).toBeNull();
    styles.dispose();
    expect(sheet.cssRules).toHaveLength(0);
  });

  it("provider 暂时不可用或抛错后，恢复时回放期间保存的全部值", () => {
    const sheet = new FakeStyleSheet();
    const target = new FakeElement();
    let mode: "missing" | "throw" | "ready" = "missing";
    const provider = vi.fn(() => {
      if (mode === "throw") throw new Error("stylesheet loading");
      return mode === "ready" ? asSheet(sheet) : null;
    });
    const styles = new RuntimeStyles(provider);

    styles.set(asElement(target), "--x", "1");
    mode = "throw";
    styles.set(asElement(target), "--y", "2");
    expect(sheet.cssRules).toHaveLength(0);

    mode = "ready";
    styles.set(asElement(target), "--x", "1");
    expect(getOnlyRule(sheet).style.values).toEqual(
      new Map([
        ["--x", "1"],
        ["--y", "2"],
      ]),
    );
  });
});
