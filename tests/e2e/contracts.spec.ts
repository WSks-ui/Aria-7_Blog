import { test, expect } from "./fixtures";
import { dismissSplash, navigateWithClientRouter, waitForInteractions } from "./helpers";

test("全站持久组件与交互标记保持唯一", async ({ page }) => {
  await page.goto("/");
  await dismissSplash(page);
  await waitForInteractions(page);

  const selectors = [
    "[data-side-tools]",
    "[data-music-root]",
    "[data-music-audio]",
    "[data-console-trigger]",
    "[data-custom-cursor]",
    "[data-command-palette]",
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
});

test("持久 Dock 切页时保留节点与播放器状态", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "持久播放器契约只需在桌面浏览器验证");
  await page.goto("/");
  await dismissSplash(page);
  await waitForInteractions(page);

  const dock = page.locator("[data-side-tools]");
  const audio = page.locator("[data-music-audio]");
  await dock.evaluate((node) => {
    (node as HTMLElement).dataset.contractIdentity = "persistent-dock";
  });
  await audio.evaluate((node) => {
    node.dataset.contractIdentity = "persistent-audio";
  });
  // 通过用户实际可操作的音量控件写入，确保播放器状态与持久化存储保持一致。
  await page.locator("[data-console-trigger]").click();
  await page.locator("[data-music-volume]").fill("0.61");
  await expect.poll(() => audio.evaluate(
    (node: HTMLAudioElement) => node.volume,
  )).toBeCloseTo(0.61, 2);

  for (const href of ["/blog", "/game", "/works", "/"]) {
    await navigateWithClientRouter(page, href);
    await expect(page.locator('[data-side-tools][data-contract-identity="persistent-dock"]')).toHaveCount(1);
    await expect(page.locator('[data-music-audio][data-contract-identity="persistent-audio"]')).toHaveCount(1);
    await expect.poll(() => page.locator("[data-music-audio]").evaluate(
      (node: HTMLAudioElement) => node.volume,
    )).toBeCloseTo(0.61, 2);
  }
});
