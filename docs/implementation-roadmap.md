# Aria-7th Lab 分阶段实施清单

> 来源：2026-07-28 三轮分析的合并产物——首页性能诊断、fqzlr.com（Firefly v6.6.13）竞品借鉴、GitHub 热力图需求。  
> 使用方式：每阶段独立完成、独立验证、独立上线；任务前的 `[ ]` 完成后改为 `[x]`。除阶段 2 外均无外部网络依赖。

## 阶段总览

| 阶段              | 目标一句话                 | 网络依赖          | 预计影响面                                          |
| --------------- | --------------------- | ------------- | ---------------------------------------------- |
| 0 性能止血          | 不改设计消除 70%+ 卡顿        | 无             | home.css / custom-cursor.css / interactions.ts |
| 1 首页结构重构        | 首屏 3 秒可读，立绘做主角        | 无（字体下载除外）     | index.astro / home.css / interactions.ts       |
| 2 归档热力图 + 内容元信息 | GitHub 贡献可视化，弱网可降级    | **有（GitHub）** | scripts/ + src/data/ + 归档页                     |
| 3 主题系统 + 搜索升级   | 暗色模式无闪烁，Pagefind 全文搜索 | 无             | global.css / BaseLayout / 命令面板                 |
| 4 运营与增长         | 统计、收录、内容生产闭环          | 有（可后置）        | 配置 / CI / 新页面                                  |

阶段 0 → 1 顺序固定（先止血再动结构）；2/3/4 可并行，建议 2 先行（本清单重点）。

---

## 阶段 0 · 性能止血（P0，零设计改动）✅ 已完成（2026-07-28）

**目标**：消除标签云屏的掉帧与延迟；Lighthouse INP < 200ms；滚动与标签动画期间无 >50ms 长任务。

- [x] 0.1 用 sharp 将滤镜烘进 `home-bg` 系列源图（`scripts/bake-image-filters.mjs`，webp 109→99KB / avif 67→64KB / mobile 35→37KB），删除 `home.css` 的 `filter` 并留禁止回退注释
- [x] 0.2 删除 `.personal-tags::before` 的 `blur(8px)`，保留静态渐变并留注释
- [x] 0.3 删除光标 orbit 的 `backdrop-filter`，底色 alpha 0.18→0.34 补偿观感
- [x] 0.4 物理引擎 bounds 移出 `step()`，`physicsBoundsWidth/Height` 缓存于 setup/resize
- [x] 0.5 光斑改为 `.home-next__spot` 小圆片（≤420px，`transform` 跟随，仅合成不重绘），删除 `--feed-spot-x/y` 全屏渐变重绘
- [x] 0.6 `.home-next__intro` 系规则系无标记死 CSS（含 `blur(16px)`），整块移除
- [x] 0.7 `debug.log` 确认不存在（此前已清理）
- [x] 0.8 `will-change: transform` 改为 `.is-physics:not(.is-settled)` 期间挂载
- [x] 0.9 顺手修复：`SeoHead.astro` 补 `<meta name="description">`（Lighthouse SEO 0.92→1.0 的前置缺陷，全站页面受益）

**验证结果（全绿）**：

1. `astro check` 87 文件 0 错误；`vitest` 85/85 通过，覆盖率 93.7%（门禁 85）
2. `astro build` 30 页成功；`check:performance` 通过（页面初始 JS 7.2KiB/25KiB，Blog 首屏 51KiB/220KiB）
3. e2e 全量 55 过 0 败（14 跳过为设计跳过）；视觉基线更新 3 张（blog desktop/mobile、article mobile——确认为 7/22–7/27 内容变更与时间漂移的合法更新，diff 已人工核对）
4. Lighthouse（Edge 通道）：三页三轮 perf 0.99 / a11y 1.0 / bp 1.0 / seo 1.0，0 断言失败。注意：本机仅装 Playwright headless shell 时 `run-lighthouse.mjs` 找不到 Chrome，需 `CHROME_PATH` 指向 Edge 或完整 Chromium；CI（安装完整 chromium）不受影响
5. 待用户手测：真实鼠标快速滑动 + 滚动揭示 + 标签物理动画的主观流畅度

---

## 阶段 1 · 首页结构重构（按已确认线框）✅ 已完成（2026-07-28）

**目标**：访客 3 秒内获得「这是谁、写什么、去哪看」；立绘右侧 40% 无 UI 遮挡；标签从 10 个漂浮糖果收束为单排 dock。

- [x] 1.1 `index.astro` 第二屏重排为 `.feed-content` 内容带：eyebrow → ZCOOL 标题 → 一句话定位 → 双 CTA；右侧立绘安全区无 UI
- [x] 1.2 标签 dock：6 个统一白透胶囊 + 「+N」深色虚线折叠入口指向 `/blog/`；移动端转横向滚动条
- [x] 1.3 删除标签物理引擎（约 300 行）+ 631 行注释死代码 + 无标记的 click-counter；`PhysicsBody/Target` 接口与 `--feed-pointer` 变量同步清理。`interactions.ts` 2531→1593 行
- [x] 1.4 自托管 ZCOOL KuaiLe（站酷快乐体，可商用）latin 子集 woff2（5.3KB，`public/fonts/`），`--cute-font` 变量统一切换，首页条件预加载；hero-title 字重 900→400（单字重字体防仿粗体吃掉填充）
- [x] 1.5 单层静态 scrim（`.feed-content::before` linear-gradient），移动端改底部渐变；全程零 blur/backdrop-filter
- [x] 1.6 副标题提至 clamp(0.95rem, 1.35vw, 1.1rem)、行高 1.9、text-shadow 保证对比
- [x] 1.7 核对：导航过 hero 后自动折叠为圆点（既有行为），无遮挡，无需改动
- [x] 1.8 入场 stagger 五段 × 480ms（末段 720ms 收尾），reduced-motion 直接呈现终态
- [x] 1.9 顺手修复测试套件 19 个前置失败：①helpers/app-shell 导航选择器兼容尾斜杠（新增 `navLinkSelector`）②`inlineStylesheets: "never"` 修复 404 页内联样式 CSP 违规 ③deploy 用例豁免主文档 404 的预期 console.error

**验证结果（全绿）**：

1. `astro check` 0 错误；`vitest` 85/85（覆盖率 93.7%）；`build` 30 页；`check:performance`、`check:links` 通过
2. **e2e 全量 74 过 0 败**（首次真正全绿；耗时 3.4m→1.1m，因 19 个 30s 超时消除）；视觉基线 12/12 通过
3. Lighthouse（Edge）：home 0.99 / blog 0.98 / article 0.99，a11y/bp/seo 全 1.0
4. 人工截图核对：桌面/移动双视口的 hero 与第二屏渲染符合线框设计（标题实心白字、立绘无遮挡、dock 整齐、+N 折叠正常）
5. 注：阶段 0 报告的「e2e 55 过 0 败」系误读输出（实际同样有这 19 个前置失败），特此更正

---

## 阶段 2 · 归档热力图（GitHub 数据源）+ 内容元信息

**目标**：归档页展示基于 `github.com/WSks-ui` 过去一年贡献数据的热力图；任何网络状况下构建不失败、页面不破版。

> 📎 **详细设计以 [contributions-heatmap-plan.md](contributions-heatmap-plan.md) 为准**——该文档包含完整的数据契约（JSON schema）、CSP 约束（`style-src-attr 'none'` 禁止内联样式）、代理实测表、风险回退矩阵与 Definition of Done。本节只保留主任务与里程碑。

### 网络实测摘要（2026-07-28，两次独立测试）

| 场景                | 结果                                                   | 结论                 |
| ----------------- | ---------------------------------------------------- | ------------------ |
| 本机无代理             | github.com / api.github.com 可达但不稳，contributions 端点超时 | 直连不可靠              |
| 本机走代理（Clash 7890） | 三端点全部 200（<1.1s），contributions 有 367 格数据             | 本地刷新需代理            |
| GitHub Actions    | 境外基础设施天然可达                                           | **定时刷新放 CI，构建零网络** |

**核心架构（快照提交制）**：Actions 每日 cron → GraphQL `contributionsCollection` → 提交 `src/data/github-contributions.json` → 构建只读本地 JSON。失败降级链：GraphQL → HTML 端点解析 → 已提交快照 → 博客发文活动热力图（`SiteCatalog` 恒可得）。

- [x] 2.1 新建 `scripts/fetch-github-contributions.mjs`（GraphQL 主路径、HTML 端点降级、undici `EnvHttpProxyAgent` 代理支持、10s 超时、响应校验、失败退出码 0）。注：当前 HTML 端点免 token 可用，PAT 仅在线上需要计入私有贡献时再配置（workflow 已预留 `CONTRIBUTIONS_PAT` secret 位）
- [x] 2.2 生成初始快照 `src/data/github-contributions.json`（367 天 / 645 次贡献，来源 github-html）；新增 `npm run fetch:contributions`
- [x] 2.3 新建 `.github/workflows/update-contributions.yml`：每日 cron + `workflow_dispatch`，仅 diff 时 bot 提交（防 CI 循环），Action 全 pin SHA
- [x] 2.4 `src/utils/contributionHeatmap.ts` 纯函数（周对齐、月份标签、level 阈值映射 `0/1-3/4-6/7-9/≥10`）+ 单测
- [x] 2.5 `src/components/ContributionsHeatmap.astro`：53×7 CSS Grid、纯 SSR 零 JS、`data-level` 选择器配色（**禁内联样式**，CSP `style-src-attr 'none'`）、`title` 属性 tooltip、图例与总数摘要
- [x] 2.6 嵌入 `/blog/` 主栏（筛选区与文章列表之间；53 列宽度需求不适合侧栏与 `ArchivePage.astro`）；快照 >7 天显示「数据截至 X」角标
- [x] 2.7（可选增强）写作/代码双模式切换：`?heatmap=code|writing` + `safe-storage` 记忆，对标 fqzlr.com 写作热力
- [ ] 2.8 文章页头补充字数与阅读时长（`postMetrics` 已算好，仅展示）
- [ ] 2.9 为一组关联文章启用 `series`/`seriesOrder` 字段，验证系列导航渲染

**实施记录（2026-07-28）**：

1. 单测 107/107，覆盖率 93.53%（门禁 85/85/85/75）；新增 `github-contributions.test.ts`（12 例）与 `contribution-heatmap.test.ts`（10 例）
2. 抓取修复：GitHub contributions HTML 为「星期行 × 周列」DOM（先 53 个周日再 53 个周一），文档序 ≠ 时间序，解析后必须按日期排序——已加回归 fixture
3. 移动端修复：网格项 `min-width:auto` 导致热力图 section 被 53 列 min-content 撑到 798px、切换按钮越出视口——`.contribution-heatmap { min-width: 0 }` 修复（e2e 真实点击暴露）
4. 无障碍修复：横滚容器补 `tabindex="0" role="region"`（axe scrollable-region-focusable）
5. 视觉基线遮蔽热力图区域（数据每日刷新，非布局回归）；e2e 全量 80 过 0 败；Lighthouse 三页 perf 0.99、a11y/bp/seo 全 1.0
6. 待办：Actions 首次运行验证（推送后 `workflow_dispatch` 手动触发）、2.8/2.9 内容元信息

**验证方式**：

1. 单测覆盖变换函数与 HTML 解析 fixtures，覆盖率门禁（85/85/85/75）不破 ✅
2. **断网演练**：关代理 `npm run build` 用快照正常出图；删除 JSON 降级为发文活动图而非报错；JSON 改坏则构建报可读错误（import 处 schema 校验）✅（快照缺失降级写作模式已验证；损坏报错路径在组件中实现）
3. `workflow_dispatch` 手动触发 → 出现快照提交；同日再触发幂等无提交；token 置空演练 workflow 绿且快照不变（待推送后执行）
4. e2e + 视觉基线（归档页 desktop/mobile）；140% 文本缩放不破版；axe 无新违规 ✅
5. DoD 以 contributions-heatmap-plan.md 第 6 节为准

---

## 阶段 3 · 主题系统 + 搜索升级

**目标**：亮/暗/跟随系统三模式无闪烁切换；Pagefind 静态全文搜索替换自研搜索索引。

- [ ] 3.1 全站颜色从写死 pastel 重构为 `--hue` 单变量驱动的双主题 CSS 变量体系（global.css 逐域改造：背景/文字/边框/主色）
- [ ] 3.2 `<head>` 最前加入防闪烁内联 IIFE：渲染前应用 theme/hue，细节借鉴 Firefly（先立即算、rAF 校准、banner 类尺寸按 4px 取整防发虚）
- [ ] 3.3 设置面板（Dock 或侧栏入口）：三模式切换 + 360° 色相滑块，持久化 localStorage
- [ ] 3.4 集成 Pagefind：`astro build` 后生成索引，命令面板改为调用 `pagefind.search()`，`excerptLength: 20`；删除 `search-index.json` 端点与 `utils/searchIndex.ts`（或保留为无 JS 兜底）
- [ ] 3.5 CSP 兼容性改造：Pagefind 的 wasm 需要在 `public/_headers` 的 `script-src` 增加 `'wasm-unsafe-eval'`，评估后修改并更新 `docs/` 安全说明
- [ ] 3.6 代码高亮暗色主题联动（Prism 双主题或迁移 Expressive Code）

**验证方式**：

1. e2e 新增暗色用例：切换前后截图无白闪（FOUC），localStorage 持久化生效
2. 视觉回归新增 home/blog/article 三页暗色基线（desktop+mobile）
3. 搜索 e2e：中文关键词命中正文摘要、无结果态、Esc 关闭
4. `check:links` 确认 `search-index.json` 无残留引用；Lighthouse 暗色下对比度抽测

---

## 阶段 4 · 运营与增长（可后置，弱网络依赖）

**目标**：访问统计与搜索引擎收录闭环；内容生产效率工具链。

- [ ] 4.1 部署 Umami（Vercel 免费额度 + 子域名），全站注入 script，首页/归档增加「站点访问」数据带
- [ ] 4.2 `SeoHead.astro` 增加百度/必应/Google 三平台站长验证 meta，各平台提交 sitemap
- [ ] 4.3 友链页 + 自助申请入口 + GitHub Actions 友链存活检测（借鉴 fqzlr.com 的 check-flink 方案）
- [ ] 4.4 动态/说说轻内容页（本地 Markdown 集合即可，无需 Memos 后端）
- [ ] 4.5 `npm run new-post` 脚手架：模板生成 + 中文标题转 slug，产物直接通过 Zod 校验

**验证方式**：

1. Umami 后台实时访客可见；CSP `script-src`/`connect-src` 白名单更新后 e2e 无控制台报错
2. 三平台 `site:aria7bl0g.pages.dev` 陆续收录（周期 1–4 周，人工复查）
3. 友链 CI 定时报告可投递（Actions 摘要或 Issue）
4. 脚手架生成的草稿 `npm run build` 通过

---

## 网络不确定性总策略（贯穿所有阶段）

1. **构建永不联网**：任何外部数据一律「CI 定时抓取 + 快照提交仓库」，`astro build` 只读本地文件。GitHub 被墙只影响数据新鲜度，不影响站点可用性。
2. **抓取脚本三原则**：尊重 `HTTPS_PROXY`；失败保留旧快照；退出码恒 0（只告警）。
3. **所有外部依赖有降级态**：热力图 → 发文活动图；Umami → 隐藏数据带；评论/统计脚本加载失败不影响正文（现有 IntersectionObserver 懒加载模式沿用）。
4. **敏感凭据零入库**：PAT 仅存 `.env`（已 gitignore）与 GitHub Secrets；文档与代码中不留样例真值。
