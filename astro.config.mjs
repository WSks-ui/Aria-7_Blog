import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.com",
  devToolbar: {
    enabled: false,
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  vite: {
    optimizeDeps: {
      include: ["chess.js"],
    },
  },
});
