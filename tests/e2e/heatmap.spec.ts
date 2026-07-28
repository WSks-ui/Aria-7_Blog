import { test, expect } from "./fixtures";
import { waitForInteractions } from "./helpers";

// 快照 src/data/github-contributions.json 随仓库分发，任何环境下代码面板都应渲染。
test("归档页热力图渲染双面板且默认代码模式", async ({ page }) => {
  await page.goto("/blog/");
  await waitForInteractions(page);

  const heatmap = page.locator("[data-heatmap]");
  await expect(heatmap).toBeVisible();
  await expect(heatmap).toHaveAttribute("data-heatmap-default", "code");

  const codePanel = page.locator('[data-heatmap-panel="code"]');
  const writingPanel = page.locator('[data-heatmap-panel="writing"]');
  await expect(codePanel).toBeVisible();
  await expect(writingPanel).toBeHidden();

  // 网格规模：53 周窗口内带日期的格子超过 360 个（未来格子无 title）。
  const codeCells = codePanel.locator(".heatmap__cell[title]");
  expect(await codeCells.count()).toBeGreaterThan(360);
  await expect(codePanel.locator(".heatmap__months")).toContainText("7月");
});

test("热力图模式切换同步 URL 并在刷新后保持", async ({ page }) => {
  await page.goto("/blog/");
  await waitForInteractions(page);

  await page.locator('[data-heatmap-mode="writing"]').click();
  await expect(page.locator('[data-heatmap-panel="writing"]')).toBeVisible();
  await expect(page.locator('[data-heatmap-panel="code"]')).toBeHidden();
  await expect(page.locator('[data-heatmap-mode="writing"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/heatmap=writing/);

  await page.reload();
  await waitForInteractions(page);
  await expect(page.locator('[data-heatmap-panel="writing"]')).toBeVisible();
  await expect(page).toHaveURL(/heatmap=writing/);

  // 切回默认模式时参数应被清理，保持 URL 干净。
  await page.locator('[data-heatmap-mode="code"]').click();
  await expect(page.locator('[data-heatmap-panel="code"]')).toBeVisible();
  await expect(page).not.toHaveURL(/heatmap=/);
});

test("直接带参数访问时按 URL 初始化面板", async ({ page }) => {
  await page.goto("/blog/?heatmap=writing");
  await waitForInteractions(page);
  await expect(page.locator('[data-heatmap-panel="writing"]')).toBeVisible();
  await expect(page.locator('[data-heatmap-mode="writing"]')).toHaveAttribute("aria-pressed", "true");
});
