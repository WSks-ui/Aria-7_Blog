# 性能预算与 Lighthouse 门禁

本项目将性能检查拆为两个层次：构建产物预算用于快速阻断明显的资源膨胀，Lighthouse 用于在移动端模拟条件下检查真实体验指标。

## 构建产物预算

先生成生产构建，再执行：

```powershell
npm run build
node scripts/check-performance-budgets.mjs
```

检查脚本会读取 `dist/` 中最终生成的 HTML、CSS、JavaScript 与首屏关键图片，而不是源文件大小。

| 预算 | 阈值 | 统计方式 |
| --- | ---: | --- |
| 每个非 Game 页面初始 JavaScript | ≤ 25 KiB Brotli | HTML 入口脚本、`modulepreload` 与递归静态 ESM 依赖 |
| Blog 移动端首屏传输 | ≤ 220 KiB | HTML/CSS/JS 使用 Brotli，首屏关键图片使用实际文件大小 |

Blog 的第一张可见封面必须标记 `data-performance-critical`，并使用 `loading="eager"` 与 `fetchpriority="high"`。脚本只统计这个明确的关键图片，避免将延迟加载的历史封面、按需音频、Meting 和 Giscus 误算进首屏。

运行时音频、Meting 播放列表、歌词与 Giscus 仍被刻意排除：它们不是首屏自动请求，也应由各自的端到端测试覆盖。若未来让它们在首屏自动加载，必须相应修改预算脚本和基线。

## Lighthouse CI

`.lighthouserc.cjs` 固定使用 Pixel 7 接近的 `390 × 844` 移动视口，检查首页、Blog 和一篇带封面的文章。依赖锁定后执行：

```powershell
npm run test:lighthouse
```

此命令复用 Playwright 安装的 Chromium；首次在本机运行前执行 `npx playwright install chromium`。若团队环境已有受控浏览器，也可通过 `CHROME_PATH` 显式指定其可执行文件。

门禁如下：

| 指标 | 阈值 |
| --- | ---: |
| Performance | ≥ 85 |
| Accessibility / Best Practices / SEO | ≥ 95 |
| LCP | ≤ 2.5 s |
| CLS | ≤ 0.05 |
| TBT | ≤ 300 ms |

报告默认写入 `.lighthouseci/`，该目录是本地诊断产物，不应提交。

## 图片接入边界

文章 Markdown 当前直接使用稳定的 `/assets/images/posts/...` 路径，这些链接也可能被外部引用。图片优化迁移先保留这些公开 URL，并仅让 Blog 卡片、文章封面和首页媒体通过 Astro 原生图片管线生成响应式 AVIF/WebP；Markdown 正文将在链接兼容策略和完整视觉回归就绪后单独迁移。
