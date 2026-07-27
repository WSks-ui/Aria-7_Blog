import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import rehypeImagePerformance from "./src/plugins/rehype-image-performance.mjs";

const normalizeSiteUrl = (value) => {
  if (!value) return undefined;

  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(url).toString();
};

// 默认值始终是正式 Pages 域名，避免生产构建把 localhost 写入 canonical、RSS 或 sitemap。
// 本地和预览环境若需不同域名，必须显式传入 SITE_URL。
const site = normalizeSiteUrl(process.env.SITE_URL) ?? "https://aria7bl0g.pages.dev";

export default defineConfig({
  site,
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith("/404.html"),
    }),
  ],
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
  markdown: {
    syntaxHighlight: "prism",
    processor: unified({
      rehypePlugins: [rehypeImagePerformance],
    }),
  },
  vite: {
    optimizeDeps: {
      include: ["chess.js"],
    },
  },
});
