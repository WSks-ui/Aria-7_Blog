# Aria-7th Lab 架构说明

## 分层

- `src/pages`：Astro 路由与静态端点。
- `src/layouts`、`src/components`：页面外壳、SEO、Dock 与可复用视觉组件。
- `src/content/blog`：文章源文件；构建期由 `SiteCatalog` 汇总公开文章、标签、分类、搜索索引和文章关系。
- `src/scripts/core`：无状态或可测试的浏览器基础能力。
- `src/scripts/features`：按功能划分的交互控制器。Dock 和播放器属于应用级单例，其余页面功能由 `PageScope` 管理。

## 生命周期

`BaseLayout` 启动 `bootstrap`。它只初始化一次持久 Dock；每次 Astro ClientRouter 切页则新建并销毁一个 `PageScope`。因此页面级监听器不会在切页后累积，而音乐、进度和正在播放状态会留在 `transition:persist` 的 Dock 节点中。

## 内容与外部服务

`SiteCatalog` 的公开条件为 `draft !== true && pubDate <= buildTime`。搜索索引保持 JSON 接口兼容，标签结果指向标签归档页。Giscus 保持连接到旧仓库 `WSks-ui/aria7-blog`，以保留历史 Discussions。

归档页热力图的数据源与刷新链路遵循「构建不依赖实时网络」原则：

- `src/data/github-contributions.json` 是唯一构建输入（仓库内快照，约 12KB），由 `scripts/fetch-github-contributions.mjs` 生成，降级链为 GraphQL（`GITHUB_TOKEN`/`CONTRIBUTIONS_PAT`）→ 免 token HTML 端点 → 保留既有快照；任何失败以退出码 0 结束，绝不中断构建。
- 本地抓取尊重 `HTTPS_PROXY`（undici `EnvHttpProxyAgent`）；每日自动刷新由 `.github/workflows/update-contributions.yml` 在 GitHub 托管运行器完成（境外网络，无需代理），仅快照有 diff 才由 bot 提交。
- 组件 `ContributionsHeatmap.astro` 纯 SSR 输出零运行时请求，颜色只走 `[data-level]` 选择器以满足 CSP `style-src-attr 'none'`；写作模式数据来自 `SiteCatalog` 恒可得，快照缺失时代码模式整体隐藏、快照损坏时构建期直接报错。
- 视觉回归基线遮蔽热力图区域：格子随每日快照变化属数据更新而非布局回归。

## 安全边界

`public/_headers` 是唯一的生产安全头来源，本地 E2E 预览服务器读取同一文件。Meting 媒体仅允许当前站点和 `https://api.i-meto.com` 的 HTTPS 地址；请求、歌词和媒体加载均使用 AbortController 与代次检查。
