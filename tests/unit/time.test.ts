import { describe, expect, it } from "vitest";
import {
  buildCalendarModel,
  formatRelativeActivity,
  getRuntimeDays,
  toDateKey,
} from "../../src/scripts/core/time";

const SHANGHAI = "Asia/Shanghai";

describe("上海时区日期逻辑", () => {
  it("以当地午夜而非经过毫秒数计算运行天数", () => {
    const start = new Date("2026-05-21T00:00:00+08:00");
    expect(getRuntimeDays(start, new Date("2026-05-21T23:59:59+08:00"), SHANGHAI)).toBe(1);
    expect(getRuntimeDays(start, new Date("2026-05-22T00:00:00+08:00"), SHANGHAI)).toBe(2);
  });

  it("正确处理 UTC 与上海日期跨日", () => {
    expect(toDateKey(new Date("2026-07-15T16:01:00Z"), SHANGHAI)).toBe("2026-07-16");
    expect(formatRelativeActivity(
      new Date("2026-07-15T15:59:00Z"),
      new Date("2026-07-15T16:01:00Z"),
      SHANGHAI,
    )).toBe("1 天前");
    expect(formatRelativeActivity(new Date("2026-07-17T00:00:00+08:00"), new Date("2026-07-16T00:00:00+08:00"), SHANGHAI)).toBe("今天");
  });

  it("生成闰年二月并标记今天和有文章日期", () => {
    const model = buildCalendarModel(
      [new Date("2024-02-01T12:00:00+08:00"), new Date("2024-02-29T23:00:00+08:00")],
      new Date("2024-02-15T09:00:00+08:00"),
      SHANGHAI,
    );
    const days = model.cells.filter((cell) => cell.day !== null);

    expect(model).toMatchObject({ year: 2024, month: 2 });
    expect(model.cells).toHaveLength(35);
    expect(model.cells.slice(0, 4).every((cell) => cell.day === null)).toBe(true);
    expect(days).toHaveLength(29);
    expect(days.find((cell) => cell.day === 15)?.isToday).toBe(true);
    expect(days.filter((cell) => cell.hasPost).map((cell) => cell.day)).toEqual([1, 29]);
  });
});
