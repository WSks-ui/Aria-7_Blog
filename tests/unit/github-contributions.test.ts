import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  levelForCount,
  normalizeGraphqlResponse,
  parseContributionsHtml,
  validateSnapshot,
} from "../../scripts/lib/github-contributions.mjs";

const buildDays = (length: number) => {
  const start = Date.UTC(2025, 6, 28);
  return Array.from({ length }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return { date, count: index % 12 };
  });
};

describe("levelForCount", () => {
  it("按固定阈值映射 0-4 级", () => {
    expect(levelForCount(0)).toBe(0);
    expect(levelForCount(1)).toBe(1);
    expect(levelForCount(3)).toBe(1);
    expect(levelForCount(4)).toBe(2);
    expect(levelForCount(6)).toBe(2);
    expect(levelForCount(7)).toBe(3);
    expect(levelForCount(9)).toBe(3);
    expect(levelForCount(10)).toBe(4);
    expect(levelForCount(128)).toBe(4);
  });

  it("非法输入按 0 级处理", () => {
    expect(levelForCount(-1)).toBe(0);
    expect(levelForCount(1.5)).toBe(0);
    expect(levelForCount(Number.NaN)).toBe(0);
  });
});

describe("buildSnapshot / validateSnapshot", () => {
  it("归一化 days 并累计 total 与区间", () => {
    const snapshot = buildSnapshot(buildDays(371), "github-graphql", "2026-07-28T00:00:00.000Z")!;
    expect(snapshot).not.toBeNull();
    expect(snapshot.login).toBe("WSks-ui");
    expect(snapshot.source).toBe("github-graphql");
    expect(snapshot.days).toHaveLength(371);
    expect(snapshot.total).toBe(snapshot.days.reduce((sum, day) => sum + day.count, 0));
    expect(snapshot.range.from).toBe(snapshot.days[0].date);
    expect(snapshot.range.to).toBe(snapshot.days[snapshot.days.length - 1].date);
    expect(snapshot.days.every((day) => day.level === levelForCount(day.count))).toBe(true);
    expect(validateSnapshot(snapshot)).toBe(true);
  });

  it("拒绝非法 day 输入", () => {
    expect(buildSnapshot("nope", "x")).toBeNull();
    expect(buildSnapshot([{ date: "2026/07/28", count: 1 }], "x")).toBeNull();
    expect(buildSnapshot([{ date: "2026-07-28", count: -1 }], "x")).toBeNull();
    expect(buildSnapshot([{ date: "2026-07-28" }], "x")).toBeNull();
  });

  it("校验拒绝天数窗口异常与乱序", () => {
    expect(validateSnapshot(buildSnapshot(buildDays(10), "x"))).toBe(false);
    expect(validateSnapshot(buildSnapshot(buildDays(400), "x"))).toBe(false);

    const disordered = buildDays(365);
    [disordered[3], disordered[4]] = [disordered[4], disordered[3]];
    expect(validateSnapshot(buildSnapshot(disordered, "x"))).toBe(false);
  });

  it("校验拒绝 total 与实际不符", () => {
    const snapshot = buildSnapshot(buildDays(365), "x")!;
    snapshot.total += 1;
    expect(validateSnapshot(snapshot)).toBe(false);
  });
});

describe("normalizeGraphqlResponse", () => {
  it("拍平 weeks 结构", () => {
    const payload = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 3,
              weeks: [
                { contributionDays: [{ date: "2025-07-28", contributionCount: 1 }] },
                { contributionDays: [{ date: "2025-07-29", contributionCount: 2 }] },
              ],
            },
          },
        },
      },
    };
    expect(normalizeGraphqlResponse(payload)).toEqual([
      { date: "2025-07-28", count: 1 },
      { date: "2025-07-29", count: 2 },
    ]);
  });

  it("结构缺失或周数据非法时返回 null", () => {
    expect(normalizeGraphqlResponse({})).toBeNull();
    expect(normalizeGraphqlResponse({ data: { user: null } })).toBeNull();
    expect(
      normalizeGraphqlResponse({
        data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{}] } } } },
      }),
    ).toBeNull();
  });
});

describe("parseContributionsHtml", () => {
  const fixture = `
    <table>
      <tr>
        <td class="ContributionCalendar-day" data-date="2025-07-27" data-level="0" id="day-1" tabindex="-1"></td>
        <td class="ContributionCalendar-day" data-date="2025-07-28" data-level="2" id="day-2" tabindex="-1"></td>
        <td id="day-3" class="ContributionCalendar-day" data-date="2025-07-29" data-level="1"></td>
      </tr>
    </table>
    <tool-tip for="day-1" class="sr-only">No contributions on July 27th.</tool-tip>
    <tool-tip for="day-2" class="sr-only">6 contributions on July 28th.</tool-tip>
    <tool-tip for="day-3" class="sr-only">1 contribution on July 29th.</tool-tip>
  `;

  it("解析单元格与 tool-tip 配对计数", () => {
    expect(parseContributionsHtml(fixture)).toEqual([
      { date: "2025-07-27", count: 0 },
      { date: "2025-07-28", count: 6 },
      { date: "2025-07-29", count: 1 },
    ]);
  });

  it("真实端点为星期行 × 周列结构，解析后按日期排序（回归）", () => {
    // GitHub 实际 DOM：先 53 个周日、再 53 个周一……文档序 ≠ 时间序
    const rowMajor = `
      <td data-date="2025-07-27" id="w0"></td>
      <td data-date="2025-08-03" id="w1"></td>
      <td data-date="2025-07-28" id="m0"></td>
      <td data-date="2025-08-04" id="m1"></td>
      <tool-tip for="w0">No contributions on July 27th.</tool-tip>
      <tool-tip for="w1">2 contributions on August 3rd.</tool-tip>
      <tool-tip for="m0">1 contribution on July 28th.</tool-tip>
      <tool-tip for="m1">3 contributions on August 4th.</tool-tip>
    `;
    expect(parseContributionsHtml(rowMajor)).toEqual([
      { date: "2025-07-27", count: 0 },
      { date: "2025-07-28", count: 1 },
      { date: "2025-08-03", count: 2 },
      { date: "2025-08-04", count: 3 },
    ]);
  });

  it("tool-tip 缺失或计数无法解析时返回 null", () => {
    const missingTooltip = '<td data-date="2025-07-27" id="day-x"></td>';
    expect(parseContributionsHtml(missingTooltip)).toBeNull();
    expect(parseContributionsHtml('<td data-date="2025-07-27"></td>')).toBeNull();
  });

  it("空输入与非 HTML 返回 null", () => {
    expect(parseContributionsHtml("")).toBeNull();
    expect(parseContributionsHtml(null)).toBeNull();
    expect(parseContributionsHtml("<html><body>no cells</body></html>")).toBeNull();
  });
});
