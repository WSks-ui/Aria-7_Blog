import { test, expect } from "./fixtures";
import { waitForInteractions } from "./helpers";

test("严格 CSP 下 RuntimeStyles 通过外链 CSSOM 写入可计算样式", async ({ page }) => {
  await page.goto("/blog/");
  await waitForInteractions(page);
  await page.keyboard.press("Control+K");
  await expect(page.locator("[data-command-palette]")).toBeVisible();

  const item = page.locator("[data-command-result]").nth(1);
  await expect(item).toBeVisible();
  await expect.poll(() => item.evaluate((node) =>
    getComputedStyle(node).getPropertyValue("--command-item-index").trim(),
  )).toBe("1");

  const runtimeStyle = await item.evaluate((node) => {
    const id = node.getAttribute("data-aria-runtime-style");
    const link = document.querySelector<HTMLLinkElement>("link[data-aria-runtime-styles]");
    const rules = link?.sheet ? Array.from(link.sheet.cssRules) : [];
    // 浏览器可能规范化 selectorText，按元素真实匹配关系定位规则更稳定。
    const matchingRule = rules.find((rule) =>
      rule instanceof CSSStyleRule
      && node.matches(rule.selectorText)
      && rule.style.getPropertyValue("--command-item-index"),
    ) as CSSStyleRule | undefined;
    const computed = getComputedStyle(node);

    return {
      computedDelay: computed.animationDelay,
      computedIndex: computed.getPropertyValue("--command-item-index").trim(),
      hasInlineStyle: node.hasAttribute("style"),
      href: link?.href ?? "",
      id,
      ruleValue: matchingRule?.style.getPropertyValue("--command-item-index").trim() ?? "",
    };
  });

  expect(runtimeStyle).toMatchObject({
    computedDelay: "0.092s",
    computedIndex: "1",
    hasInlineStyle: false,
    ruleValue: "1",
  });
  expect(runtimeStyle.href).toMatch(/\/runtime-styles\.css$/);
  expect(runtimeStyle.id).toMatch(/^aria-/);
});
