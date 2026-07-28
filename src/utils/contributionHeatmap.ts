import { toDateKey } from "../scripts/core/time";

/**
 * 归档热力图的视图模型纯函数。
 * 与 scripts/lib/github-contributions.mjs 的 level 阈值保持一致——
 * 两边分别是构建期渲染与抓取脚本，模块体系不同（TS/.mjs），阈值改动需同步。
 */

export interface HeatmapDay {
  date: string;
  count: number;
  level: number;
}

export interface ContributionSnapshot {
  generatedAt: string;
  source: string;
  login: string;
  total: number;
  range: { from: string; to: string };
  days: HeatmapDay[];
}

export interface HeatmapCell {
  date: string;
  count: number;
  level: number;
  /** 超出窗口（未来日期）的格子渲染为空白占位。 */
  inRange: boolean;
}

export interface HeatmapMonthLabel {
  text: string;
  weekIndex: number;
}

export interface HeatmapModel {
  /** 53 列 × 7 行，行序为周日到周六（GitHub 约定）。 */
  weeks: HeatmapCell[][];
  monthLabels: HeatmapMonthLabel[];
  total: number;
  activeDays: number;
  maxCount: number;
  startDate: string;
  endDate: string;
}

export const HEATMAP_WEEKS = 53;
export const STALE_DAYS = 7;

/** 固定阈值：0 / 1-3 / 4-6 / 7-9 / >=10 → 0-4。 */
export const levelForCount = (count: number): number => {
  if (!Number.isInteger(count) || count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const serialOf = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

const keyOf = (serial: number): string => new Date(serial * 86_400_000).toISOString().slice(0, 10);

/** 快照运行时校验：构建期 import 的是本地 JSON，损坏时给出可定位的 null 而不是静默渲染错图。 */
export const parseSnapshot = (raw: unknown): ContributionSnapshot | null => {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = raw as ContributionSnapshot;
  const { generatedAt, source, login, total, range, days } = snapshot;
  if (typeof generatedAt !== "string" || typeof source !== "string" || typeof login !== "string") return null;
  if (!range || !DATE_PATTERN.test(range.from) || !DATE_PATTERN.test(range.to)) return null;
  if (!Number.isInteger(total) || total < 0) return null;
  if (!Array.isArray(days) || days.length < 360 || days.length > 380) return null;

  let sum = 0;
  for (const day of days) {
    if (!day || !DATE_PATTERN.test(day.date)) return null;
    if (!Number.isInteger(day.count) || day.count < 0) return null;
    if (!Number.isInteger(day.level) || day.level < 0 || day.level > 4) return null;
    sum += day.count;
  }
  return sum === total ? snapshot : null;
};

/** 把文章发布时间聚合为 dateKey → 篇数（写作热力数据源）。 */
export const aggregateDates = (dates: Date[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = toDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export const snapshotToCounts = (snapshot: ContributionSnapshot): Map<string, number> =>
  new Map(snapshot.days.map((day) => [day.date, day.count]));

/**
 * 以 endDate 为最后一格构建 53 周模型。
 * 末列从 endDate 所在周的周日开始，首列向前推 52 周；未来格子 inRange=false。
 */
export const buildHeatmapModel = (
  countsByDate: Map<string, number>,
  endDate: string,
): HeatmapModel => {
  const endSerial = serialOf(endDate);
  const endWeekday = new Date(endSerial * 86_400_000).getUTCDay();
  const lastColumnStart = endSerial - endWeekday;
  const firstColumnStart = lastColumnStart - (HEATMAP_WEEKS - 1) * 7;

  let total = 0;
  let activeDays = 0;
  let maxCount = 0;
  const weeks: HeatmapCell[][] = [];

  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const column: HeatmapCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const serial = firstColumnStart + week * 7 + row;
      const date = keyOf(serial);
      const inRange = serial <= endSerial;
      const count = inRange ? (countsByDate.get(date) ?? 0) : 0;
      if (inRange) {
        total += count;
        if (count > 0) activeDays += 1;
        if (count > maxCount) maxCount = count;
      }
      column.push({ date, count, level: inRange ? levelForCount(count) : 0, inRange });
    }
    weeks.push(column);
  }

  // 月份标签锚定「包含每月 1 号的列」；间距小于 3 列时跳过，避免跨年处标签重叠。
  const monthLabels: HeatmapMonthLabel[] = [];
  let lastLabelWeek = -3;
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const firstOfMonth = weeks[week].find((cell) => cell.inRange && cell.date.endsWith("-01"));
    if (!firstOfMonth) continue;
    if (week - lastLabelWeek < 3) continue;
    monthLabels.push({ text: `${Number(firstOfMonth.date.slice(5, 7))}月`, weekIndex: week });
    lastLabelWeek = week;
  }

  return {
    weeks,
    monthLabels,
    total,
    activeDays,
    maxCount,
    startDate: keyOf(firstColumnStart),
    endDate,
  };
};

/** 快照超过 STALE_DAYS 未刷新视为过期，组件显示角标而不是静默展示旧数据。 */
export const isSnapshotStale = (generatedAt: string, now = new Date()): boolean => {
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) return true;
  return now.getTime() - generated > STALE_DAYS * 86_400_000;
};
