import type { CollectionEntry } from "astro:content";
import { repositories } from "../data/repositories";
import { SITE_NAVIGATION } from "../site-config";
import { buildSiteCatalog, type SiteCatalog } from "./siteCatalog";

export type CommandKind = "page" | "post" | "tag" | "category" | "project";

export interface SearchIndexEntry {
  id: string;
  kind: CommandKind;
  title: string;
  description: string;
  href: string;
  group: string;
  keywords: string[];
  meta?: string;
  external?: boolean;
  updatedTime?: number;
}

export const STATIC_PAGE_ENTRIES: SearchIndexEntry[] = SITE_NAVIGATION.map((item) => ({
  id: `page:${item.label.toLocaleLowerCase("en-US")}`,
  kind: "page",
  title: item.searchTitle,
  description: item.description,
  href: item.href,
  group: "页面",
  keywords: [...item.keywords],
}));

const isSiteCatalog = (value: SiteCatalog | CollectionEntry<"blog">[]): value is SiteCatalog => !Array.isArray(value);
const catalogSearchIndexCache = new WeakMap<SiteCatalog, SearchIndexEntry[]>();

export const buildSearchIndex = (
  source: SiteCatalog | CollectionEntry<"blog">[],
  buildTime = new Date(),
): SearchIndexEntry[] => {
  const catalog = isSiteCatalog(source) ? source : buildSiteCatalog(source, buildTime);
  const cachedIndex = catalogSearchIndexCache.get(catalog);
  if (cachedIndex) return cachedIndex;

  const postEntries: SearchIndexEntry[] = catalog.posts.map((entry) => {
    const { post } = entry;
    return {
      id: `post:${post.id}`,
      kind: "post",
      title: entry.title,
      description: entry.description,
      href: `/blog/${post.id}/`,
      group: "文章",
      keywords: [
        entry.title,
        entry.description,
        entry.category,
        ...entry.tags,
        ...entry.keywords,
        ...(entry.series ? [entry.series] : []),
      ],
      meta: `${entry.category} / ${entry.activityDate.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      updatedTime: entry.activityDate.valueOf(),
    };
  });
  const tagEntries: SearchIndexEntry[] = catalog.tags.map((tag) => ({
    // 保持旧搜索索引的 tag:<原标签> ID 形式，只变更落地地址为归档页。
    id: `tag:${tag.label}`,
    kind: "tag",
    title: `#${tag.label}`,
    description: `查看 ${tag.label} 相关归档，共 ${tag.count} 篇文章。`,
    href: `/blog/tags/${tag.slug}/`,
    group: "标签",
    keywords: [tag.label, `#${tag.label}`, "tag", "标签", "归档"],
    meta: `${tag.count} 篇`,
    updatedTime: tag.latestPost.activityDate.valueOf(),
  }));
  const categoryEntries: SearchIndexEntry[] = catalog.categories.map((category) => ({
    id: `category:${category.slug}`,
    kind: "category",
    title: category.label,
    description: `浏览 ${category.label} 分类，共 ${category.count} 篇文章。`,
    href: `/blog/categories/${category.slug}/`,
    group: "分类",
    keywords: [category.label, "category", "分类", "归档"],
    meta: `${category.count} 篇`,
    updatedTime: category.latestPost.activityDate.valueOf(),
  }));
  const projectEntries: SearchIndexEntry[] = repositories.map((repo) => ({
    id: `project:${repo.name}`,
    kind: "project",
    title: repo.name,
    description: repo.description,
    href: repo.url,
    group: "项目",
    keywords: [repo.name, repo.description, repo.language, repo.mood, ...repo.tags],
    meta: `${repo.language} / ${repo.mood}`,
    external: true,
    updatedTime: new Date(repo.updated).valueOf(),
  }));
  const index = [...STATIC_PAGE_ENTRIES, ...postEntries, ...categoryEntries, ...tagEntries, ...projectEntries];
  catalogSearchIndexCache.set(catalog, index);
  return index;
};
