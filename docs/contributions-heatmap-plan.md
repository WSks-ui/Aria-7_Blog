# 归档热力图实施清单（GitHub 贡献数据源）

> 目标：在归档页加入 GitHub 风格贡献热力图，数据源为 <https://github.com/WSks-ui>。
> 核心原则：**构建不依赖实时网络**——任何环境下 `npm run build` 都必须成功。

## 0. 网络环境实测结论（2026-07-28）

| 环境 | 结论 | 含义 |
|---|---|---|
| 本机（无代理变量） | 不可达 GitHub | 本地直连会失败 |
| 本机（`HTTPS_PROXY=http://127.0.0.1:7890/`） | api.github.com 200 / 0.67s；github.com 200 / 1.07s；contributions 端点 200 / 0.80s | 本地脚本必须支持代理 |
| HTML 端点数据量 | 367 个 `data-date` 单元格（约一年） | 免 token 备选源成立 |
| REST 用户信息 | `WSks-ui` 存在，12 个公开仓库 | 账号校验通过 |
| GitHub Actions / Cloudflare Pages | 境外网络，天然可达 | **定时刷新放在 Actions，构建机无需代理** |

**架构结论**：数据以「仓库内快照 JSON」为唯一构建输入。刷新快照是独立异步动作（Actions 定时 / 本地手动），与构建解耦。

## 1. 数据源决策（优先级降序）

1. **GraphQL `contributionsCollection`**（主选）：结构稳定、官方 API。`GITHUB_TOKEN` 可读公开贡献；若需计入私有仓库贡献，用 `read:user` 权限的 PAT 存为仓库 secret `CONTRIBUTIONS_PAT`。
2. **HTML 端点 `/users/WSks-ui/contributions`**（备选）：免 token，按单元格 `data-date`/`data-level` 解析。页面结构属未公开契约，可能变化——只作降级路径。
3. **仓库内快照**（兜底）：`src/data/github-contributions.json`，随仓库分发，永远可用。

任一路径失败 → 保留现有快照，脚本以退出码 0 + warning 结束，**绝不中断构建或 CI**。

## 2. 数据契约

```json
{
  "generatedAt": "2026-07-28T02:00:00.000Z",
  "source": "github-graphql",
  "login": "WSks-ui",
  "total": 0,
  "range": { "from": "2025-07-28", "to": "2026-07-28" },
  "days": [{ "date": "2025-07-28", "count": 0, "level": 0 }]
}
```

- `level` 用固定阈值（可测试、SSR 确定）：`0 / 1-3 / 4-6 / 7-9 / ≥10` 映射到 0-4。
- 体积约 371 天 × 30B ≈ 12KB，直接 import 进构建，无运行时请求。

## 3. CSP 约束（来自 `public/_headers`，设计前必读）

- `style-src-attr 'none'` → 单元格颜色**禁止 inline style**，用 `.heat-cell[data-level="2"]` 或修饰类选择器。
- `script-src 'self'` → 交互 JS 只能走 `src/scripts/`（PageScope 管理），禁止内联脚本。
- 热力图主体为纯 SSR 输出，默认零 JS；tooltip 用 `title` 属性或纯 CSS。

## 4. 阶段清单

### 阶段 0 · 数据源可行性验证（已基本完成）

- **目标**：确认三条数据路径在当前网络下的可用性。
- **已完成**：本文档第 0 节实测（三端点经代理 200、HTML 端点 367 格、REST 用户校验）。
- **剩余项**：GraphQL 带 token 查询——推迟到阶段 2 在 Actions 环境验证（那里才是它的真实运行环境）。
- **验证方式**：本节省实测表格 + 阶段 2 的 Actions 运行日志。

### 阶段 1 · 数据快照管道

- **目标**：一条命令刷新 `src/data/github-contributions.json`；任何网络异常都不破坏已有快照。
- **产出**：
  - `scripts/fetch-github-contributions.mjs`：GraphQL 主路径 → HTML 端点降级 → 快照兜底；检测到 `HTTPS_PROXY/HTTP_PROXY` 时用 undici `EnvHttpProxyAgent` 注册全局 dispatcher（Node 24 的 fetch 不自动走代理）；`AbortController` 10s 超时；响应校验（天数 360-380、日期格式、level 0-4）不通过则视为失败。
  - `src/data/github-contributions.json`：初始快照（本机经代理生成）。
  - `tests/unit/github-contributions.test.ts`：HTML 解析、level 阈值映射、降级链、异常输入。
  - `package.json` 增加 `"fetch:contributions": "node scripts/fetch-github-contributions.mjs"`。
- **验证方式**：
  1. `npm run test:unit` 通过且覆盖率不跌破门禁（85/85/85/75）。
  2. 开代理运行 `npm run fetch:contributions` → JSON 更新、`generatedAt` 刷新。
  3. 关代理运行 → 输出 warning、JSON 保持原样、退出码 0。
  4. 把 JSON 故意改坏再构建 → `npm run build` 失败并给出可读报错（schema 校验在 import 处做）。

### 阶段 2 · 定时更新自动化（GitHub Actions）

- **目标**：无需本地网络，每日自动刷新快照并回写仓库。
- **产出**：`.github/workflows/update-contributions.yml`
  - 触发：`schedule: cron "17 0 * * *"`（UTC 每日）+ `workflow_dispatch`（手动）。
  - `permissions: contents: write`；Action 全部 pin SHA（与 ci.yml 一致）。
  - 环境变量 `GITHUB_TOKEN`（自动注入）先试公开贡献；若数值明显少于个人主页（私有贡献缺失），再配置 secret `CONTRIBUTIONS_PAT`。
  - 仅当 JSON 有 diff 才 `git commit && push`（bot 身份），避免空提交触发 CI 循环。
- **验证方式**：
  1. `workflow_dispatch` 手动触发 → 仓库出现 `chore: update contributions snapshot` 提交。
  2. 同日再次触发 → 无新提交（幂等）。
  3. 演练：临时把 token 置空 → workflow 绿、无提交、快照不变（验证降级）。
  4. 验证 push 触发的 CI（ci.yml concurrency 会取消重复运行）全绿。

### 阶段 3 · 热力图组件（SSR）与归档页集成

- **目标**：归档页顶部出现一年热力图，零运行时 JS、暗亮色均可读（当前站为亮色，预留 CSS 变量）。
- **产出**：
  - `src/components/ContributionsHeatmap.astro`：53 周 × 7 天 CSS Grid；月份标签按每周首日计算；图例「少 → 多」五色；每格 `data-level` + `title="M月D日 · N 次贡献"`；总数与年份区间摘要。
  - 纯函数抽到 `src/utils/contributionHeatmap.ts`（周对齐、月份标签定位、level 映射），单测覆盖。
  - 样式追加到 `src/styles/blog.css`（归档页作用域），颜色用站点既有 pastel 变量，禁止写死。
  - `ArchivePage.astro` 顶部引入组件。
- **验证方式**：
  1. `npm run check` 0 错误。
  2. 单测：首周对齐真实星期、跨年月份标签不重叠、level 边界值。
  3. `npm run test:e2e` 更新视觉基线（desktop/mobile 各一张归档页快照）。
  4. 手测：140% 文本缩放下格子不破版；键盘 Tab 到格子可读 `title`。

### 阶段 4 · 双模式切换（写作 / 代码，可选增强）

- **目标**：同一热力图支持「博客写作热力」（来自 `SiteCatalog` 按日文章数）与「GitHub 贡献热力」切换——对标 fqzlr.com 写作热力，同时保留代码维度。
- **产出**：切换按钮（`aria-pressed`）、`?heatmap=code|writing` URL 参数、`safe-storage` 记忆选择；切换逻辑挂入 `PageScope`。
- **验证方式**：
  1. e2e：点击切换 → 格子数据与 URL 同步变化；刷新后记忆生效。
  2. a11y spec（axe）无新违规。

### 阶段 5 · 质量门禁与文档收尾

- **目标**：全链路门禁通过，文档与实现一致。
- **产出**：
  - `scripts/check-performance-budgets.mjs` 预算核对（新增 JSON+HTML 约 15KB，必要时上调归档页阈值并注释原因）。
  - `docs/architecture.md` 补「内容与外部服务」一节：快照数据源、刷新链路、降级原则。
  - `README.md` Maintenance 列表链接本文档。
- **验证方式**：完整 CI 绿（audit → check → unit → build → links → performance → lighthouse → e2e）。

## 5. 风险与回退

| 风险 | 影响 | 回退 |
|---|---|---|
| HTML 端点结构变更 | 仅阶段 1 备选路径失效 | 主路径 GraphQL 不受影响；解析器有 fixtures 单测，变更即红灯 |
| PAT 过期 / 被撤销 | Actions 刷新失败 | 快照保留，构建与线上无感；workflow 日志可查到 warning |
| 本机代理端口变更 | 本地手动刷新失败 | 脚本读标准环境变量，改变量即可；文档注明 Clash 默认 7890 |
| 贡献数据极低导致热力图全灰 | 视觉无信息量 | 阶段 4 的写作模式兜底展示；或组件在 total=0 时显示引导文案 |
| 隐私顾虑 | 仅取每日公开计数 | 不抓仓库名/issue 内容；JSON 可人工审计 |

## 6. Definition of Done

- [ ] 关代理 + 删缓存环境下 `npm ci && npm run build` 成功（快照自包含）
- [ ] Actions 每日快照提交稳定运行一周
- [ ] 归档页热力图双视口视觉基线入库
- [ ] 单测覆盖率门禁不下降，CI 全绿
- [ ] `docs/architecture.md` 已同步数据流说明
