import { test, expect } from "./fixtures";
import { dismissSplash, navigateWithClientRouter, waitForInteractions } from "./helpers";

test.describe("首页欢迎层", () => {
  for (const method of ["click", "enter"] as const) {
    test(`可通过${method === "click" ? "点击" : " Enter 键"}立即跳过`, async ({ page }) => {
      await page.goto("/");
      const startedAt = await page.evaluate(() => performance.now());
      await dismissSplash(page, method);
      const elapsed = await page.evaluate((start) => performance.now() - start, startedAt);

      expect(elapsed).toBeLessThan(1_500);
      await expect(page.locator("#hero-title")).toBeVisible();
    });
  }

  test("资源迟迟未完成时也会在预算内自动退出", async ({ page }) => {
    await page.goto("/");
    const startedAt = await page.evaluate(() => performance.now());
    await expect(page.locator("#aria-welcome-splash")).toHaveCount(0, { timeout: 3_200 });
    const elapsed = await page.evaluate((start) => performance.now() - start, startedAt);

    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(3_200);
  });

  test("同一标签页返回首页时不重复覆盖页面", async ({ page }) => {
    await page.goto("/");
    await dismissSplash(page);
    await navigateWithClientRouter(page, "/blog");
    await navigateWithClientRouter(page, "/");

    await expect(page.locator("#aria-welcome-splash")).toHaveCount(0);
    await expect(page.locator("#hero-title")).toBeVisible();
  });

  test("欢迎层显示时隔离页面，键盘关闭后立即把焦点交给主内容", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeDecode = HTMLImageElement.prototype.decode;
      Object.defineProperty(HTMLImageElement.prototype, "decode", {
        configurable: true,
        value: function decodeWithPendingSplashAsset(this: HTMLImageElement) {
          if (this.hasAttribute("data-splash-critical")) return new Promise<void>(() => {});
          return nativeDecode.call(this);
        },
      });
    });

    await page.goto("/");
    await waitForInteractions(page);

    const splash = page.locator("#aria-welcome-splash");
    const main = page.locator("main#main-content");
    const skipLink = page.locator("[data-skip-link]");
    await expect(splash).toBeVisible();
    await expect(main).toHaveAttribute("inert", "");
    await expect(main).toHaveAttribute("aria-hidden", "true");
    await expect(skipLink).toHaveAttribute("inert", "");

    await splash.focus();
    await splash.press("Enter");
    await expect(main).not.toHaveAttribute("inert", "");
    await expect(main).not.toHaveAttribute("aria-hidden", "true");
    await expect(main).toBeFocused();
  });

});
