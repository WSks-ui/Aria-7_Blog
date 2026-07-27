import { describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
}));

import {
  buildSiteCatalog,
  getAdjacentPosts,
  getRelatedPosts,
  getSeriesPosts,
  isPublishedPost,
  type BlogPostEntry,
} from "../../src/utils/siteCatalog";
import { assertUniqueContentSlugs, slugifyContent } from "../../src/utils/contentSlug";
import { buildSearchIndex } from "../../src/utils/searchIndex";

const makePost = (
  id: string,
  {
    pubDate,
    updatedDate,
    draft = false,
    category = "技术",
    tags = [],
    keywords = [],
    series,
    seriesOrder,
  }: {
    pubDate: string;
    updatedDate?: string;
    draft?: boolean;
    category?: string;
    tags?: string[];
    keywords?: string[];
    series?: string;
    seriesOrder?: number;
  },
): BlogPostEntry =>
  ({
    id,
    body: `# ${id}`,
    data: {
      title: `文章 ${id}`,
      description: "用于验证内容目录排序与公开条件的测试文章。",
      pubDate: new Date(pubDate),
      updatedDate: updatedDate ? new Date(updatedDate) : undefined,
      category,
      tags,
      keywords,
      series,
      seriesOrder,
      comment: true,
      draft,
    },
  }) as unknown as BlogPostEntry;

describe("SiteCatalog", () => {
  it("统一过滤草稿和未来文章，并区分活动排序与归档排序", () => {
    const buildTime = new Date("2026-06-10T00:00:00+08:00");
    const olderButUpdated = makePost("older-updated", {
      pubDate: "2026-06-01T00:00:00+08:00",
      updatedDate: "2026-06-09T00:00:00+08:00",
    });
    const newer = makePost("newer", { pubDate: "2026-06-05T00:00:00+08:00" });
    const future = makePost("future", { pubDate: "2026-06-11T00:00:00+08:00" });
    const draft = makePost("draft", { pubDate: "2026-06-02T00:00:00+08:00", draft: true });

    const catalog = buildSiteCatalog([olderButUpdated, newer, future, draft], buildTime);

    expect(isPublishedPost(olderButUpdated, buildTime)).toBe(true);
    expect(isPublishedPost(future, buildTime)).toBe(false);
    expect(isPublishedPost(draft, buildTime)).toBe(false);
    expect(catalog.posts.map((post) => post.id)).toEqual(["older-updated", "newer"]);
    expect(catalog.archivePosts.map((post) => post.id)).toEqual(["newer", "older-updated"]);
    expect(catalog.stats.posts).toBe(2);
    expect(catalog.posts[0].metrics.minutes).toBeGreaterThanOrEqual(1);
    expect(getAdjacentPosts(catalog, catalog.archivePosts[0])).toEqual({
      previous: catalog.archivePosts[1],
      next: undefined,
    });
  });

  it("将同系列与相关阅读分开，并让搜索结果指向稳定的归档地址", () => {
    const catalog = buildSiteCatalog([
      makePost("series-start", {
        pubDate: "2026-06-01T00:00:00+08:00",
        category: "建站记录",
        tags: ["博客开发"],
        keywords: ["Astro"],
        series: "博客演进",
        seriesOrder: 1,
      }),
      makePost("series-next", {
        pubDate: "2026-06-03T00:00:00+08:00",
        category: "建站记录",
        tags: ["博客开发"],
        keywords: ["Astro"],
        series: "博客演进",
        seriesOrder: 2,
      }),
      makePost("related", {
        pubDate: "2026-06-02T00:00:00+08:00",
        category: "建站记录",
        tags: ["博客开发"],
        keywords: ["Astro"],
      }),
    ]);
    const current = catalog.posts.find((post) => post.id === "series-start")!;

    expect(getSeriesPosts(catalog, current).map((post) => post.id)).toEqual(["series-next"]);
    expect(getRelatedPosts(catalog, current).map((post) => post.id)).toEqual(["related"]);

    const index = buildSearchIndex(catalog);
    expect(index).toContainEqual(expect.objectContaining({
      id: "tag:博客开发",
      kind: "tag",
      href: "/blog/tags/博客开发/",
    }));
    expect(index).toContainEqual(expect.objectContaining({
      kind: "category",
      href: "/blog/categories/建站记录/",
    }));
    expect(index.find((entry) => entry.id === "post:series-start")?.keywords).toContain("Astro");
  });
});

describe("内容 slug", () => {
  it("保留中文并归一英文、全角和空白", () => {
    expect(slugifyContent("  Ａstro  建站_记录! ")).toBe("astro-建站-记录");
  });

  it("在不同可见词条映射到同一 slug 时拒绝构建", () => {
    expect(() => assertUniqueContentSlugs(["Astro", "astro"], "标签")).toThrow("标签 slug 冲突");
  });
});
