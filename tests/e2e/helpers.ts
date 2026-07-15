import { expect, type Page } from "@playwright/test";

export const waitForInteractions = async (page: Page) => {
  await expect.poll(() => page.locator("body").getAttribute("data-aria-interactions-ready")).toBe("true");
};

export const dismissSplash = async (page: Page, method: "click" | "enter" = "click") => {
  const splash = page.locator("#aria-welcome-splash");
  if (await splash.count() === 0) return;
  // bootstrap 通过动态 import 挂载交互；高并发下 page.goto 可能先于该 chunk 完成。
  await waitForInteractions(page);
  if (await splash.count() === 0) return;

  try {
    if (method === "enter") {
      await splash.focus();
      await splash.press("Enter");
    } else {
      await splash.click({ force: true, position: { x: 12, y: 12 } });
    }
  } catch (error) {
    // 图片缓存命中时欢迎层可能正好自动退出；仅在节点确实已移除时容忍动作竞态。
    if (await splash.count() > 0) throw error;
    return;
  }

  // 交互处理会同步标记 dismissed，再用 500ms 定时器等待退场动画后移除节点。
  // 分开验证可防止真实点击失效被自动退出掩盖，同时给高负载下的定时器足够调度余量。
  await expect.poll(async () => {
    if (await splash.count() === 0) return true;
    return splash.evaluate((node) => node.classList.contains("is-dismissed"));
  }, { timeout: 1_500 }).toBe(true);
  await expect(splash).toHaveCount(0, { timeout: 3_000 });
};

export const navigateWithClientRouter = async (page: Page, href: string) => {
  const palette = page.locator("[data-command-palette]");
  if (await palette.count()) await expect(palette).toBeHidden();
  const bodyMarker = `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.locator("body").evaluate((body, marker) => {
    (body as HTMLElement).dataset.testRouteOrigin = marker;
  }, bodyMarker);

  const navigation = page.locator('nav[aria-label="主导航"]');
  const target = page.locator(`.nav-link[href="${href}"]`).first();
  const navOpacity = await navigation.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
  if (navOpacity < 0.9) {
    const box = await navigation.boundingBox();
    if (!box) throw new Error(`主导航没有可用布局框：${href}`);
    // 收起的导航本体会覆盖 hover-zone；移动到其仍在视口内的下边缘即可触发页眉 hover。
    await page.mouse.move(box.x + box.width / 2, Math.max(1, box.y + box.height - 2));
    await expect.poll(() => navigation.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0.9);
  }
  await target.click();

  // ClientRouter 是同文档导航，不会再次触发传统 load；依次等待 URL、DOM swap 和新页面初始化。
  await expect.poll(() => {
    const pathname = new URL(page.url()).pathname;
    return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  }).toBe(href);
  await expect(page.locator(`body[data-test-route-origin="${bodyMarker}"]`)).toHaveCount(0);
  await expect(page.locator(`.nav-link[href="${href}"]`)).toHaveAttribute("aria-current", "page");
  await waitForInteractions(page);
  // 根 View Transition 固定为 170ms；留出有界余量，避免下一次点击落在动画锁期间。
  await page.waitForTimeout(250);
};

export const dispatchContextMenu = (page: Page) => page.evaluate(() => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 80,
    clientY: 80,
  });
  document.body.dispatchEvent(event);
  return event.defaultPrevented;
});

export const openMusicSources = async (page: Page) => {
  await page.locator("[data-console-trigger]").click({ force: true });
  await page.locator("[data-music-source-toggle]").click({ force: true });
  await expect(page.locator("[data-music-source-panel]")).toBeVisible();
};
