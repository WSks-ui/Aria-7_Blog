import { describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
  defineCollection: <T>(value: T) => value,
}));

vi.mock("astro/loaders", () => ({
  glob: () => ({}),
}));

import { blogSchema } from "../../src/content.config";

const validMetadata = {
  title: "内容规范测试文章",
  description: "这是一段长度足够的文章摘要，用来验证内容集合的发布规范。",
  pubDate: "2026-07-01",
  tags: ["建站记录"],
  keywords: ["Astro"],
};

describe("文章内容 schema", () => {
  it("接受符合发布规范的元数据", () => {
    expect(blogSchema.safeParse(validMetadata).success).toBe(true);
  });

  it.each([
    ["空标题", { ...validMetadata, title: "" }],
    ["超过上限的标题", { ...validMetadata, title: "长".repeat(71) }],
    ["过短摘要", { ...validMetadata, description: "太短" }],
    ["超过五个导航标签", { ...validMetadata, tags: ["一", "二", "三", "四", "五", "六"] }],
    ["超过十二个搜索关键词", { ...validMetadata, keywords: Array.from({ length: 13 }, (_, index) => `词${index}`) }],
    ["带空白的标签", { ...validMetadata, tags: ["博客 开发"] }],
    ["规范化后重复的关键词", { ...validMetadata, keywords: ["Ａstro", "astro"] }],
    ["只有系列名", { ...validMetadata, series: "博客演进" }],
    ["只有系列顺序", { ...validMetadata, seriesOrder: 1 }],
    ["更新日期早于发布日期", { ...validMetadata, updatedDate: "2026-06-30" }],
    ["复查日期早于发布日期", { ...validMetadata, lastReviewed: "2026-06-30" }],
  ])("拒绝%s", (_name, metadata) => {
    expect(blogSchema.safeParse(metadata).success).toBe(false);
  });
});
