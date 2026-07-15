import { test, expect } from "./fixtures";
import { waitForInteractions } from "./helpers";

test("文章目录、阅读进度和图片固有尺寸可用", async ({ page }) => {
  await page.goto("/blog/bilibili-music-player/");
  await waitForInteractions(page);
  await expect(page.locator(".article-toc-list a").first()).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("[data-article-progress-value]")).toHaveText("100%");
  await expect(page.locator(".article-toc-list li.is-active")).toHaveCount(1);

  const images = page.locator(".article-header .article-cover, .article-content img");
  expect(await images.count()).toBeGreaterThan(0);
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute("width", /^\d+$/);
    await expect(image).toHaveAttribute("height", /^\d+$/);
    const dimensions = await image.evaluate((node: HTMLImageElement) => ({
      naturalHeight: node.naturalHeight,
      naturalWidth: node.naturalWidth,
    }));
    expect(dimensions.naturalWidth).toBeGreaterThan(0);
    expect(dimensions.naturalHeight).toBeGreaterThan(0);
  }
});

test("Giscus 使用本地 mock 加载，不依赖公网", async ({ page }) => {
  await page.goto("/blog/welcome/");
  const comments = page.locator("[data-giscus-root]");
  await comments.scrollIntoViewIfNeeded();

  await expect(comments.locator(".giscus-mock")).toHaveText("Giscus mock loaded");
  await expect(comments).toHaveAttribute("data-giscus-loaded", "true");
});
