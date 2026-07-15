# 测试说明

## 命令

- `npm run test:unit`：运行核心纯函数与基础设施单元测试，并检查覆盖率阈值。
- `npm run test:e2e`：自动构建生产站点，再用 Chromium 验证桌面端与移动端流程。
- `npm test`：依次运行单元测试、生产构建和端到端测试。
- `npx playwright test tests/e2e/visual.spec.ts --update-snapshots`：视觉变更确认后更新截图基线。

E2E 默认只允许本机站点请求。Giscus、Meting 及音乐 CDN 由 `tests/e2e/fixtures.ts` 本地响应，其余公网请求会被拦截，避免 CI 依赖第三方可用性。

## 稳定测试契约

- `SafeStorage` 构造函数接收 storage getter；所有读取、写入、删除和 JSON 操作均不得向调用方抛错。
- `isNavItemActive(pathname, href)` 让根路径精确匹配，其他导航项匹配自身和子路由。
- 时间函数统一接收 `Asia/Shanghai` 时区；运行天数按日历日计算且包含起始日。
- `validateMetingPayload(payload, baseUrl, maxTracks)` 仅返回同源或 `https://api.i-meto.com` 的媒体地址。
- `calculateReadingProgress(scrollY, start, scrollHeight, viewportHeight)` 返回闭区间 `[0, 1]`。
