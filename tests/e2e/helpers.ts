import { expect, type Page } from "@playwright/test";

export const waitForInteractions = async (page: Page) => {
  await expect.poll(() => page.locator("body").getAttribute("data-aria-interactions-ready")).toBe("true");
};

export const waitForVisualAssets = async (page: Page) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  // 图片使用 lazy loading 与异步解码。DOM 和交互已经就绪时，首屏图片仍可能处于占位尺寸或待解码状态；
  // 只等待与视口相交的图片，既固定视觉基线的截取时机，也不会被页面下方未触发加载的资源阻塞。
  await expect.poll(() => page.evaluate(() => [...document.images]
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    })
    .every((image) => image.complete && image.naturalWidth > 0)), {
    message: "首屏可见图片应全部加载完成",
  }).toBe(true);

  await page.evaluate(async () => {
    const visibleImages = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    });
    await Promise.all(visibleImages.map((image) => image.decode()));
    // decode() 完成只保证位图可用；再跨两个渲染帧，确保尺寸计算和合成层都已采用最终图像。
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
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

/**
 * 站点链接统一以尾斜杠渲染（/blog/），用例则以无斜杠路径（/blog）表达路由。
 * 选择器同时容忍两种形态，避免约定差异导致的确定性超时。
 */
export const navLinkSelector = (href: string) => {
  if (href === "/") return '.nav-link[href="/"]';
  const normalized = href.replace(/\/$/, "");
  return `.nav-link[href="${normalized}"], .nav-link[href="${normalized}/"]`;
};

export const navigateWithClientRouter = async (page: Page, href: string) => {
  const palette = page.locator("[data-command-palette]");
  if (await palette.count()) await expect(palette).toBeHidden();
  const bodyMarker = `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.locator("body").evaluate((body, marker) => {
    (body as HTMLElement).dataset.testRouteOrigin = marker;
  }, bodyMarker);

  const navigation = page.locator('nav[aria-label="主导航"]');
  const target = page.locator(navLinkSelector(href)).first();
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
  await expect(page.locator(navLinkSelector(href))).toHaveAttribute("aria-current", "page");
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
