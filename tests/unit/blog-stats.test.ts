import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOG_START_DATE, getBlogStats } from "../../src/utils/blogStats";

afterEach(() => {
  vi.useRealTimers();
});

describe("博客统计", () => {
  it("统计去重分类、标签、字数，并从未排序文章中选择最后活动", () => {
    const now = new Date("2026-07-16T12:00:00+08:00");
    const latest = new Date("2026-07-15T08:00:00+08:00");
    const stats = getBlogStats(
      [
        {
          body: "中文 Astro",
          data: {
            pubDate: new Date("2026-07-14T08:00:00+08:00"),
            category: "技术",
            tags: ["Astro", "前端"],
          },
        },
        {
          body: "[Guide](https://example.com) ![hidden](/cover.webp)",
          data: {
            pubDate: new Date("2026-06-01T08:00:00+08:00"),
            updatedDate: latest,
            category: "技术",
            tags: ["Astro", "随笔"],
          },
        },
        {
          data: { pubDate: new Date("2026-05-30T08:00:00+08:00") },
        },
      ],
      { now, startDate: new Date("2026-07-14T00:00:00+08:00") },
    );

    expect(stats).toMatchObject({
      posts: 3,
      categories: 2,
      tags: 3,
      words: 4,
      runtimeDays: 3,
      latestActivityText: "1 天前",
    });
    expect(stats.latestActivityDate).toEqual(latest);
  });

  it("空博客以当前时间作为最后活动并保留零计数", () => {
    const now = new Date("2024-02-29T12:00:00+08:00");
    const stats = getBlogStats([], {
      now,
      startDate: new Date("2024-02-28T00:00:00+08:00"),
      timeZone: "Asia/Shanghai",
    });

    expect(stats).toEqual({
      posts: 0,
      categories: 0,
      tags: 0,
      words: 0,
      runtimeDays: 2,
      latestActivityDate: now,
      latestActivityText: "今天",
    });
  });

  it("未提供选项时使用默认起始日、上海时区和当前时间", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T23:59:00+08:00"));
    const stats = getBlogStats([
      {
        body: "hello",
        data: { pubDate: new Date("2026-05-21T08:00:00+08:00"), tags: [] },
      },
    ]);

    expect(BLOG_START_DATE.toISOString()).toBe("2026-05-20T16:00:00.000Z");
    expect(stats.runtimeDays).toBe(1);
    expect(stats.latestActivityText).toBe("今天");
  });
});
