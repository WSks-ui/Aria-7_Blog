import { test, expect } from "./fixtures";
import {
  dismissSplash,
  navigateWithClientRouter,
  openMusicSources,
} from "./helpers";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "播放器网络竞态只需在桌面 Chromium 验证");
  await page.goto("/");
  await dismissSplash(page);
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

  await openMusicSources(page);
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

  await openMusicSources(page);
  await page.locator('button[data-music-mode="meting"]').click();
  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "local");
  await expect(page.locator("[data-music-source-hint]")).toContainText("已切回本地");
  await expect(page.locator("[data-music-title]").first()).toHaveText("Shelter");
});

test("客户端切页后 Dock 标签仍能打开音乐弹窗", async ({ page }) => {
  await navigateWithClientRouter(page, "/blog");

  const dock = page.locator("[data-side-tools]");
  const consolePanel = page.locator("[data-side-console]");
  await expect(dock).not.toHaveClass(/is-pinned/);

  // 这是原始回归：Dock 使用 transition:persist 后，页面级监听器已销毁；
  // 控制器必须仍然能通过第一次点击把持久节点重新打开。
  await page.locator("[data-console-trigger]").click({ force: true });
  await expect(dock).toHaveClass(/is-pinned/);
  await expect(consolePanel).toHaveAttribute("aria-hidden", "false");

  await page.locator("[data-music-source-toggle]").click({ force: true });
  await expect(page.locator("[data-music-source-panel]")).toBeVisible();
});

test("歌词请求中切页并切回本地音源不会写入过期歌词", async ({ page }) => {
  let releaseLyric!: () => void;
  let markLyricStarted!: () => void;
  const lyricGate = new Promise<void>((resolve) => {
    releaseLyric = resolve;
  });
  const lyricStarted = new Promise<void>((resolve) => {
    markLyricStarted = resolve;
  });

  await page.route("https://api.i-meto.com/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

    if (url.pathname.endsWith(".lrc")) {
      markLyricStarted();
      await lyricGate;
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        headers,
        body: "[00:00.00]过期的远程歌词",
      }).catch(() => {});
      return;
    }

    if (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".webp")) {
      await route.fulfill({ status: 204, headers }).catch(() => {});
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers,
      body: JSON.stringify([{
        name: "Race lyric track",
        artist: "Aria Test",
        url: "https://api.i-meto.com/test/race.mp3",
        pic: "https://api.i-meto.com/test/race.webp",
        lrc: "https://api.i-meto.com/test/race.lrc",
      }]),
    });
  });

  await openMusicSources(page);
  await page.locator('button[data-music-mode="meting"]').click();
  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "meting");
  await page.locator("[data-music-list-toggle]").click({ force: true });
  await expect(page.locator("[data-music-list-panel]")).toBeVisible();
  await page.locator("[data-music-list] button").first().click();
  await lyricStarted;

  await navigateWithClientRouter(page, "/works");
  // 切页动画期间控制台可能暂时收起；直接触发仍挂载在持久 Dock 上的模式按钮，
  // 专门验证异步歌词请求不会把旧结果写回当前控制器。
  await page.locator('button[data-music-mode="local"]').evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  releaseLyric();

  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "local");
  await expect(page.locator("[data-music-title]").first()).toHaveText("Shelter");
  await expect(page.locator("[data-music-lyric]")).not.toContainText("过期的远程歌词");
});

test("播放状态和音频节点在连续客户端切页中保持", async ({ page }) => {
  await openMusicSources(page);
  const marker = `audio-${Date.now()}`;

  await page.locator("[data-music-audio]").evaluate((audio, markerValue) => {
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => false,
    });
    audio.dataset.persistMarker = markerValue;
    audio.dispatchEvent(new Event("play"));
  }, marker);

  await expect(page.locator("[data-side-tools]")).toHaveClass(/is-music-playing/);
  await navigateWithClientRouter(page, "/blog");
  await navigateWithClientRouter(page, "/works");
  await navigateWithClientRouter(page, "/");

  await expect(page.locator(`[data-music-audio][data-persist-marker="${marker}"]`)).toHaveCount(1);
  await expect(page.locator("[data-music-player]")).toHaveClass(/is-playing/);
  await expect(page.locator("[data-side-tools]")).toHaveClass(/is-music-playing/);
});

test("存储不可用时仍可切换音源并打开音乐面板", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage unavailable", "SecurityError");
      },
    });
  });

  await navigateWithClientRouter(page, "/blog");
  await page.locator("[data-console-trigger]").click({ force: true });
  await page.locator("[data-music-source-toggle]").click({ force: true });
  await page.locator('button[data-music-mode="meting"]').click();

  await expect(page.locator("[data-music-player]")).toHaveAttribute("data-music-mode", "meting");
  await expect(page.locator("[data-music-source-panel]")).toBeVisible();
});
