import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import {
  dismissSplash,
  dispatchContextMenu,
  navigateWithClientRouter,
  waitForInteractions,
} from "./helpers";

const expectSingleActiveNav = async (page: import("@playwright/test").Page, href: string) => {
  await expect(page.locator(".nav-link.active")).toHaveCount(1);
  await expect(page.locator('.nav-link[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator(`.nav-link[href="${href}"]`)).toHaveClass(/\bactive\b/);
  await expect(page.locator(`.nav-link[href="${href}"]`)).toHaveAttribute("aria-current", "page");
};

test("预览响应施加部署配置中的 CSP 与安全头", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "响应头只需在一个浏览器项目验证");
  const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  const expectedHeaders = Object.fromEntries(
    config.headers.find((rule: { source: string }) => rule.source === "/(.*)").headers
      .map(({ key, value }: { key: string; value: string }) => [key.toLowerCase(), value]),
  );
  const headersFile = await readFile(new URL("../../public/_headers", import.meta.url), "utf8");
  const lines = headersFile.split(/\r?\n/);
  const globalRuleIndex = lines.findIndex((line) => line.trim() === "/*");
  const followingLines = lines.slice(globalRuleIndex + 1);
  const nextRuleIndex = followingLines.findIndex(
    (line) => line.trim().startsWith("/") && !/^\s/.test(line),
  );
  const globalHeaderLines = followingLines.slice(0, nextRuleIndex < 0 ? undefined : nextRuleIndex);
  const mirroredHeaders = Object.fromEntries(
    globalHeaderLines
      .filter((line) => /^\s+[^\s].*?:/.test(line))
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      }),
  );

  expect(mirroredHeaders).toEqual(expectedHeaders);

  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const actualHeaders = await response!.allHeaders();
  for (const [key, value] of Object.entries(expectedHeaders)) {
    expect(actualHeaders[key]).toBe(value);
  }
  await dismissSplash(page);
});

test("首页、栏目和文章子路由始终只有一个活动导航项", async ({ page }) => {
  await page.goto("/");
  await dismissSplash(page);
  await expectSingleActiveNav(page, "/");

  for (const href of ["/blog", "/game", "/works", "/me"]) {
    await navigateWithClientRouter(page, href);
    await expectSingleActiveNav(page, href);
  }

  await page.goto("/blog/welcome/");
  await waitForInteractions(page);
  await expectSingleActiveNav(page, "/blog");
});

test("ClientRouter 多次往返不会复制持久组件或重复请求检索索引", async ({ page }) => {
  let indexRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/search-index.json") indexRequests += 1;
  });

  await page.goto("/");
  await dismissSplash(page);
  await page.locator("[data-side-tools]").evaluate((node) => {
    (node as HTMLElement).dataset.testIdentity = "persistent-dock";
  });

  const firstIndexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/search-index.json");
  await page.keyboard.press("Control+K");
  await firstIndexResponse;
  await expect(page.locator("[data-command-palette]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-command-palette]")).toBeHidden();

  for (const href of ["/blog", "/game", "/", "/blog", "/"]) {
    await navigateWithClientRouter(page, href);
  }
  await page.keyboard.press("Control+K");
  await expect(page.locator("[data-command-palette]")).toBeVisible();

  expect(indexRequests).toBe(1);
  await expect(page.locator("[data-side-tools]")).toHaveCount(1);
  await expect(page.locator("[data-custom-cursor]")).toHaveCount(1);
  await expect(page.locator('[data-side-tools][data-test-identity="persistent-dock"]')).toHaveCount(1);
});

test("持久 Dock 切页后仍可展开并打开音乐面板", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "移动端不显示 Aria Dock");
  await page.goto("/");
  await dismissSplash(page);
  await navigateWithClientRouter(page, "/blog");

  const sideTools = page.locator("[data-side-tools]");
  const consoleTrigger = page.locator("[data-console-trigger]");
  await consoleTrigger.click();
  await expect(sideTools).toHaveClass(/is-pinned/);
  await expect(consoleTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-side-console]")).toBeVisible();

  await page.locator("[data-music-source-toggle]").click();
  await expect(page.locator("[data-music-source-panel]")).toBeVisible();

  await consoleTrigger.click();
  await expect(sideTools).not.toHaveClass(/is-pinned/);
  await navigateWithClientRouter(page, "/game");
  await consoleTrigger.click();
  await expect(sideTools).toHaveClass(/is-pinned/);
  await expect(consoleTrigger).toHaveAttribute("aria-expanded", "true");
});

test("localStorage 被浏览器禁用后其余功能仍会初始化", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage disabled for test", "SecurityError");
      },
    });
  });

  await page.goto("/");
  await dismissSplash(page);
  await waitForInteractions(page);
  await page.keyboard.press("Control+K");
  await expect(page.locator("[data-command-palette]")).toBeVisible();
  await page.keyboard.press("Escape");

  await navigateWithClientRouter(page, "/game");
  await expect(page.locator("[data-chess-board] [data-square]")).toHaveCount(64);
});

test("右键只在自定义光标实际启用时被拦截", async ({ page }, testInfo) => {
  const isDesktop = testInfo.project.name === "desktop-chromium";
  await page.goto("/");
  await dismissSplash(page);

  if (isDesktop) await expect(page.locator("html")).toHaveClass(/custom-cursor-active/);
  else await expect(page.locator("html")).not.toHaveClass(/custom-cursor-active/);
  expect(await dispatchContextMenu(page)).toBe(isDesktop);
  if (isDesktop) {
    await expect(page.locator("[data-command-palette]")).toBeVisible();
    await page.keyboard.press("Escape");
  }

  await navigateWithClientRouter(page, "/blog");
  if (isDesktop) await expect(page.locator("html")).toHaveClass(/custom-cursor-active/);
  expect(await dispatchContextMenu(page)).toBe(isDesktop);
});

test("减少动画模式恢复原生右键", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/blog/");
  await waitForInteractions(page);

  await expect(page.locator("html")).not.toHaveClass(/custom-cursor-active/);
  expect(await dispatchContextMenu(page)).toBe(false);
});
