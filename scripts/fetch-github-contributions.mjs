#!/usr/bin/env node
/**
 * 刷新 src/data/github-contributions.json 快照。
 *
 * 降级链：GraphQL（需 GITHUB_TOKEN）→ HTML 端点（免 token）→ 保留既有快照。
 * 任何失败都以退出码 0 结束——快照刷新是增强动作，绝不允许中断本地开发或 CI。
 *
 * 代理：Node 内建 fetch 不读 HTTP(S)_PROXY，检测到代理变量时用 undici
 * EnvHttpProxyAgent 显式接管（本机科学上网 Clash 默认 http://127.0.0.1:7890）。
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import {
  CONTRIBUTIONS_HTML_URL,
  CONTRIBUTIONS_QUERY,
  GITHUB_GRAPHQL_URL,
  GITHUB_LOGIN,
  buildSnapshot,
  normalizeGraphqlResponse,
  parseContributionsHtml,
  validateSnapshot,
} from "./lib/github-contributions.mjs";

const SNAPSHOT_PATH = resolve(process.cwd(), "src/data/github-contributions.json");
const TIMEOUT_MS = 10_000;

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.log(`[contributions] 检测到代理变量，请求将经代理发出`);
}

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const fetchViaGraphql = async () => {
  const token = process.env.GITHUB_TOKEN || process.env.CONTRIBUTIONS_PAT;
  if (!token) return null;

  const response = await fetchWithTimeout(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `bearer ${token}`,
      "user-agent": "aria7-blog-contributions-sync",
    },
    body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login: GITHUB_LOGIN } }),
  });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.errors?.length) throw new Error(`GraphQL errors: ${payload.errors[0]?.message}`);
  return normalizeGraphqlResponse(payload);
};

const fetchViaHtml = async () => {
  const response = await fetchWithTimeout(CONTRIBUTIONS_HTML_URL, {
    headers: { "user-agent": "aria7-blog-contributions-sync" },
  });
  if (!response.ok) throw new Error(`HTML endpoint HTTP ${response.status}`);
  return parseContributionsHtml(await response.text());
};

const main = async () => {
  const attempts = [
    ["github-graphql", fetchViaGraphql],
    ["github-html", fetchViaHtml],
  ];

  for (const [source, load] of attempts) {
    try {
      const days = await load();
      if (!days) continue; // token 缺失等「不可用」场景，静默走下一条路径
      const snapshot = buildSnapshot(days, source);
      if (!snapshot || !validateSnapshot(snapshot)) {
        console.warn(`[contributions] ${source} 返回的数据未通过校验，尝试下一条路径`);
        continue;
      }
      await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(
        `[contributions] 快照已更新：${snapshot.days.length} 天 / 共 ${snapshot.total} 次贡献（来源 ${source}）`,
      );
      return;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "请求超时" : (error?.message ?? error);
      console.warn(`[contributions] ${source} 路径失败：${reason}`);
    }
  }

  // 全部失败：快照是构建输入，保留旧文件比中断流程重要得多。
  try {
    const existing = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    console.warn(
      `[contributions] 所有数据源均不可用，保留既有快照（generatedAt=${existing?.generatedAt ?? "未知"}）`,
    );
  } catch {
    console.warn("[contributions] 所有数据源均不可用，且本地无既有快照；请联网或开代理后重试");
  }
};

await main();
