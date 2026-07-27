# Cloudflare Pages 部署说明

## 唯一生产部署

新版站点只使用 Cloudflare Pages。生产分支为 `main`，构建命令为 `npm run build`，输出目录为 `dist`，Node.js 版本为 24。

`astro.config.mjs` 默认站点地址固定为 `https://aria7bl0g.pages.dev`。如需在预览环境使用其他公开域名，可显式设置 `SITE_URL`；不要依赖本地默认地址。

## 部署后确认

Cloudflare Pages 需要传入并保留 `CF_PAGES_COMMIT_SHA`。GitHub Actions 会轮询 `/version.json`，直到其中的 `sha` 与本次 `main` 提交一致，再验证首页、文章、搜索索引、RSS、sitemap、安全头和 404。

## 控制台设置

在 Cloudflare 控制台中：

1. 确认 Git 集成仅连接到 Pages 项目，生产分支为 `main`。
2. 关闭该仓库关联的 Workers Builds，避免同一提交产生两套新版部署。
3. 不要配置会将未知路径重写到首页的 SPA 回退规则；Pages 应直接使用构建产物中的 `404.html`。
4. 保留仓库 `public/_headers`，它是生产与本地预览共享的唯一安全头来源。

## 回滚与恢复

若新部署异常，先在 Pages 的部署历史中回滚到上一个已通过生产探针的提交。随后在 GitHub 中修复问题并重新推送 `main`；不要用旧版入口或 Workers 部署掩盖新版故障。
