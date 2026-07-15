import { unified } from "@astrojs/markdown-remark";
import { defineConfig } from "astro/config";

import rehypeImagePerformance from "./src/plugins/rehype-image-performance.mjs";

const normalizeSiteUrl = (value) => {
  if (!value) return undefined;

  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(url).toString();
};

// 本地构建仍需要稳定的绝对地址；生产环境优先使用显式配置，其次读取 Vercel 自动注入的域名。
const site =
  normalizeSiteUrl(process.env.SITE_URL) ??
  normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  "http://localhost:4321";

export default defineConfig({
  site,
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
