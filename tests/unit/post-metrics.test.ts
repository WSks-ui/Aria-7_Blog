import { describe, expect, it } from "vitest";
import { getPostMetrics } from "../../src/utils/postMetrics";

describe("文章字数与阅读时长", () => {
  it("默认空正文仍显示至少一分钟", () => {
    expect(getPostMetrics()).toEqual({ words: 0, minutes: 1 });
    expect(getPostMetrics("")).toEqual({ words: 0, minutes: 1 });
  });

  it("同时统计中文字符、英文单词和数字，并在清理后拆分 Markdown 连字符", () => {
    expect(getPostMetrics("你好 Astro 7 state-of-the-art don't")).toEqual({
      words: 9,
      minutes: 1,
    });
  });

  it("移除 frontmatter、代码、图片和 HTML 标签，但保留链接文字与 HTML 正文", () => {
    const markdown = `---
title: hidden metadata
---
# 正文 [Astro Guide](https://example.com)

![ignored alt](/cover.webp) \`inline hidden\`

\`\`\`ts
const hidden = 42;
\`\`\`

<strong>Visible</strong>`;

    expect(getPostMetrics(markdown)).toEqual({ words: 5, minutes: 1 });
  });

  it("按每分钟 360 个统计单位向上取整", () => {
    expect(getPostMetrics(Array.from({ length: 360 }, () => "word").join(" ")).minutes).toBe(1);
    expect(getPostMetrics(Array.from({ length: 361 }, () => "word").join(" ")).minutes).toBe(2);
  });
});
