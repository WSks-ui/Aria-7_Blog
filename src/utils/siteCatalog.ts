import { getCollection, type CollectionEntry } from "astro:content";
import { assertUniqueContentSlugs, slugifyContent } from "./contentSlug";
import { getBlogStats, type BlogStats } from "./blogStats";
import { getPostMetrics, type PostMetrics } from "./postMetrics";

export type BlogPostEntry = CollectionEntry<"blog">;
export type BlogPostData = BlogPostEntry["data"];

export interface PublishedPost {
  /** 保留 Astro 原始 entry，文章渲染仍直接交给 render(entry)。 */
  post: BlogPostEntry;
  id: string;
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  activityDate: Date;
  category: string;
  tags: string[];
  keywords: string[];
  metrics: PostMetrics;
  series?: string;
  seriesOrder?: number;
  lastReviewed?: Date;
}

export interface CatalogTerm {
  label: string;
  slug: string;
  count: number;
  latestPost: PublishedPost;
  posts: PublishedPost[];
}

export interface CatalogSeries {
  label: string;
  slug: string;
  posts: PublishedPost[];
}

export interface SiteCatalog {
  buildTime: Date;
  /** 首页、搜索和命令面板按最近活动排序。 */
  posts: PublishedPost[];
  /** Blog、标签和分类归档按发布日期排序。 */
  archivePosts: PublishedPost[];
  stats: BlogStats;
  tags: CatalogTerm[];
  categories: CatalogTerm[];
  series: CatalogSeries[];
}

const byActivityDesc = (a: PublishedPost, b: PublishedPost) =>
  b.activityDate.valueOf() - a.activityDate.valueOf() || b.pubDate.valueOf() - a.pubDate.valueOf() || a.id.localeCompare(b.id);

const byPublicationDesc = (a: PublishedPost, b: PublishedPost) =>
  b.pubDate.valueOf() - a.pubDate.valueOf() || b.activityDate.valueOf() - a.activityDate.valueOf() || a.id.localeCompare(b.id);

const normalizePost = (post: BlogPostEntry): PublishedPost => ({
  post,
  id: post.id,
  slug: post.id,
  title: post.data.title,
  description: post.data.description,
  pubDate: post.data.pubDate,
  activityDate: post.data.updatedDate ?? post.data.pubDate,
  category: post.data.category ?? "杂谈",
  tags: post.data.tags,
  keywords: post.data.keywords,
  metrics: getPostMetrics(post.body),
  series: post.data.series,
  seriesOrder: post.data.seriesOrder,
  lastReviewed: post.data.lastReviewed,
});

/**
 * 所有页面都通过这个谓词判断发布状态，避免首页、搜索、文章路径出现不一致。
 * buildTime 显式传入，方便构建期、测试和未来定时发布使用同一时间点。
 */
export const isPublishedPost = (post: BlogPostEntry, buildTime: Date): boolean =>
  post.data.draft !== true && post.data.pubDate.valueOf() <= buildTime.valueOf();

export const buildPublishedPosts = (posts: BlogPostEntry[], buildTime = new Date()): PublishedPost[] =>
  posts.filter((post) => isPublishedPost(post, buildTime)).map(normalizePost).sort(byActivityDesc);

const buildTerms = (posts: PublishedPost[], field: "tags" | "category"): CatalogTerm[] => {
  const labels = new Set<string>();
  posts.forEach((post) => {
    if (field === "tags") post.tags.forEach((tag) => labels.add(tag));
    else labels.add(post.category);
  });
  const slugMap = assertUniqueContentSlugs(labels, field === "tags" ? "标签" : "分类");
  return [...slugMap.entries()]
    .map(([slug, label]) => {
      const matchingPosts = posts.filter((post) =>
        field === "tags" ? post.tags.some((tag) => slugifyContent(tag) === slug) : slugifyContent(post.category) === slug,
      );
      const latestPost = [...matchingPosts].sort(byActivityDesc)[0];
      return {
        label,
        slug,
        count: matchingPosts.length,
        latestPost,
        posts: matchingPosts.sort(byPublicationDesc),
      };
    })
    .sort((a, b) => b.count - a.count || b.latestPost.activityDate.valueOf() - a.latestPost.activityDate.valueOf() || a.label.localeCompare(b.label, "zh-CN"));
};

const buildSeries = (posts: PublishedPost[]): CatalogSeries[] => {
  const labels = new Set(posts.flatMap((post) => (post.series ? [post.series] : [])));
  const slugMap = assertUniqueContentSlugs(labels, "系列");
  return [...slugMap.entries()]
    .map(([slug, label]) => ({
      label,
      slug,
      posts: posts
        .filter((post) => post.series && slugifyContent(post.series) === slug)
        .sort((a, b) => (a.seriesOrder ?? Number.MAX_SAFE_INTEGER) - (b.seriesOrder ?? Number.MAX_SAFE_INTEGER) || byActivityDesc(a, b)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
};

export const buildSiteCatalog = (entries: BlogPostEntry[], buildTime = new Date()): SiteCatalog => {
  const posts = buildPublishedPosts(entries, buildTime);
  return {
    buildTime,
    posts,
    archivePosts: [...posts].sort(byPublicationDesc),
    stats: getBlogStats(
      posts.map((entry) => ({
        data: entry.post.data,
        metrics: entry.metrics,
      })),
      { now: buildTime },
    ),
    tags: buildTerms(posts, "tags"),
    categories: buildTerms(posts, "category"),
    series: buildSeries(posts),
  };
};

// 默认目录在单次静态构建中只加载一次；传入时间则用于测试和定时发布的显式快照。
const catalogBuildTime = new Date();
let cachedCatalog: Promise<SiteCatalog> | undefined;

export const getSiteCatalog = async (buildTime?: Date): Promise<SiteCatalog> => {
  if (buildTime) return buildSiteCatalog(await getCollection("blog"), buildTime);

  cachedCatalog ??= getCollection("blog").then((entries) => buildSiteCatalog(entries, catalogBuildTime));
  return cachedCatalog;
};

export const getAdjacentPosts = (catalog: SiteCatalog, current: PublishedPost) => {
  const index = catalog.archivePosts.findIndex((post) => post.id === current.id);
  return {
    previous: index >= 0 && index < catalog.archivePosts.length - 1 ? catalog.archivePosts[index + 1] : undefined,
    next: index > 0 ? catalog.archivePosts[index - 1] : undefined,
  };
};

export const getSeriesPosts = (catalog: SiteCatalog, current: PublishedPost): PublishedPost[] => {
  if (!current.series) return [];
  const series = catalog.series.find((item) => slugifyContent(item.label) === slugifyContent(current.series!));
  return series?.posts.filter((post) => post.id !== current.id) ?? [];
};

export const getRelatedPosts = (catalog: SiteCatalog, current: PublishedPost, limit = 3): PublishedPost[] => {
  const currentTags = new Set(current.tags.map(slugifyContent));
  const currentKeywords = new Set(current.keywords.map(slugifyContent));
  return catalog.posts
    .filter((post) => post.id !== current.id)
    .map((post) => {
      const sharedTags = post.tags.filter((tag) => currentTags.has(slugifyContent(tag))).length;
      const sharedKeywords = post.keywords.filter((keyword) => currentKeywords.has(slugifyContent(keyword))).length;
      const sameSeries = Boolean(
        current.series && post.series && slugifyContent(current.series) === slugifyContent(post.series),
      );
      const sameCategory = post.category === current.category;
      const score = sharedTags * 5 + sharedKeywords * 2 + (sameCategory ? 1 : 0);
      return { post, score, sameSeries };
    })
    // 同系列内容单独呈现，避免在“相关阅读”中重复出现。
    .filter(({ score, sameSeries }) => score > 0 && !sameSeries)
    .sort((a, b) => b.score - a.score || byActivityDesc(a.post, b.post))
    .slice(0, limit)
    .map(({ post }) => post);
};
