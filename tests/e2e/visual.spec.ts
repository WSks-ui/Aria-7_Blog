import { test, expect } from "./fixtures";
import { dismissSplash, waitForInteractions } from "./helpers";

const pages = [
  { name: "home", path: "/" },
  { name: "blog", path: "/blog/" },
  { name: "article", path: "/blog/welcome/" },
  { name: "game", path: "/game/" },
];

for (const entry of pages) {
  test(`${entry.name} 首屏在目标视口无横向溢出`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(entry.path);
    if (entry.path === "/") await dismissSplash(page);
    await waitForInteractions(page);
    await page.locator("main").first().waitFor({ state: "visible" });

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sideTools: document.querySelectorAll("[data-side-tools]").length,
      navigation: document.querySelectorAll('nav[aria-label="主导航"]').length,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.sideTools).toBe(1);
    expect(layout.navigation).toBe(1);

    const screenshot = await page.screenshot({ animations: "disabled" });
    await testInfo.attach(`${entry.name}-${testInfo.project.name}.png`, {
      body: screenshot,
      contentType: "image/png",
    });
  });
}

test("移动首页滚过首屏后主导航仍可操作", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "仅验证无 hover 唤回能力的移动布局");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissSplash(page);
  await waitForInteractions(page);

  await page.evaluate(() => window.scrollTo(0, window.innerHeight + 100));
  await expect(page.locator("body")).toHaveClass(/is-past-hero/);

  const navigation = await page.locator(".nav-pill").evaluate((node) => {
    const element = node as HTMLElement;
    const items = [...element.querySelectorAll<HTMLElement>(".nav-link, .nav-command-trigger")];
    const style = getComputedStyle(element);
    return {
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      scrollbarWidth: style.scrollbarWidth,
      items: items.map((item) => ({
        width: item.getBoundingClientRect().width,
        opacity: getComputedStyle(item).opacity,
      })),
    };
  });

  expect(navigation.width).toBeGreaterThan(300);
  expect(navigation.scrollWidth).toBeGreaterThan(navigation.clientWidth);
  expect(navigation.opacity).toBe("1");
  expect(navigation.pointerEvents).toBe("auto");
  expect(navigation.scrollbarWidth).toBe("none");
  expect(navigation.items.every((item) => item.width >= 80 && item.opacity === "1")).toBe(true);
});

test("桌面棋局初始内容避开固定 Aria Dock", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "移动端不显示 Aria Dock");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/game/");
  await waitForInteractions(page);

  // 覆盖页面框架从居中最大宽度切换到 18px 边距的临界区间。
  for (const width of [1440, 1280, 1024, 901]) {
    await page.setViewportSize({ width, height: 800 });
    // setViewportSize 返回时 CSS 过渡可能尚未进入下一帧，轮询最终几何状态避免读取旧布局。
    await expect.poll(async () => page.evaluate(() => {
      const dock = document.querySelector<HTMLElement>(".side-tools__tab")?.getBoundingClientRect();
      const title = document.querySelector<HTMLElement>(".chess-start h1")?.getBoundingClientRect();
      const terminal = document.querySelector<HTMLElement>(".chess-start__terminal")?.getBoundingClientRect();
      if (!dock || !title || !terminal) return null;
      return {
        titleClear: title.left > dock.right,
        terminalClear: terminal.left > dock.right,
        noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    }), { message: `${width}px 下棋局应避开 Dock 且不产生横向溢出` }).toEqual({
      titleClear: true,
      terminalClear: true,
      noOverflow: true,
    });
  }
});
