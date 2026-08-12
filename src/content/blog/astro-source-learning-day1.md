---
"title": "Astro 源码学习笔记 Day 1：从一个最小项目开始"
"description": "作为编程新手开始学习 Astro 开源项目源码，第一天从 examples/minimal 入手，理解 .astro 文件结构、frontmatter 语法和文件系统路由的工作原理"
"pubDate": "2026-08-13"
"tags":
  - "Astro"
  - "源码学习"
  - "开源项目"
"keywords":
  - "Astro源码"
  - "frontmatter"
  - "文件系统路由"
  - "静态站点生成"
  - "岛屿架构"
---

## 学习目标

研究 Astro 开源项目源码，目标是理解内部机制并能提交 PR。从最小示例入手，理解基础概念。

## Astro 核心概念

**岛屿架构（Islands Architecture）**：
- 默认输出纯 HTML，零 JavaScript
- 只在需要交互的地方按需注入 JS
- 首屏速度快，不需要等待 JS 下载和执行

**三个执行上下文**（理解这个是读源码的基础）：

| 位置 | 何时运行 | 能否用 Node API |
|------|---------|----------------|
| `packages/astro/src/core/` | `astro build`/`dev` 命令 | ✅ |
| `packages/astro/src/runtime/server/` | 页面渲染(Vite SSR) | ❌ |
| `packages/astro/src/runtime/client/` | 浏览器 | ❌ |

**仓库结构**：

```
packages/astro/src/
├── core/               # 构建和开发服务器编排
├── runtime/            # 渲染层（server SSR + client 浏览器）
├── content/            # 内容集合系统
├── vite-plugin-*/      # Vite 插件（Astro 的核心实现）
├── virtual-modules/    # 虚拟模块
└── types/              # 类型定义

packages/integrations/  # react、vue、cloudflare 等官方集成
examples/               # 示例项目（学习入口）
```

## .astro 文件结构

**基本语法**：

```astro
---
// Frontmatter：服务器端 JavaScript
const title = '我的第一个Astro页面';
---

<!-- HTML 模板：标准 HTML + 插值语法 -->
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>{title}</title>
		<meta name="generator" content={Astro.generator} />
	</head>
	<body>
		<h1>{title}</h1>
	</body>
</html>
```

**两个部分**：

1. **Frontmatter（`---` 之间）**
   - JavaScript 代码，在服务器端执行
   - 用于准备数据、引入组件、查询内容
   - 初始文件可能是空的（`---\n\n---`），需要时再填充

2. **HTML 模板**
   - 标准 HTML
   - `{}` 插值语法：输出 JS 表达式的值
   - `Astro` 全局对象提供运行时信息

**执行流程**：
```
Frontmatter (服务器端 JS) → 插值替换 ({}) → 输出纯 HTML
```

## 文件系统路由

**核心规则**：`src/pages/` 的目录结构直接映射 URL

| 文件路径 | URL | 构建产物 |
|---------|-----|---------|
| `src/pages/index.astro` | `/` | `dist/index.html` |
| `src/pages/about.astro` | `/about` | `dist/about/index.html` |
| `src/pages/team/about.astro` | `/team/about` | `dist/team/about/index.html` |

**示例**：创建 `src/pages/about.astro`

```astro
---
const pageTitle = '关于我们';
---

<html lang="zh-CN">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width" />
		<title>{pageTitle}</title>
	</head>
	<body>
		<h1>{pageTitle}</h1>
		<p>这是关于页面。</p>
	</body>
</html>
```

运行 `pnpm build` 后，`dist/` 目录结构：
```
dist/
├── about/
│   └── index.html    # /about 路由
└── index.html        # / 首页
```

无需路由配置文件，文件夹和文件名即路由。

## 构建流程观察

在 `examples/minimal` 执行 `pnpm build`：

```bash
cd examples/minimal
pnpm build
```

**关键日志**：
```
[types]   Generated 209ms        # 类型生成系统
[build]   output: "static"       # 静态输出模式
[vite]    ✓ built in 185ms       # Vite 打包
generating static routes         # 路由静态化
  ├─ /about/index.html
  ├─ /index.html
2 page(s) built in 479ms
```

**产物验证**：
- `dist/` 输出纯 HTML 文件
- **0 个 JS 文件**（默认零 JavaScript）
- 查看 `dist/index.html`，所有 `{}` 插值已被替换成最终值

浏览器只收到静态 HTML，看不到 frontmatter 里的变量和逻辑。

## 开发与构建

| 命令 | 用途 | 特点 |
|------|------|------|
| `pnpm dev` | 开发服务器 | HMR 热更新，改代码自动刷新 |
| `pnpm build` | 生产构建 | 输出到 `dist/`，用于部署 |
| `pnpm preview` | 预览构建产物 | 本地预览 `dist/` 内容 |

> **注意**：改代码后需要重新构建才能看到 `dist/` 的变化。开发时用 `dev` 模式，构建用 `build`。

## 知识清单

- `.astro` 文件 = Frontmatter(服务器端 JS) + HTML 模板
- `{}` 花括号插值：在 HTML 中输出 JS 表达式
- 文件系统即路由：`src/pages/` 结构直接映射 URL
- 默认零 JS：构建产物是纯 HTML，无需下载 JavaScript
- 三个执行上下文：core(Node.js) / runtime-server(Vite SSR) / runtime-client(浏览器)

## 源码线索

构建日志里的关键词对应源码位置：

- `[types]` → `packages/astro/src/content/types-generator.ts`
- `[build]` / `[vite]` → `packages/astro/src/core/build/`
- `generating static routes` → 路由系统

下一步将顺着这些线索进入源码，理解一次构建的完整流程。
