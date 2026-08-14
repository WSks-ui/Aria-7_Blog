---
“title”: “Astro源码学习 Day2:build流程与hook机制”
“description”: “梳理astro build执行链路,理解core与integration分工,搞清Vite/SSR/岛屿架构/hydrate这些概念”
“pubDate”: “2026-08-13”
“tags”:
  - “Astro”
  - “源码学习”
“keywords”:
  - “Astro构建”
  - “hook”
  - “Vite”
  - “SSR”
  - “hydrate”
“category”: “技术”
“cover”: “/images/astro-learning/astro-logo.png”
---

## build主流程

顺着`pnpm build`日志找到源码入口

**CLI入口** → `packages/astro/src/cli/build/index.ts`  
**核心构建** → `packages/astro/src/core/build/index.ts`

核心是`AstroBuilder`类

```
pnpm build
  ↓
读配置
  ↓
AstroBuilder.run()
  ├─ setup()  准备阶段
  └─ build()  构建阶段
```

`run()`统一入口,先setup再build,顺序固定

## 日志对应源码

| 日志 | 位置 |
|------|------|
| `[types]` | `core/sync/index.ts` |
| `[build]` | `core/build/index.ts` |
| `[vite]` | Vite自己输出 |
| `generating static routes` | `core/build/generate.ts` |

注意:`[vite]`不是Astro打的,是Vite自己的日志,说明Astro建立在Vite之上

## core vs integration

**core/build/index.ts**:Astro核心,负责调度整个构建流程  
**integrations/sitemap/index.ts**:插件,监听hook在合适时机执行自己的逻辑

类比:core是总指挥,integration是外挂功能

sitemap插件的作用:构建完成后收集所有页面URL生成网站地图给搜索引擎用

## hook机制

本质:事件通知

插件在返回对象里声明想监听哪些时刻

```ts
return {
  name: '@astrojs/sitemap',
  hooks: {
    'astro:routes:resolved': (...) => {},
    'astro:build:done': (...) => {},
  }
}
```

核心代码在合适时机遍历所有integration调用对应hook

源码:`packages/astro/src/integrations/hooks.ts`

## 几个容易混淆的概念

**Vite**:前端构建工具,Astro底下的施工队,负责dev server和模块打包

**SSR**:Server-Side Rendering服务端渲染,回答”HTML在哪里生成”

**岛屿架构**:回答”JS加载到多细的粒度”,只给需要交互的局部组件加载JS

**hydrate**:给已有HTML接上交互能力,让静态按钮变成可点击的按钮

这些不冲突,可以组合使用:
- 静态生成+岛屿架构
- SSR+岛屿架构

## 岛屿的直观理解

页面里大部分是静态HTML(海洋),少数交互组件(评论框/搜索框/点赞按钮)是岛屿

岛屿在浏览器里hydrate后才能交互

## 执行链路

```
Astro组织页面和构建流程
  ↓
Vite负责开发和打包
  ↓
页面可以是静态生成或SSR
  ↓
大部分内容直接输出HTML
  ↓
少数交互组件成为岛屿
  ↓
岛屿在浏览器hydrate
```
