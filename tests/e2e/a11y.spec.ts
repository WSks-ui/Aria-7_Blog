import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { test, expect } from "./fixtures";
import { dismissSplash, waitForInteractions } from "./helpers";

interface PrimaryPage {
  name: string;
  path: string;
  hasSplash?: boolean;
}

const primaryPages: readonly PrimaryPage[] = [
  { name: "首页", path: "/", hasSplash: true },
  { name: "博客归档", path: "/blog/" },
  { name: "文章页", path: "/blog/welcome/" },
  { name: "作品页", path: "/works/" },
  { name: "国际象棋页", path: "/game/" },
  { name: "个人页", path: "/me/" },
];

const formatViolations = (violations: Result[]) =>
  violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join("；");
      return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${targets})`;
    })
    .join("\n");

test.describe("主要页面无障碍门禁", () => {
  for (const pageDefinition of primaryPages) {
    test(`${pageDefinition.name}不存在 serious 或 critical 问题`, async ({ page }) => {
      await page.goto(pageDefinition.path);
      if (pageDefinition.hasSplash) await dismissSplash(page);
      else await waitForInteractions(page);

      const results = await new AxeBuilder({ page }).analyze();
      const severeViolations = results.violations.filter((violation) =>
        violation.impact === "serious" || violation.impact === "critical");

      expect(severeViolations, formatViolations(severeViolations)).toEqual([]);
    });
  }

  test("每个主要页面均有唯一 H1 和可用的主内容跳转链接", async ({ page }) => {
    for (const pageDefinition of primaryPages) {
      await page.goto(pageDefinition.path);
      if (pageDefinition.hasSplash) await dismissSplash(page);
      else await waitForInteractions(page);

      const main = page.locator("main#main-content");
      const skipLink = page.locator("[data-skip-link]");
      await expect(main).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await skipLink.focus();
      await expect(skipLink).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(main).toBeFocused();
    }
  });
});
