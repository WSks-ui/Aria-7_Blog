import type { APIRoute } from "astro";

export const prerender = true;

// 这些值在构建阶段固化，生产探针据此确认 Pages 已部署到当前 main 提交。
const sha =
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  "local";
const builtAt = new Date().toISOString();
const environment =
  process.env.CF_PAGES === "1"
    ? process.env.CF_PAGES_BRANCH === "main"
      ? "production"
      : "preview"
    : process.env.CI === "true"
      ? "ci"
      : "local";

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ sha, builtAt, environment }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
