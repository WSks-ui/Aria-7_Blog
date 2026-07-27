const origin = new URL(process.env.SITE_URL ?? "https://aria7bl0g.pages.dev");
const expectedSha = process.env.EXPECTED_SHA;
const articlePath = process.env.PRODUCTION_ARTICLE_PATH ?? "/blog/welcome/";
const attempts = Number(process.env.PRODUCTION_PROBE_ATTEMPTS ?? 30);
const intervalMs = Number(process.env.PRODUCTION_PROBE_INTERVAL_MS ?? 10_000);
const timeoutMs = Number(process.env.PRODUCTION_PROBE_TIMEOUT_MS ?? 15_000);

if (!expectedSha) {
  throw new Error("EXPECTED_SHA 未设置，无法确认生产部署是否对应当前提交。");
}

const request = async (pathname) => {
  const url = new URL(pathname, origin);
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Cache-Control": "no-cache" },
  });
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForVersion = async () => {
  let lastValue = "尚未请求";

  for (let index = 1; index <= attempts; index += 1) {
    try {
      const response = await request("/version.json");
      const payload = await response.json();
      lastValue = `HTTP ${response.status}, sha=${payload?.sha ?? "缺失"}`;
      if (response.ok && payload?.sha === expectedSha) return payload;
    } catch (error) {
      lastValue = error instanceof Error ? error.message : String(error);
    }

    if (index < attempts) await sleep(intervalMs);
  }

  throw new Error(`生产 /version.json 未在限定时间内对应当前 SHA ${expectedSha}（最后结果：${lastValue}）。`);
};

const requireResponse = async ({ path, status, contentType, headers = {} }) => {
  const response = await request(path);
  if (response.status !== status) {
    throw new Error(`${path} 应返回 HTTP ${status}，实际为 ${response.status}。`);
  }

  if (contentType && !response.headers.get("content-type")?.includes(contentType)) {
    throw new Error(`${path} Content-Type 应包含 ${contentType}，实际为 ${response.headers.get("content-type") ?? "缺失"}。`);
  }

  for (const [name, value] of Object.entries(headers)) {
    const actual = response.headers.get(name);
    if (actual !== value) {
      throw new Error(`${path} 响应头 ${name} 应为 ${value}，实际为 ${actual ?? "缺失"}。`);
    }
  }

  return response;
};

const version = await waitForVersion();
console.log(`生产版本已对齐：${version.sha}，构建时间 ${version.builtAt}。`);

const rootResponse = await requireResponse({
  path: "/",
  status: 200,
  contentType: "text/html",
  headers: {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  },
});
const homepage = await rootResponse.text();
if (homepage.includes("localhost")) {
  throw new Error("首页 HTML 仍包含 localhost，生产绝对地址配置不正确。");
}

await Promise.all([
  requireResponse({ path: articlePath, status: 200, contentType: "text/html" }),
  requireResponse({ path: "/search-index.json", status: 200, contentType: "application/json" }),
  requireResponse({ path: "/robots.txt", status: 200, contentType: "text/plain" }),
  requireResponse({ path: "/rss.xml", status: 200, contentType: "application/xml" }),
  requireResponse({ path: "/sitemap-index.xml", status: 200, contentType: "application/xml" }),
  requireResponse({
    path: "/version.json",
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
  }),
  requireResponse({ path: `/__probe-route-${expectedSha.slice(0, 12)}/`, status: 404, contentType: "text/html" }),
  requireResponse({ path: `/_astro/__probe-asset-${expectedSha.slice(0, 12)}.js`, status: 404, contentType: "text/html" }),
]);

console.log(`生产探针通过：${origin.origin}。`);
