import { buildSearchIndex } from "../utils/searchIndex";
import { getSiteCatalog } from "../utils/siteCatalog";

export const prerender = true;

export async function GET() {
  const entries = buildSearchIndex(await getSiteCatalog());
  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
