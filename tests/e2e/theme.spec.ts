import { expect, test } from "./fixtures";
import { dismissSplash, waitForInteractions } from "./helpers";

const themeOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    mode: document.documentElement.getAttribute("data-theme-mode"),
  }));

// 控制台 pin 状态持久化在 localStorage：reload 后自动恢复展开，
// 因此每次操作前必须先读状态再决定是否点击 trigger，避免把已展开的面板 toggle 回收起。
const ensureDockOpen = async (page: import("@playwright/test").Page) => {
  const dock = page.locator("[data-side-tools]");
  if (!(await dock.evaluate((node) => node.classList.contains("is-pinned")))) {
    await page.locator("[data-console-trigger]").click({ force: true });
    await expect(dock).toHaveClass(/is-pinned/);
  }
};

test.describe("主题系统（亮/暗/跟随系统）", () => {
  test("暗色偏好在首次绘制前应用，无白闪", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("aria-theme", "dark"));
    // commit 阶段 DOM 刚开始解析，theme-init.js 同步执行后 data-theme 必须已就位
    await page.goto("/blog/", { waitUntil: "commit" });
    await expect(page.locator("html[data-theme='dark']")).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator("html[data-theme-mode='dark']")).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    expect((await themeOf(page)).theme).toBe("dark");
  });

  // 移动端（≤900px）Aria Dock 整体隐藏（产品设计决策），主题面板仅桌面可达；
  // 移动端依赖默认的「跟随系统」自动获得暗色。
  test("面板切换即时生效并持久化", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "主题面板在移动端不可达，仅桌面验证");
    await page.goto("/blog/");
    await dismissSplash(page);
    await waitForInteractions(page);

    await ensureDockOpen(page);
    await expect(page.locator("[data-theme-choice='dark']")).toBeVisible();
    await page.locator("[data-theme-choice='dark']").click({ force: true });
    expect((await themeOf(page)).theme).toBe("dark");
    await expect(page.locator("[data-theme-choice='dark']")).toHaveClass(/is-active/);
    expect(await page.evaluate(() => localStorage.getItem("aria-theme"))).toBe("dark");

    // 刷新后保持（控制台 pin 状态也会自动恢复）
    await page.reload({ waitUntil: "networkidle" });
    expect((await themeOf(page)).theme).toBe("dark");

    // 切回亮色同样保持
    await ensureDockOpen(page);
    await page.locator("[data-theme-choice='light']").click({ force: true });
    await page.reload({ waitUntil: "networkidle" });
    expect((await themeOf(page)).theme).toBe("light");
  });

  test("跟随系统模式响应系统主题变化", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "系统主题模拟只在 Chromium 验证");
    await page.goto("/blog/");
    await dismissSplash(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => window.__ariaSetTheme?.("system"));
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
    // 显式选择后不再跟随系统
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => window.__ariaSetTheme?.("light"));
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
  });

  test("ClientRouter 换页后主题保持", async ({ page }) => {
    await page.goto("/blog/");
    await dismissSplash(page);
    await waitForInteractions(page);
    await page.evaluate(() => window.__ariaSetTheme?.("dark"));
    await page.click("a.nav-link[href='/works/']");
    await expect(page).toHaveURL(/\/works\//);
    expect((await themeOf(page)).theme).toBe("dark");
  });

  test("localStorage 不可用时主题功能降级不报错", async ({ page }) => {
    await page.addInitScript(() => {
      const handler = {
        get: () => {
          throw new DOMException("denied", "SecurityError");
        },
      };
      Object.defineProperty(window, "localStorage", { get: handler.get });
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto("/blog/", { waitUntil: "networkidle" });
    await dismissSplash(page);
    // 页面正常渲染且主题回退为跟随系统
    await expect(page.locator(".blog-board")).toBeVisible();
    expect(["light", "dark"]).toContain((await themeOf(page)).theme);
    expect(errors).toEqual([]);
  });
});
