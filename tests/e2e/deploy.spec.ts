import { test, expect } from "./fixtures";

test("预览服务器为缺失页面和资源返回构建后的 404 页面", async ({ page, runtimeIssues }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "部署契约只需在一个浏览器项目验证");

  const pageResponse = await page.goto("/this-route-does-not-exist/");
  expect(pageResponse?.status()).toBe(404);
  expect(pageResponse?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("这里还没有页面");

  const assetResponse = await page.request.get("/_astro/this-file-does-not-exist.js");
  expect(assetResponse.status()).toBe(404);
  expect(assetResponse.headers()["content-type"]).toContain("text/html");

  // 主文档返回 404 时 Chromium 会主动记录一条 "Failed to load resource" console.error，
  // 属于本用例的预期行为而非页面故障，从全局门禁中豁免。
  runtimeIssues.consoleErrors = runtimeIssues.consoleErrors.filter(
    (entry) => !entry.includes("/this-route-does-not-exist/"),
  );
});

test("版本探针不缓存且提供构建信息", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "版本探针只需在一个浏览器项目验证");

  const response = await page.request.get("/version.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    sha: expect.any(String),
    builtAt: expect.any(String),
    environment: expect.any(String),
  });
});
