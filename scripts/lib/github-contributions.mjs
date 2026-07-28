/**
 * GitHub 贡献数据的纯函数层：解析、归一化、校验。
 * 被 scripts/fetch-github-contributions.mjs 与 vitest 单测共用，
 * 因此保持零副作用、零网络、零文件系统，所有 I/O 都在调用方。
 */

export const GITHUB_LOGIN = "WSks-ui";
export const CONTRIBUTIONS_HTML_URL = `https://github.com/users/${GITHUB_LOGIN}/contributions`;
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/**
 * 固定阈值而非 GraphQL 返回的等级：两端数据源口径一致，SSR 输出确定，且可单测。
 * 0 / 1-3 / 4-6 / 7-9 / >=10 映射到 0-4。
 */
export const levelForCount = (count) => {
  if (!Number.isInteger(count) || count < 0) return 0;
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** GraphQL contributionsCollection 查询。公开贡献用 GITHUB_TOKEN 即可；私有贡献需 read:user PAT。 */
export const CONTRIBUTIONS_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

const normalizeDays = (rawDays) => {
  if (!Array.isArray(rawDays)) return null;
  /** @type {{ date: string, count: number, level: number }[]} */
  const days = [];
  for (const day of rawDays) {
    const count = Number(day?.count);
    if (typeof day?.date !== "string" || !DATE_PATTERN.test(day.date)) return null;
    if (!Number.isInteger(count) || count < 0) return null;
    days.push({ date: day.date, count, level: levelForCount(count) });
  }
  return days;
};

/** 把任意来源的 days 归一化为快照契约；不合法返回 null。 */
export const buildSnapshot = (rawDays, source, generatedAt = new Date().toISOString()) => {
  const days = normalizeDays(rawDays);
  if (!days) return null;
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return {
    generatedAt,
    source,
    login: GITHUB_LOGIN,
    total,
    range: { from: days[0].date, to: days[days.length - 1].date },
    days,
  };
};

/** 快照校验：一年窗口 360-380 天、日期升序连续、level/count 合法。 */
export const validateSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return false;
  const { days, total, range, login, generatedAt } = snapshot;
  if (login !== GITHUB_LOGIN || typeof generatedAt !== "string") return false;
  if (!range || !DATE_PATTERN.test(range.from ?? "") || !DATE_PATTERN.test(range.to ?? "")) return false;
  if (!Array.isArray(days) || days.length < 360 || days.length > 380) return false;
  if (!Number.isInteger(total) || total < 0) return false;

  let sum = 0;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day || !DATE_PATTERN.test(day.date)) return false;
    if (!Number.isInteger(day.count) || day.count < 0) return false;
    if (!Number.isInteger(day.level) || day.level < 0 || day.level > 4) return false;
    sum += day.count;
    if (i > 0 && day.date <= days[i - 1].date) return false;
  }
  return sum === total && days[0].date === range.from && days[days.length - 1].date === range.to;
};

/** GraphQL 响应 -> days 数组；结构不符合预期返回 null。 */
export const normalizeGraphqlResponse = (payload) => {
  const weeks = payload?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) return null;
  const days = [];
  for (const week of weeks) {
    const contributionDays = week?.contributionDays;
    if (!Array.isArray(contributionDays)) return null;
    for (const day of contributionDays) {
      days.push({ date: day?.date, count: day?.contributionCount });
    }
  }
  return days;
};

/**
 * HTML 端点解析（免 token 降级路径）。
 * 单元格：<td class="ContributionCalendar-day" data-date="..." data-level="..." id="...">
 * 计数在配对的 <tool-tip for="单元格id">N contributions on ...</tool-tip> 里。
 * 注意 DOM 按「星期行 × 周列」排列（先 53 个周日、再 53 个周一……），不是时间序，
 * 因此解析后必须按日期排序；属性顺序与 id/for 配对按 GitHub 当前输出编写，
 * 结构变更时 fixtures 单测会变红灯。
 */
export const parseContributionsHtml = (html) => {
  if (typeof html !== "string" || html.length === 0) return null;

  const countsById = new Map();
  const tooltipPattern = /<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  for (const match of html.matchAll(tooltipPattern)) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    const countMatch = text.match(/^(\d+|No) contributions?\b/i);
    if (!countMatch) continue;
    countsById.set(match[1], countMatch[1].toLowerCase() === "no" ? 0 : Number(countMatch[1]));
  }

  const days = [];
  const cellPattern = /<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
  for (const match of html.matchAll(cellPattern)) {
    const attrs = match[0];
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const count = idMatch ? countsById.get(idMatch[1]) : undefined;
    if (count === undefined) return null;
    days.push({ date: match[1], count });
  }

  // DOM 顺序是「星期行 × 周列」（所有周日、所有周一……），并非时间序，必须排序归一。
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days.length > 0 ? days : null;
};
