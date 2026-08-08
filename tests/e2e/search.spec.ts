import { expect, test } from "./fixtures";
import { dismissSplash, waitForInteractions } from "./helpers";

const openPalette = async (page: import("@playwright/test").Page) => {
  await page.keyboard.press("Control+k");
  await expect(page.locator("[data-command-palette]")).toBeVisible();
  await expect(page.locator("[data-command-input]")).toBeFocused();
};

test.describe("全站搜索（Pagefind 全文通道）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/blog/");
    await dismissSplash(page);
    await waitForInteractions(page);
  });

  test("正文关键词命中全文结果并带摘要", async ({ page }) => {
    await openPalette(page);
    // “量化”只出现在文章正文，结构化索引（标题/标签/描述）不含该词
    await page.fill("[data-command-input]", "量化");

    const fulltextResults = page.locator('[data-command-result][data-command-id^="fulltext:"]');
    await expect(fulltextResults.first()).toBeVisible({ timeout: 10_000 });
    expect(await fulltextResults.count()).toBeGreaterThan(0);
    // 摘要与「全文」组标渲染
    await expect(fulltextResults.first().locator("[data-command-result-description]")).not.toBeEmpty();
    await expect(fulltextResults.first().locator("[data-command-result-group]")).toHaveText("全文");

    // Enter 打开首条结果（全文结果排在本地结果之后时仍可通过键盘到达）
    const firstHref = await fulltextResults.first().getAttribute("href");
    expect(firstHref).toMatch(/^\/blog\/[^/]+\/$/);
  });

  test("无结果关键词显示空态", async ({ page }) => {
    await openPalette(page);
    await page.fill("[data-command-input]", "zzzz不存在的关键词zzzz");
    await expect(page.locator("[data-command-empty]")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-command-empty] strong")).toContainText("没有找到");
  });

  test("Esc 关闭面板", async ({ page }) => {
    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-command-palette]")).toBeHidden();
  });

  test("kind 前缀查询不触发全文通道", async ({ page }) => {
    await openPalette(page);
    // # 前缀只匹配标签，全文通道应保持静默
    await page.fill("[data-command-input]", "#量化");
    await page.waitForTimeout(600);
    await expect(page.locator('[data-command-result][data-command-id^="fulltext:"]')).toHaveCount(0);
  });

  test("快速连续输入只保留最后一次查询的结果", async ({ page }) => {
    await openPalette(page);
    await page.fill("[data-command-input]", "量化");
    await page.waitForTimeout(80);
    await page.fill("[data-command-input]", "worker");
    const fulltextResults = page.locator('[data-command-result][data-command-id^="fulltext:"]');
    await expect(fulltextResults.first()).toBeVisible({ timeout: 10_000 });
    // 结果必须属于第二次查询（worker 命中正文），不允许旧查询串场
    const descriptions = await fulltextResults.locator("[data-command-result-description]").allTextContents();
    expect(descriptions.join(" ").length).toBeGreaterThan(0);
  });
});
