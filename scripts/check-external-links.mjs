import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const timeoutMs = Number(process.env.EXTERNAL_LINK_TIMEOUT_MS ?? 15_000);
const concurrency = Number(process.env.EXTERNAL_LINK_CONCURRENCY ?? 6);

if (!existsSync(distRoot)) {
  throw new Error("未找到 dist，请先运行 npm run build。");
}

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  }));
  return nested.flat();
};

const htmlFiles = (await walk(distRoot)).filter((file) => extname(file) === ".html");
const externalUrls = new Set();
const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  for (const match of html.matchAll(attributePattern)) {
    const value = match[1];
    if (/^https?:\/\//i.test(value)) externalUrls.add(value);
  }
}

const checkUrl = async (url) => {
  const request = async (method) => fetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "Aria-7th-Lab-Link-Check/1.0 (+https://aria7bl0g.pages.dev)",
    },
  });

  try {
    let response = await request("HEAD");
    if (response.status === 405 || response.status === 501) response = await request("GET");
    return { url, status: response.status };
  } catch (error) {
    return {
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const queue = [...externalUrls];
const results = [];

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
  while (queue.length > 0) {
    const url = queue.shift();
    if (url) results.push(await checkUrl(url));
  }
}));

const broken = results.filter((result) => result.status === 404 || result.status === 410);
const warnings = results.filter((result) =>
  result.error ||
  (typeof result.status === "number" && (result.status === 403 || result.status === 429 || result.status >= 500)),
);

warnings.forEach((result) => {
  console.warn(`外链警告: ${result.url} (${result.error ?? `HTTP ${result.status}`})`);
});

if (broken.length > 0) {
  broken.forEach((result) => console.error(`失效外链: ${result.url} (HTTP ${result.status})`));
  process.exitCode = 1;
} else {
  console.log(`外链检查完成，共检查 ${results.length} 个地址。`);
}
