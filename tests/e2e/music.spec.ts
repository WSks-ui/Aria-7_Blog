import { test, expect } from "./fixtures";
import { dismissSplash, openMusicSources } from "./helpers";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "播放器网络竞态只需在桌面 Chromium 验证");
  await page.goto("/");
  await dismissSplash(page);
  await openMusicSources(page);
});

test("晚到的 Meting 响应不会覆盖已切回的本地音源", async ({ page }) => {
  let releaseResponse!: () => void;
  let markStarted!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  await page.route("https://api.i-meto.com/**", async (route) => {
    markStarted();
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{
        name: "Remote should be stale",
        artist: "Race Test",
        url: "https://api.i-meto.com/test/stale.mp3",
      }]),
    }).catch(() => {});
  });

  await page.locator('button[data-music-mode="meting"]').click();
  await requestStarted;
  await page.locator('button[data-music-mode="local"]').click();
  releaseResponse();

  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "local");
  await expect(page.locator('button[data-music-mode="local"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-music-title]").first()).toHaveText("Shelter");
  await expect(page.locator("[data-music-count]").first()).toHaveText("1 / 1");
  await expect(page.locator("[data-music-player]")).not.toHaveClass(/is-source-loading/);
});

test("Meting 响应无效时回退到本地曲目", async ({ page }) => {
  await page.route("https://api.i-meto.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    headers: { "access-control-allow-origin": "*" },
    // 使用畸形成功响应触发解析失败，避免预期内的 5xx 被浏览器记录成 console.error。
    body: "{ malformed-json",
  }));

  await page.locator('button[data-music-mode="meting"]').click();
  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "local");
  await expect(page.locator("[data-music-source-hint]")).toContainText("已切回本地");
  await expect(page.locator("[data-music-title]").first()).toHaveText("Shelter");
});
