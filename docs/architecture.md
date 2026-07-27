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

## 安全边界

`public/_headers` 是唯一的生产安全头来源，本地 E2E 预览服务器读取同一文件。Meting 媒体仅允许当前站点和 `https://api.i-meto.com` 的 HTTPS 地址；请求、歌词和媒体加载均使用 AbortController 与代次检查。
