type StyleSheetProvider = () => CSSStyleSheet | null;

interface RuntimeStyleEntry {
  id: string;
  rule: CSSStyleRule | null;
  sheet: CSSStyleSheet | null;
  values: Map<string, string>;
}

const instancePrefix = Math.random().toString(36).slice(2, 10);
let nextStyleId = 0;

const defaultStyleSheetProvider: StyleSheetProvider = () => {
  const link = document.querySelector<HTMLLinkElement>("link[data-aria-runtime-styles]");
  return link?.sheet ?? null;
};

const removeRule = (entry: RuntimeStyleEntry) => {
  if (!entry.sheet || !entry.rule) return;
  try {
    const index = Array.from(entry.sheet.cssRules).indexOf(entry.rule);
    if (index >= 0) entry.sheet.deleteRule(index);
  } catch {
    // 客户端路由可能已经替换旧样式表；旧规则随 link 一起释放即可。
  }
  entry.rule = null;
  entry.sheet = null;
};

/**
 * 在同源外部样式表中为单个元素维护动态规则。
 *
 * 生产 CSP 禁止 style 属性，因此不能用 element.style 写滚动进度、坐标或 CSS 变量。
 * 这里给元素分配内部 data 标识，并通过已获 style-src 'self' 授权的外部样式表 CSSOM
 * 更新规则。dispose 会删除本页创建的全部规则，避免 ClientRouter 往返后残留引用。
 */
export class RuntimeStyles {
  readonly #entries = new Map<Element, RuntimeStyleEntry>();
  readonly #styleSheetProvider: StyleSheetProvider;

  constructor(styleSheetProvider: StyleSheetProvider = defaultStyleSheetProvider) {
    this.#styleSheetProvider = styleSheetProvider;
  }

  #getEntry(target: Element): RuntimeStyleEntry {
    const current = this.#entries.get(target);
    if (current) return current;

    const id = `aria-${instancePrefix}-${nextStyleId++}`;
    const entry: RuntimeStyleEntry = {
      id,
      rule: null,
      sheet: null,
      values: new Map(),
    };
    target.setAttribute("data-aria-runtime-style", id);
    this.#entries.set(target, entry);
    return entry;
  }

  #getRule(entry: RuntimeStyleEntry): CSSStyleRule | null {
    let sheet: CSSStyleSheet | null;
    try {
      sheet = this.#styleSheetProvider();
    } catch {
      return null;
    }
    if (!sheet) return null;
    if (entry.sheet === sheet && entry.rule) return entry.rule;

    removeRule(entry);
    try {
      // Astro 会把路由 CSS 放在本样式表之后。三个保留 ID 的 :not() 在站点内始终成立，
      // 但会把规则权重提升到原内联样式的量级，避免后加载的 class 默认值覆盖动态值。
      const selector =
        `[data-aria-runtime-style="${entry.id}"]` +
        ":not(#aria-runtime-a):not(#aria-runtime-b):not(#aria-runtime-c)";
      const index = sheet.insertRule(
        `${selector} {}`,
        sheet.cssRules.length,
      );
      const rule = sheet.cssRules[index] as CSSStyleRule | undefined;
      if (!rule?.style) {
        sheet.deleteRule(index);
        return null;
      }
      entry.sheet = sheet;
      entry.rule = rule;
      entry.values.forEach((value, property) => rule.style.setProperty(property, value));
      return rule;
    } catch {
      return null;
    }
  }

  set(target: Element | null | undefined, property: string, value: string | number): void {
    if (!target) return;
    const entry = this.#getEntry(target);
    const rule = this.#getRule(entry);
    const normalized = String(value);
    if (entry.values.get(property) === normalized) return;
    entry.values.set(property, normalized);
    rule?.style.setProperty(property, normalized);
  }

  remove(target: Element | null | undefined, property: string): void {
    if (!target) return;
    const entry = this.#entries.get(target);
    if (!entry || !entry.values.delete(property)) return;
    this.#getRule(entry)?.style.removeProperty(property);
  }

  clear(target: Element | null | undefined): void {
    if (!target) return;
    const entry = this.#entries.get(target);
    if (!entry) return;
    removeRule(entry);
    target.removeAttribute("data-aria-runtime-style");
    this.#entries.delete(target);
  }

  dispose(): void {
    [...this.#entries.keys()].forEach((target) => this.clear(target));
  }
}
