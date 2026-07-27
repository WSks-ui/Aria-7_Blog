import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getSiteCatalog } from "../utils/siteCatalog";

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const catalog = await getSiteCatalog();
  const origin = site ?? new URL("https://aria7bl0g.pages.dev");

  return rss({
    title: "Aria-7th Lab",
    description: "Aria-7th Lab 的笔记、札记和更新。",
    site: origin,
    items: catalog.posts.map((entry) => ({
      title: entry.title,
      description: entry.description,
      pubDate: entry.pubDate,
      link: `/blog/${entry.id}/`,
      categories: [entry.category, ...entry.tags],
    })),
    customData: "<language>zh-CN</language>",
  });
};
