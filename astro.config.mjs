import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.com",
  devToolbar: {
    enabled: false,
  },
  // ===================================================================
  // 页面预取策略：
  // - hover：鼠标悬停链接时立即预取，页面切换近乎瞬时
  // - prefetchAll 全局开启，所有页内链接均参与预取
  // - 相比 viewport 策略，hover 更省带宽且命中率更高
  // ===================================================================
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  vite: {
    optimizeDeps: {
      include: ["chess.js"],
    },
  },
});
