import { describe, expect, it } from "vitest";
import {
  HEATMAP_WEEKS,
  aggregateDates,
  buildHeatmapModel,
  isSnapshotStale,
  levelForCount,
  parseSnapshot,
  snapshotToCounts,
} from "../../src/utils/contributionHeatmap";

const END_DATE = "2026-07-28"; // 周二

describe("levelForCount", () => {
  it("与抓取脚本共享同一套阈值", () => {
    expect(levelForCount(0)).toBe(0);
    expect(levelForCount(3)).toBe(1);
    expect(levelForCount(4)).toBe(2);
    expect(levelForCount(7)).toBe(3);
    expect(levelForCount(10)).toBe(4);
    expect(levelForCount(-2)).toBe(0);
    expect(levelForCount(2.5)).toBe(0);
  });
});

describe("buildHeatmapModel", () => {
  it("生成 53 列 × 7 行，末格为结束日", () => {
    const model = buildHeatmapModel(new Map(), END_DATE);
    expect(model.weeks).toHaveLength(HEATMAP_WEEKS);
    for (const week of model.weeks) expect(week).toHaveLength(7);
    const lastWeek = model.weeks[HEATMAP_WEEKS - 1];
    const lastInRange = lastWeek.filter((cell) => cell.inRange).at(-1);
    expect(lastInRange?.date).toBe(END_DATE);
  });

  it("首列从周日开始，未来格子标记为不在窗口内", () => {
    const model = buildHeatmapModel(new Map(), END_DATE);
    const firstSunday = new Date(`${model.startDate}T00:00:00Z`).getUTCDay();
    expect(firstSunday).toBe(0);

    const lastWeek = model.weeks[HEATMAP_WEEKS - 1];
    const future = lastWeek.filter((cell) => !cell.inRange);
    expect(future.length).toBeGreaterThan(0); // 周二之后还有周三到周六
    expect(future.every((cell) => cell.level === 0 && cell.count === 0)).toBe(true);
  });

  it("聚合计数、活跃天数与最大值", () => {
    const counts = new Map([
      ["2026-07-28", 5],
      ["2026-07-01", 2],
      ["2020-01-01", 99], // 窗口外，不计入
    ]);
    const model = buildHeatmapModel(counts, END_DATE);
    expect(model.total).toBe(7);
    expect(model.activeDays).toBe(2);
    expect(model.maxCount).toBe(5);

    const day = model.weeks.flat().find((cell) => cell.date === "2026-07-28");
    expect(day?.count).toBe(5);
    expect(day?.level).toBe(2);
  });

  it("月份标签锚定每月 1 号所在列且互不重叠", () => {
    const model = buildHeatmapModel(new Map(), END_DATE);
    expect(model.monthLabels.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < model.monthLabels.length; i += 1) {
      expect(model.monthLabels[i].weekIndex - model.monthLabels[i - 1].weekIndex).toBeGreaterThanOrEqual(3);
    }
    for (const label of model.monthLabels) {
      const week = model.weeks[label.weekIndex];
      expect(week.some((cell) => cell.date.endsWith("-01"))).toBe(true);
    }
  });

  it("跨年窗口覆盖完整一年", () => {
    const model = buildHeatmapModel(new Map(), END_DATE);
    const span =
      (new Date(`${model.endDate}T00:00:00Z`).getTime() - new Date(`${model.startDate}T00:00:00Z`).getTime()) /
      86_400_000;
    // 跨度 = 52 个完整周 + 结束日在末列中的星期偏移（2026-07-28 是周二）
    expect(span).toBe((HEATMAP_WEEKS - 1) * 7 + 2);
  });
});

describe("aggregateDates", () => {
  it("按站点时区聚合同日文章", () => {
    const counts = aggregateDates([
      new Date("2026-07-01T02:00:00+08:00"),
      new Date("2026-07-01T22:30:00+08:00"),
      new Date("2026-07-03T12:00:00+08:00"),
    ]);
    expect(counts.get("2026-07-01")).toBe(2);
    expect(counts.get("2026-07-03")).toBe(1);
  });
});

describe("parseSnapshot / snapshotToCounts", () => {
  const buildSnapshot = (length = 371) => {
    const start = Date.UTC(2025, 6, 28);
    const days = Array.from({ length }, (_, index) => {
      const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      return { date, count: index % 5, level: index % 5 === 0 ? 0 : 1 };
    });
    return {
      generatedAt: "2026-07-28T00:00:00.000Z",
      source: "github-graphql",
      login: "WSks-ui",
      total: days.reduce((sum, day) => sum + day.count, 0),
      range: { from: days[0].date, to: days.at(-1)!.date },
      days,
    };
  };

  it("接受合法快照并转换为计数表", () => {
    const snapshot = parseSnapshot(buildSnapshot());
    expect(snapshot).not.toBeNull();
    const counts = snapshotToCounts(snapshot!);
    expect(counts.size).toBe(371);
    expect(counts.get("2025-07-29")).toBe(1);
  });

  it("拒绝天数异常、total 不符与字段缺失", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot(buildSnapshot(10))).toBeNull();
    const bad = buildSnapshot();
    bad.total += 1;
    expect(parseSnapshot(bad)).toBeNull();
    const badLevel = buildSnapshot();
    badLevel.days[0].level = 9;
    expect(parseSnapshot(badLevel)).toBeNull();
  });
});

describe("isSnapshotStale", () => {
  it("超过 7 天判定过期，非法日期视为过期", () => {
    const now = new Date("2026-07-28T00:00:00.000Z");
    expect(isSnapshotStale("2026-07-27T00:00:00.000Z", now)).toBe(false);
    expect(isSnapshotStale("2026-07-20T23:59:59.000Z", now)).toBe(true);
    expect(isSnapshotStale("not-a-date", now)).toBe(true);
  });
});
