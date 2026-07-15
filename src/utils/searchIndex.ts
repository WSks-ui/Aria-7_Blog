import type { CollectionEntry } from "astro:content";
import { repositories } from "../data/repositories";

export type CommandKind = "page" | "post" | "tag" | "project";

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

export const STATIC_PAGE_ENTRIES: SearchIndexEntry[] = [
  { id: "page:home", kind: "page", title: "Home", description: "返回 Aria-7th Lab 首页。", href: "/", group: "页面", keywords: ["home", "front page", "首页", "主页", "aria"] },
  { id: "page:blog", kind: "page", title: "Blog", description: "浏览所有技术笔记、学习记录和日常文章。", href: "/blog/", group: "页面", keywords: ["blog", "notes", "文章", "归档", "技术笔记"] },
  { id: "page:works", kind: "page", title: "Works", description: "查看项目和 GitHub 作品列表。", href: "/works/", group: "页面", keywords: ["works", "projects", "github", "项目", "作品"] },
  { id: "page:game", kind: "page", title: "Game", description: "打开 Aria Chess 小型游戏页面。", href: "/game/", group: "页面", keywords: ["game", "chess", "playroom", "游戏", "国际象棋"] },
  { id: "page:me", kind: "page", title: "Me", description: "查看 Aria-7 的个人介绍。", href: "/me/", group: "页面", keywords: ["me", "profile", "about", "个人", "介绍"] },
];

export const buildSearchIndex = (posts: CollectionEntry<"blog">[]): SearchIndexEntry[] => {
  const sortedPosts = [...posts].filter((post) => !post.data.draft).sort((a, b) => {
    const dateA = a.data.updatedDate ?? a.data.pubDate;
    const dateB = b.data.updatedDate ?? b.data.pubDate;
    return dateB.valueOf() - dateA.valueOf();
  });
  const postEntries: SearchIndexEntry[] = sortedPosts.map((post) => {
    const date = post.data.updatedDate ?? post.data.pubDate;
    const category = post.data.category ?? "文章";
    return {
      id: `post:${post.id}`,
      kind: "post",
      title: post.data.title,
      description: post.data.description,
      href: `/blog/${post.id}/`,
      group: "文章",
      keywords: [post.data.title, post.data.description, category, ...post.data.tags],
      meta: `${category} / ${date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      updatedTime: date.valueOf(),
    };
  });
  const tagMap = new Map<string, { count: number; latestPostId: string; latestTime: number }>();
  sortedPosts.forEach((post) => {
    const postTime = (post.data.updatedDate ?? post.data.pubDate).valueOf();
    post.data.tags.forEach((rawTag) => {
      const tag = rawTag.trim();
      if (!tag) return;
      const current = tagMap.get(tag);
      if (!current) tagMap.set(tag, { count: 1, latestPostId: post.id, latestTime: postTime });
      else {
        current.count += 1;
        if (postTime > current.latestTime) {
          current.latestPostId = post.id;
          current.latestTime = postTime;
        }
      }
    });
  });
  const tagEntries: SearchIndexEntry[] = [...tagMap.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latestTime - a[1].latestTime || a[0].localeCompare(b[0], "zh-CN"))
    .map(([tag, data]) => ({
      id: `tag:${tag}`,
      kind: "tag",
      title: `#${tag}`,
      description: `查看 ${tag} 相关最新文章，共 ${data.count} 篇记录。`,
      href: `/blog/${data.latestPostId}/`,
      group: "标签",
      keywords: [tag, `#${tag}`, "tag", "标签"],
      meta: `${data.count} 篇`,
      updatedTime: data.latestTime,
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
  return [...STATIC_PAGE_ENTRIES, ...postEntries, ...tagEntries, ...projectEntries];
};
