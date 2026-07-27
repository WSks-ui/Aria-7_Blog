import { test, expect } from "./fixtures";
import { navigateWithClientRouter, waitForInteractions } from "./helpers";

const move = async (page: import("@playwright/test").Page, from: string, to: string) => {
  const source = page.locator(`[data-square="${from}"]`);
  const target = page.locator(`[data-square="${to}"]`);
  await source.click();
  await expect(source).toHaveClass(/is-selected/);
  await expect(target).toHaveClass(/is-(?:move|capture)-target/);
  await target.click();
};

test("棋局支持开始、走子、悔棋、翻转和新局", async ({ page }) => {
  await page.goto("/game/");
  await waitForInteractions(page);
  const room = page.locator("[data-chess-room]");
  const board = page.locator("[data-chess-board]");
  await expect(board.locator("[data-square]")).toHaveCount(64);

  await page.locator("[data-chess-ai]").uncheck({ force: true });
  await page.locator("[data-chess-start-button]").click();
  await expect(room).toHaveClass(/is-game-started/);
  await move(page, "e2", "e4");
  await expect(page.locator("[data-chess-log] .chess-move")).toHaveCount(1);

  const drawerToggle = page.locator("[data-chess-drawer-toggle]");
  await drawerToggle.click();
  await expect(drawerToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-chess-undo]")).toBeVisible();

  await page.locator("[data-chess-undo]").click();
  await expect(page.locator("[data-chess-log] .chess-move-log__empty")).toBeVisible();

  await page.locator("[data-chess-flip]").click();
  await expect(board).toHaveClass(/is-flipped/);
  await page.locator("[data-chess-new]").click();
  await expect(page.locator("[data-chess-log] .chess-move-log__empty")).toBeVisible();
});

test("电脑执黑会在玩家走子后完成应答", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "AI 路径只需在一个浏览器项目验证");
  await page.goto("/game/");
  await page.locator("[data-chess-start-button]").click();
  await move(page, "e2", "e4");

  const blackMove = page.locator("[data-chess-log] .chess-move strong").nth(1);
  await expect(blackMove).not.toHaveText("", { timeout: 2_500 });
  await expect(page.locator("[data-chess-status]")).toContainText("白方行动");
  await expect(page.locator("[data-chess-room]")).not.toHaveClass(/is-thinking/);
});

test("切页返回后棋盘只挂载一次并可重新操作", async ({ page }) => {
  await page.goto("/game/");
  await expect(page.locator("[data-chess-board] [data-square]")).toHaveCount(64);
  await navigateWithClientRouter(page, "/blog");
  await navigateWithClientRouter(page, "/game");

  await expect(page.locator("[data-chess-room]")).toHaveCount(1);
  await expect(page.locator("[data-chess-board] [data-square]")).toHaveCount(64);
  await page.locator("[data-chess-start-button]").click();
  await expect(page.locator("[data-chess-room]")).toHaveClass(/is-game-started/);
});

test("棋盘以 roving tabindex 提供方向键与完整中文棋子读法", async ({ page }) => {
  await page.goto("/game/");
  await waitForInteractions(page);
  await page.locator("[data-chess-ai]").uncheck({ force: true });
  await page.locator("[data-chess-start-button]").click();

  const board = page.locator("[data-chess-board]");
  const rovingSquare = board.locator('[data-square][tabindex="0"]');
  await expect(rovingSquare).toHaveCount(1);
  await expect(rovingSquare).toHaveAttribute("data-square", "e2");
  await expect(board.locator('[data-square="e2"]')).toHaveAttribute("aria-label", /白方兵/);
  await expect(page.locator("[data-chess-status]")).toHaveAttribute("aria-live", "polite");

  await rovingSquare.focus();
  await page.keyboard.press("ArrowUp");
  await expect(rovingSquare).toHaveAttribute("data-square", "e3");
  await page.keyboard.press("ArrowDown");
  await expect(rovingSquare).toHaveAttribute("data-square", "e2");

  await page.keyboard.press("Enter");
  await expect(board.locator('[data-square="e2"]')).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await expect(page.locator("[data-chess-log] .chess-move")).toHaveCount(1);
  await expect(board.locator('[data-square][tabindex="0"]')).toHaveCount(1);
  await expect(board.locator('[data-square="e3"]')).toHaveAttribute("aria-label", /白方兵/);
});
