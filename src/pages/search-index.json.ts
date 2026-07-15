import { getCollection } from "astro:content";
import { buildSearchIndex } from "../utils/searchIndex";

export const prerender = true;

export async function GET() {
  const entries = buildSearchIndex(await getCollection("blog"));
  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
