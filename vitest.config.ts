import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/scripts/core/**/*.ts",
        "src/utils/blogStats.ts",
        "src/utils/postMetrics.ts",
        "src/utils/contributionHeatmap.ts",
        "src/utils/contributionSnapshot.ts",
        "src/lib/images.ts",
        "src/plugins/rehype-image-performance.mjs",
        "scripts/lib/github-contributions.mjs",
      ],
      thresholds: {
        branches: 75,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
