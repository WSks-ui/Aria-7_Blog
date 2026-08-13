import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { dismissSplash, waitForInteractions } from "./helpers";

const gotoHome = async (page: Page) => {
  await page.goto("/");
  await dismissSplash(page);
  await waitForInteractions(page);
};

const scrollToProgress = async (page: Page, progress: number) => {
  await page.evaluate((nextProgress) => {
    const stage = document.querySelector<HTMLElement>("[data-home-layer-stage]");
    if (!stage) throw new Error("首页图层舞台不存在");
    window.scrollTo({ top: stage.getBoundingClientRect().height * nextProgress, behavior: "auto" });
  }, progress);
  const reduceMotion = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const expectedProgress = reduceMotion ? (progress >= 0.1 ? 1 : 0) : progress;
  // 页面启用了平滑滚动，目标进度会经过多个中间值。这里必须与控制器写入的三位小数精度一致；
  // 若只比较一位小数，轮询会在 0.45～0.55 的途中提前结束，使后续揭示状态断言读取到半成品。
  await expect.poll(() => page.evaluate(() => Number.parseFloat(
    getComputedStyle(document.querySelector<HTMLElement>("[data-home-data-layer]")!).getPropertyValue("--home-data-progress"),
  ))).toBeCloseTo(expectedProgress, 3);
};

const revealOpacity = (page: Page, name: string) => page.locator(`[data-home-reveal="${name}"]`).evaluate(
  (node: HTMLElement) => Number.parseFloat(getComputedStyle(node).opacity),
);

const stabilizeHomeDataVisuals = async (page: Page) => {
  const activityCard = page.locator(".home-data-card--activity");
  // GitHub Actions 会每日刷新贡献快照。视觉基线固定动态文案，但继续覆盖卡片图片、布局和交互态。
  await activityCard.locator(".home-data-card__metrics strong").evaluateAll((nodes) => {
    nodes.forEach((node) => { node.textContent = "000"; });
  });
  await activityCard.locator(".home-data-card__detail").evaluate((node) => {
    node.textContent = "过去一年记录 000 次贡献，活跃 000 天。";
  });
  await activityCard.locator(".home-data-card__stale").evaluateAll((nodes) => {
    nodes.forEach((node) => node.remove());
  });
};

test.describe("首页第二屏滚动状态", () => {
  test("按标题、数据卡、CONNECT、STACK 的阅读顺序累计揭示", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面图层使用精确归一化进度验证");
    await gotoHome(page);

    await scrollToProgress(page, 0.2);
    expect(await revealOpacity(page, "heading")).toBeGreaterThan(0);
    expect(await revealOpacity(page, "card-1")).toBe(0);
    expect(await revealOpacity(page, "connect")).toBe(0);
    expect(await revealOpacity(page, "stack")).toBe(0);
    await expect(page.locator("[data-home-data-layer]")).toHaveAttribute("inert", "");

    await scrollToProgress(page, 0.5);
    expect(await revealOpacity(page, "heading")).toBe(1);
    expect(await revealOpacity(page, "card-1")).toBe(1);
    expect(await revealOpacity(page, "card-4")).toBeGreaterThan(0);
    expect(await revealOpacity(page, "connect")).toBe(0);
    await expect(page.locator("[data-home-data-layer]")).not.toHaveAttribute("inert", "");

    await scrollToProgress(page, 0.75);
    expect(await revealOpacity(page, "connect")).toBeGreaterThan(0);
    expect(await revealOpacity(page, "stack")).toBe(0);

    await scrollToProgress(page, 1);
    expect(await revealOpacity(page, "connect")).toBe(1);
    expect(await revealOpacity(page, "stack")).toBe(1);
  });

  test("滚动入口、导航返回态和首屏装饰共享同一进度状态", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面导航包含 hover 唤回状态");
    await gotoHome(page);

    await page.locator(".scroll-hint").click();
    await expect(page).toHaveURL(/#lab-feed$/);
    await expect(page.locator("body")).toHaveClass(/is-past-hero/);
    await expect(page.locator(".sakura-layer")).toHaveCSS("visibility", "hidden");
    await expect(page.locator(".scroll-hint")).toHaveCSS("visibility", "hidden");
    await expect(page.locator(".announcement-widget")).toHaveCSS("pointer-events", "none");

    const header = page.locator(".site-header--brandless");
    await header.locator(".nav-hover-zone").hover({ force: true });
    await expect(header.locator(".nav-pill")).toHaveCSS("pointer-events", "auto");

    await header.evaluate((node) => {
      const observer = new MutationObserver(() => {
        if (!node.classList.contains("is-nav-returning")) return;
        (node as HTMLElement).dataset.testReturningSeen = "true";
        observer.disconnect();
      });
      observer.observe(node, { attributes: true, attributeFilter: ["class"] });
    });
    await page.mouse.move(720, 890);
    await scrollToProgress(page, 0.2);
    await expect(page.locator("body")).not.toHaveClass(/is-past-hero/);
    await expect(header).toHaveAttribute("data-test-returning-seen", "true");
    await expect(header).not.toHaveClass(/is-nav-open/);
    await expect(page.locator(".sakura-layer")).toHaveCSS("visibility", "visible");
  });

  test("Footer 在图层边界锁定后由下一次下滚展开并在三秒后回弹", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面 Footer 使用边界锁定交互");
    await gotoHome(page);

    await scrollToProgress(page, 0.98);
    await page.mouse.wheel(0, 180);
    await expect(page.locator("body")).toHaveClass(/is-layer-end-hold/);
    await expect.poll(() => page.evaluate(() => ({
      y: Math.round(window.scrollY),
      stage: Math.round(document.querySelector<HTMLElement>("[data-home-layer-stage]")!.getBoundingClientRect().height),
    }))).toEqual({ y: 900, stage: 900 });

    await expect(page.locator("body")).not.toHaveClass(/is-layer-end-hold/, { timeout: 1_200 });
    await page.mouse.wheel(0, 220);
    await expect(page.locator("body")).toHaveClass(/is-home-footer-visible/, { timeout: 1_500 });
    await expect(page.locator(".site-footer")).toHaveCSS("pointer-events", "auto");

    await expect(page.locator("body")).not.toHaveClass(/is-home-footer-visible/, { timeout: 4_200 });
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 1_500 }).toBe(900);
  });

  test("卡片可由键盘和点击固定，Escape 清除且轨道聚焦后停播", async ({ page }) => {
    await gotoHome(page);
    if (page.viewportSize()!.width > 900) {
      await scrollToProgress(page, 1);
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator("[data-home-data-layer]")).not.toHaveAttribute("inert", "");
    }

    const firstCard = page.locator("[data-home-reveal='card-1']");
    const secondCard = page.locator("[data-home-reveal='card-2']");
    await firstCard.focus();
    await firstCard.press("Enter");
    await expect(firstCard).toHaveAttribute("aria-pressed", "true");
    await secondCard.click();
    await expect(firstCard).toHaveAttribute("aria-pressed", "false");
    await expect(secondCard).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(secondCard).toHaveAttribute("aria-pressed", "false");

    // 移动端聚焦首张卡片会按浏览器默认行为回卷；再次滚至末端后才进入 STACK 的键盘场景。
    if (page.viewportSize()!.width <= 900) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator("[data-home-reveal='stack']")).toHaveAttribute("aria-hidden", "false");
    }

    const stack = page.locator("[aria-labelledby='home-stack-title']");
    const firstSkill = stack.locator("[data-home-activatable]").first();
    await firstSkill.focus();
    await expect(stack.locator(".home-data-loop__track")).toHaveCSS("animation-name", "none");
    await expect(stack.locator("[data-home-loop-clone]")).toHaveCSS("display", "none");
    await firstSkill.press("Space");
    await expect(firstSkill).toHaveAttribute("aria-pressed", "true");

    const bilibili = page.locator("[aria-labelledby='home-connect-title'] .home-data-loop__group:not([data-home-loop-clone]) [aria-disabled='true']");
    await expect(bilibili).toHaveCount(1);
    await expect(bilibili).not.toHaveAttribute("href", /.+/);
    expect(await page.locator("[data-home-loop-clone]").evaluateAll(
      (nodes) => nodes.every((node) => node.getAttribute("aria-hidden") === "true"),
    )).toBe(true);
    expect(await page.locator("[data-home-loop-clone] a, [data-home-loop-clone] button").evaluateAll(
      (nodes) => nodes.every((node) => (node as HTMLElement).tabIndex === -1),
    )).toBe(true);
  });

  test("四张数据卡使用延迟加载的响应式 AVIF 与 WebP", async ({ page }) => {
    await gotoHome(page);
    if (page.viewportSize()!.width > 900) {
      await scrollToProgress(page, 1);
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }

    const pictures = page.locator(".home-data-card__media picture");
    await expect(pictures).toHaveCount(4);
    const imageContracts = await pictures.evaluateAll((nodes) => nodes.map((picture) => {
      const image = picture.querySelector("img");
      const sources = [...picture.querySelectorAll("source")];
      return {
        alt: image?.getAttribute("alt"),
        complete: image?.complete,
        loading: image?.getAttribute("loading"),
        sourceTypes: sources.map((source) => source.type),
        sourceSets: sources.map((source) => source.srcset),
      };
    }));

    for (const contract of imageContracts) {
      expect(contract).toMatchObject({
        alt: "",
        complete: true,
        loading: "lazy",
        sourceTypes: ["image/avif", "image/webp"],
      });
      expect(contract.sourceSets.every((srcset) => (
        srcset.includes("160w") && srcset.includes("240w") && srcset.includes("320w")
      ))).toBe(true);
    }
  });

  test("移动端第二屏和 Footer 使用自然文档流，导航持续可操作", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "仅移动端验证自然文档流");
    await gotoHome(page);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("body")).toHaveClass(/is-past-hero/);
    await expect(page.locator("[data-home-reveal='stack']")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator(".nav-pill")).toHaveCSS("opacity", "1");
    await expect(page.locator(".nav-pill")).toHaveCSS("pointer-events", "auto");
    await expect(page.locator(".nav-bookmark")).toHaveCSS("display", "none");
    await expect(page.locator(".site-footer")).toHaveCSS("position", "relative");
    await expect(page.locator(".site-footer")).toBeInViewport();
  });
});

test.describe("首页第二屏视觉基线", () => {
  test("桌面半程与完整态", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面视觉基线");
    await gotoHome(page);
    await stabilizeHomeDataVisuals(page);
    await scrollToProgress(page, 0.5);
    await expect(page).toHaveScreenshot("home-feed-mid.png", { animations: "disabled" });
    await scrollToProgress(page, 1);
    await expect(page).toHaveScreenshot("home-feed-full.png", { animations: "disabled" });
  });

  test("桌面深色完整态", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面视觉基线");
    await gotoHome(page);
    await stabilizeHomeDataVisuals(page);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await scrollToProgress(page, 1);
    await expect(page).toHaveScreenshot("home-feed-dark.png", { animations: "disabled" });
  });

  test("桌面键盘聚焦态", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面视觉基线");
    await gotoHome(page);
    await stabilizeHomeDataVisuals(page);
    await scrollToProgress(page, 1);
    await page.locator("[data-home-reveal='card-1']").focus();
    await expect(page.locator("[data-home-reveal='card-1']")).toBeFocused();
    await expect(page).toHaveScreenshot("home-feed-keyboard-focus.png", { animations: "disabled" });
  });

  test("移动端完整态", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "移动端视觉基线");
    await gotoHome(page);
    await stabilizeHomeDataVisuals(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("[data-home-reveal='stack']")).toHaveAttribute("aria-hidden", "false");
    await expect(page).toHaveScreenshot("home-feed-mobile.png", { animations: "disabled" });
  });

  test("低动画模式进入第二屏后一次显示", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "桌面低动画基线");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoHome(page);
    await stabilizeHomeDataVisuals(page);
    await scrollToProgress(page, 0.2);
    await expect(page.locator("[data-home-reveal='stack']")).toHaveAttribute("aria-hidden", "false");
    await expect(page).toHaveScreenshot("home-feed-reduced-motion.png", { animations: "disabled" });
  });
});
