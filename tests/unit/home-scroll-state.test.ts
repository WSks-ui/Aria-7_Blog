import { describe, expect, it } from "vitest";
import {
  deriveHomeScrollSnapshot,
  mapHomeRevealProgress,
} from "../../src/scripts/core/home-scroll-state";

describe("首页滚动快照", () => {
  it("桌面端用同一进度派生揭幕、导航和 Footer 状态", () => {
    const middle = deriveHomeScrollSnapshot({
      scrollY: 450,
      viewportHeight: 900,
      stageHeight: 900,
      dataTop: 0,
      dataHeight: 900,
      mobile: false,
      reduceMotion: false,
    });
    expect(middle).toMatchObject({
      progress: 0.5,
      dataProgress: 0.5,
      splitY: 450,
      pastHero: false,
      layerEndReached: false,
      footerEligible: false,
      contentInteractive: true,
    });

    const footer = deriveHomeScrollSnapshot({
      scrollY: 950,
      viewportHeight: 900,
      stageHeight: 900,
      dataTop: 0,
      dataHeight: 900,
      mobile: false,
      reduceMotion: false,
    });
    expect(footer).toMatchObject({
      progress: 1,
      pastHero: true,
      layerEndReached: true,
      footerEligible: true,
    });
  });

  it("移动端按数据层进入视口的自然距离计算阅读进度", () => {
    const entry = deriveHomeScrollSnapshot({
      scrollY: 0,
      viewportHeight: 844,
      stageHeight: 1864,
      dataTop: 844,
      dataHeight: 1020,
      mobile: true,
      reduceMotion: false,
    });
    expect(entry.dataProgress).toBe(0);
    expect(entry.footerEligible).toBe(false);

    const halfway = deriveHomeScrollSnapshot({
      scrollY: 900,
      viewportHeight: 844,
      stageHeight: 1864,
      dataTop: 334,
      dataHeight: 1020,
      mobile: true,
      reduceMotion: false,
    });
    expect(halfway.dataProgress).toBeCloseTo(0.5, 5);

    const complete = deriveHomeScrollSnapshot({
      scrollY: 1300,
      viewportHeight: 844,
      stageHeight: 1864,
      dataTop: -176,
      dataHeight: 1020,
      mobile: true,
      reduceMotion: false,
    });
    expect(complete.dataProgress).toBe(1);
    expect(complete.footerEligible).toBe(false);
  });

  it("低动画模式保留可见性门控但跳过中间插值", () => {
    const hidden = deriveHomeScrollSnapshot({
      scrollY: 50,
      viewportHeight: 1000,
      stageHeight: 1000,
      dataTop: 950,
      dataHeight: 1000,
      mobile: false,
      reduceMotion: true,
    });
    const shown = deriveHomeScrollSnapshot({
      scrollY: 100,
      viewportHeight: 1000,
      stageHeight: 1000,
      dataTop: 900,
      dataHeight: 1000,
      mobile: false,
      reduceMotion: true,
    });
    expect(hidden.dataProgress).toBe(0);
    expect(shown.dataProgress).toBe(1);
  });

  it("阶段映射在区间外钳制并在区间内线性变化", () => {
    expect(mapHomeRevealProgress(0.05, 0.1, 0.3)).toBe(0);
    expect(mapHomeRevealProgress(0.2, 0.1, 0.3)).toBeCloseTo(0.5, 5);
    expect(mapHomeRevealProgress(0.5, 0.1, 0.3)).toBe(1);
    expect(mapHomeRevealProgress(0.2, 0.3, 0.3)).toBe(0);
  });
});
