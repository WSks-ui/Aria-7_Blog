import { getPostMetrics } from "./postMetrics";
import { formatRelativeActivity, getRuntimeDays } from "../scripts/core/time";

interface BlogPostLike {
  body?: string;
  data: {
    pubDate: Date;
    updatedDate?: Date;
    category?: string;
    tags?: string[];
  };
}

export interface BlogStats {
  posts: number;
  categories: number;
  tags: number;
  words: number;
  runtimeDays: number;
  latestActivityDate: Date;
  latestActivityText: string;
}

export const BLOG_START_DATE = new Date("2026-05-21T00:00:00+08:00");

export const getBlogStats = (
  posts: BlogPostLike[],
  options: { now?: Date; startDate?: Date; timeZone?: string } = {},
): BlogStats => {
  const now = options.now ?? new Date();
  const startDate = options.startDate ?? BLOG_START_DATE;
  const timeZone = options.timeZone ?? "Asia/Shanghai";
  const categories = new Set<string>();
  const tags = new Set<string>();
  let words = 0;
  let latestActivityDate = new Date(0);

  for (const post of posts) {
    categories.add(post.data.category ?? "杂谈");
    post.data.tags?.forEach((tag) => tags.add(tag));
    words += getPostMetrics(post.body).words;
    const activityDate = post.data.updatedDate ?? post.data.pubDate;
    if (activityDate > latestActivityDate) latestActivityDate = activityDate;
  }
  if (!posts.length) latestActivityDate = now;

  return {
    posts: posts.length,
    categories: categories.size,
    tags: tags.size,
    words,
    runtimeDays: getRuntimeDays(startDate, now, timeZone),
    latestActivityDate,
    latestActivityText: formatRelativeActivity(latestActivityDate, now, timeZone),
  };
};

