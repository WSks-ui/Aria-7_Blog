import { describe, expect, it } from "vitest";
import { calculateReadingProgress } from "../../src/scripts/core/reading-progress";

describe("阅读进度", () => {
  it("在文章可滚动区间内计算比例", () => {
    expect(calculateReadingProgress(100, 100, 1_000, 200)).toBe(0);
    expect(calculateReadingProgress(500, 100, 1_000, 200)).toBe(0.5);
    expect(calculateReadingProgress(900, 100, 1_000, 200)).toBe(1);
  });

  it("将区间外值钳制到 0-1，并处理短文章", () => {
    expect(calculateReadingProgress(-1_000, 100, 1_000, 200)).toBe(0);
    expect(calculateReadingProgress(5_000, 100, 1_000, 200)).toBe(1);
    expect(calculateReadingProgress(300, 100, 100, 800)).toBe(0);
  });
});
