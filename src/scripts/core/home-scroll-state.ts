export interface HomeScrollMeasurements {
  scrollY: number;
  viewportHeight: number;
  stageHeight: number;
  dataTop: number;
  dataHeight: number;
  mobile: boolean;
  reduceMotion: boolean;
}

export interface HomeScrollSnapshot {
  /** Hero 揭幕进度；桌面以舞台高度、移动端以首屏高度归一化。 */
  progress: number;
  /** 数据层阅读进度；移动端按自然内容进入和离开视口的全过程归一化。 */
  dataProgress: number;
  splitY: number;
  scrollRange: number;
  pastHero: boolean;
  layerEndReached: boolean;
  footerEligible: boolean;
  contentInteractive: boolean;
  mobile: boolean;
}

export const clampUnit = (value: number): number => Math.min(Math.max(value, 0), 1);

export const mapHomeRevealProgress = (progress: number, start: number, end: number): number => {
  if (!Number.isFinite(progress) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return clampUnit((progress - start) / (end - start));
};

/**
 * 所有首页滚动派生状态都从这一份测量快照计算。控制器每帧只负责读取一次几何信息，
 * CSS 变量、body class、导航与 Footer 均消费这里的结果，避免各模块维护相互漂移的阈值。
 */
export const deriveHomeScrollSnapshot = (measurements: HomeScrollMeasurements): HomeScrollSnapshot => {
  const viewportHeight = Math.max(1, measurements.viewportHeight);
  const scrollRange = measurements.mobile
    ? viewportHeight
    : Math.max(1, measurements.stageHeight || viewportHeight);
  const progress = clampUnit(measurements.scrollY / scrollRange);
  const rawDataProgress = measurements.mobile
    // 0 = 数据层顶边刚进入视口底部；1 = 数据层底边抵达视口底部。
    // 这样页面滚到自然底部前即可完整显示 CONNECT/STACK，不依赖额外空白滚动区。
    ? clampUnit((viewportHeight - measurements.dataTop) / Math.max(1, measurements.dataHeight))
    : progress;
  // 低动画模式仍保留内容可见性门控，但跳过中间位移与透明度插值。
  const dataProgress = measurements.reduceMotion
    ? (rawDataProgress >= 0.1 ? 1 : 0)
    : rawDataProgress;

  return {
    progress,
    dataProgress,
    splitY: viewportHeight * (1 - progress),
    scrollRange,
    pastHero: progress > 0.56,
    layerEndReached: !measurements.mobile && measurements.scrollY >= scrollRange - 2,
    footerEligible: !measurements.mobile && measurements.scrollY > scrollRange + 28,
    contentInteractive: dataProgress >= 0.3,
    mobile: measurements.mobile,
  };
};
