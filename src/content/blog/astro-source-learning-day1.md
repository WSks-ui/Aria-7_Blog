---
"title": "Astro源码学习 Day1:从最小项目开始"
"description": "从examples/minimal入手,理解.astro文件、frontmatter和文件系统路由"
"pubDate": "2026-08-13"
"tags":
  - "Astro"
  - "源码学习"
"keywords":
  - "Astro源码"
  - "frontmatter"
  - "文件系统路由"
  - "岛屿架构"
"cover": "/images/astro-learning/astro-logo.png"
---

## 核心概念

**岛屿架构**
- 默认输出纯HTML,零JavaScript
- 只在需要交互的地方按需注入JS

**三个执行上下文**(读源码的基础)

| 位置 | 何时运行 | NodeAPI |
|------|---------|---------|
| `core/` | build/dev命令 | 能用 |
| `runtime/server/` | 页面渲染 | 禁用 |
| `runtime/client/` | 浏览器 | 禁用 |

**仓库结构**

```
packages/astro/src/
├── core/            构建编排
├── runtime/         渲染层
├── content/         内容集合
├── vite-plugin-*/   核心实现
└── types/           类型定义
```

## .astro文件

两部分:frontmatter(服务器端JS) + HTML模板

```astro
---
const title = '我的页面'
---
<html>
	<head><title>{title}</title></head>
	<body><h1>{title}</h1></body>
</html>
```

- `---`之间的代码在服务器端跑
- `{}`插值把JS表达式的值输出到HTML
- 构建后变成纯HTML,frontmatter代码消失

## 文件系统路由

`src/pages/`目录结构直接映射URL

```
src/pages/index.astro      →  /
src/pages/about.astro      →  /about
src/pages/blog/post.astro  →  /blog/post
```

构建后

```
dist/index.html
dist/about/index.html
dist/blog/post/index.html
```

## 构建流程

```bash
pnpm -C examples/minimal build
```

关键日志

```
[types]   类型生成
[build]   output: "static"
[vite]    Vite打包
generating static routes
  ├─ /about/index.html
  ├─ /index.html
```

产物:`dist/`里只有HTML,没有JS文件

## 日志对应源码

- `[types]` → `content/types-generator.ts`
- `[build]` → `core/build/`
- `generating static routes` → 路由系统

下节课顺着这些线索看build流程
