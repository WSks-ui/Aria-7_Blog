/**
 * 站点层面的稳定配置集中在这里，避免导航、搜索兜底、运行时间与评论仓库
 * 分散在 Astro 模板和浏览器脚本里，后续改域名或迁移内容时只需核对一个入口。
 */
export const SITE_URL = "https://aria7bl0g.pages.dev";
export const SITE_STARTED_AT = "2026-05-21T00:00:00+08:00";

export const SITE_REPOSITORY = {
  owner: "WSks-ui",
  name: "Aria-7_Blog",
  url: "https://github.com/WSks-ui/Aria-7_Blog",
  legacyUrl: "https://github.com/WSks-ui/aria7-blog",
} as const;

export interface HomeConnectItem {
  id: "github" | "email" | "rss" | "bilibili";
  label: string;
  detail: string;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}

export interface HomeSkillItem {
  id: "astro" | "typescript" | "css" | "playwright" | "vitest";
  label: string;
  detail: string;
}

export const HOME_CONNECT_LINKS: readonly HomeConnectItem[] = [
  {
    id: "github",
    label: "GitHub",
    detail: "WSks-ui",
    href: "https://github.com/WSks-ui",
    external: true,
  },
  {
    id: "email",
    label: "Email",
    detail: "aria_7@yeah.net",
    href: "mailto:aria_7@yeah.net",
  },
  {
    id: "rss",
    label: "RSS",
    detail: "订阅更新",
    href: "/rss.xml",
  },
  {
    id: "bilibili",
    label: "Bilibili",
    detail: "COMING SOON",
    disabled: true,
  },
] as const;

export const HOME_SKILLS: readonly HomeSkillItem[] = [
  { id: "astro", label: "Astro", detail: "内容驱动的静态站点" },
  { id: "typescript", label: "TypeScript", detail: "可靠的交互类型边界" },
  { id: "css", label: "CSS", detail: "响应式视觉与动效" },
  { id: "playwright", label: "Playwright", detail: "端到端浏览器回归" },
  { id: "vitest", label: "Vitest", detail: "快速单元与契约测试" },
] as const;

export const SITE_NAVIGATION = [
  {
    href: "/",
    label: "HOME",
    sub: "front page",
    searchTitle: "Home",
    description: "返回 Aria-7th Lab 首页。",
    keywords: ["home", "front page", "首页", "主页", "aria"],
  },
  {
    href: "/blog/",
    label: "BLOG",
    sub: "notes",
    searchTitle: "Blog",
    description: "浏览所有技术笔记、学习记录和日常文章。",
    keywords: ["blog", "notes", "文章", "归档", "技术笔记"],
  },
  {
    href: "/game/",
    label: "GAME",
    sub: "playroom",
    searchTitle: "Game",
    description: "打开 Aria Chess 小型游戏页面。",
    keywords: ["game", "chess", "playroom", "游戏", "国际象棋"],
  },
  {
    href: "/works/",
    label: "WORKS",
    sub: "projects",
    searchTitle: "Works",
    description: "查看项目和 GitHub 作品列表。",
    keywords: ["works", "projects", "github", "项目", "作品"],
  },
  {
    href: "/me/",
    label: "ME",
    sub: "profile",
    searchTitle: "Me",
    description: "查看 Aria-7 的个人介绍。",
    keywords: ["me", "profile", "about", "个人", "介绍"],
  },
] as const;

export const COMMAND_FALLBACK_ENTRIES = SITE_NAVIGATION.map((item) => ({
  id: `page:${item.label.toLocaleLowerCase("en-US")}`,
  kind: "page",
  title: item.searchTitle,
  description: item.description,
  href: item.href,
  group: "页面",
  keywords: [...item.keywords],
}));

/**
 * Giscus 继续绑定旧博客 Discussions，保证既有评论数据和线程映射不发生变化。
 */
export const GISCUS_CONFIG = {
  repo: "WSks-ui/aria7-blog",
  repoId: "R_kgDOSnRppQ",
  category: "Announcements",
  categoryId: "DIC_kwDOSnRppc4C93Ww",
  mapping: "pathname",
  strict: "0",
  reactionsEnabled: "1",
  emitMetadata: "1",
  inputPosition: "top",
  lang: "zh-CN",
  loading: "lazy",
} as const;
