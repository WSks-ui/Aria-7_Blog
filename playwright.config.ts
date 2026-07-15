import { defineConfig, devices } from "@playwright/test";

const previewPort = process.env.PLAYWRIGHT_PREVIEW_PORT ?? "4173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 每个用例都会启动完整页面、网络沙箱和媒体组件；本机逻辑核过多时自动 10 workers
  // 会让浏览器定时器长期饥饿。CI 保持单 worker，本地限制为 4 以保留并发且减少假超时。
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_SKIP_VIDEO ? "off" : "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "node tests/e2e/serve-preview.mjs",
    // 与 Astro 开发服务器分离，避免本地回归误复用不带部署安全头的 4321 端口。
    env: { PORT: previewPort },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
