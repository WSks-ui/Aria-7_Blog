/**
 * Lighthouse CI 门禁草案。
 * 依赖在维护提交中锁定为 @lhci/cli@0.15.1 后，可通过 `lhci autorun` 直接执行。
 */
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: [
        "http://localhost/",
        "http://localhost/blog/",
        "http://localhost/blog/minimind-o-local-inference/",
      ],
      numberOfRuns: 3,
      settings: {
        // GitHub Actions 的 Ubuntu 24.04 Runner 禁用了 Chromium 依赖的用户命名空间。
        // 仅在 CI 中关闭浏览器沙箱，避免 Lighthouse 在启动阶段直接退出；本地仍保留默认沙箱。
        ...(process.env.CI ? { chromeFlags: "--no-sandbox --disable-setuid-sandbox" } : {}),
        formFactor: "mobile",
        throttlingMethod: "simulate",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          disabled: false,
        },
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.85 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
