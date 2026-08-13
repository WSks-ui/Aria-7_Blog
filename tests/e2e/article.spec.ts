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

test("文章关系、标签归档与分类归档使用公开内容目录", async ({ page }) => {
  await page.goto("/blog/welcome/");
  await waitForInteractions(page);

  const relations = page.locator(".article-relations");
  await expect(relations).toBeVisible();
  await expect(relations.getByRole("link", { name: /从零搭建全栈AI绘图平台/ })).toHaveAttribute(
    "href",
    "/blog/2bis-ai-image-platform/",
  );
  await expect(relations.getByRole("heading", { name: "同系列" })).toBeVisible();
  await expect(relations.getByRole("heading", { name: "相关阅读" })).toBeVisible();

  await page.goto("/blog/tags/博客开发/");
  await expect(page.getByRole("heading", { level: 1, name: "#博客开发" })).toBeVisible();
  await expect(page.locator(".archive-post-grid .post-card")).toHaveCount(2);

  await page.goto("/blog/categories/技术/");
  await expect(page.getByRole("heading", { level: 1, name: "技术" })).toBeVisible();
  await expect(page.locator(".archive-post-grid .post-card")).toHaveCount(6);
});
