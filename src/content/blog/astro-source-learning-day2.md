---
"title": "Astro 源码学习笔记Day 2：build流程、hook与渲染概念"
"description": "继续从Astro源码入手，梳理astro build的执行链路，理解core与integration的分工，并补清Vite、SSR岛屿架构与hydrate这些容易混在一起的概念"
"pubDate": "2026-08-13"
"tags":
  - "Astro"
  - "源码学习"
  - "开源项目"
"keywords":
  - "Astro构建"
  - "hook"
  - "Vite"
  - "SSR"
  - "hydrate"
  - "sitemap"
"category": "技术"
"draft": false
---

## 这一天学的内容

今天顺着 `pnpm build` 的日志进入了Astro的源码主干

目标：

- 看懂一次 `astro build` 大致经历了什么
- 分清Astro核心代码和integration插件代码的职责边界
- 认识几个概念：Vite、SSR、岛屿架构、hydrate

## 一次 `astro build` 到底发生了什么

目前可以把 `astro build` 理解成两层入口：

1. **CLI 入口**：接收命令行参数
2. **核心构建入口**：真正执行构建流程

对应源码：

- `packages/astro/src/cli/build/index.ts`
- `packages/astro/src/core/build/index.ts`

其中 `packages/astro/src/core/build/index.ts` 更重要，它里面有一个核心类：`AstroBuilder`。

### 可以先用一个类比理解

把build想成一次建筑工程：

- `AstroBuilder` 像总指挥
- `setup()` 像开工前的准备
- `build()` 像正式施工
- Vite 像施工队(属于独立的部分)
- 最终把结果交到 `dist/` 目录

### 主干流程

```text
pnpm build
  ↓
读取配置
  ↓
创建 AstroBuilder
  ↓
builder.run()
  ├─ setup()  做准备工作
  └─ build()  进入正式构建
```

![Astro build 的主干流程图：从 pnpm build 进入 AstroBuilder.run()，再分成 setup 和 build 两个阶段](/assets/images/posts/astro-source-learning/build-flow.svg)

### `run()`、`setup()`、`build()` 的关系

在 `packages/astro/src/core/build/index.ts` 里，可以看到这几个方法的结构：

- `private async setup()`
- `private async build(...)`
- `async run()`

`run()` 的代码结构大致是：

```ts
async run() {
  const setupData = await this.setup();
  await this.build(setupData);
}
```

这里最关键的一点是：

> `run()` 是统一入口，`setup()` 和 `build()` 都是它内部安排的步骤

`build()` 被标记成 `private`，说明作者不希望外部直接调用它，而是必须通过 `run()` 走完整流程。这其实也是一种防呆设计：保持先准备再构建的顺序

## build 日志和源码的对应关系

之前看到的构建日志，现在可以和源码位置对上：

| 日志 | 含义 | 位置 |
|------|------|------|

| `[types] Generated` | 生成类型文件 | `packages/astro/src/core/sync/index.ts` |
| `[build] output: "static"` | 输出模式信息 | `packages/astro/src/core/build/index.ts` |
| `[vite] ✓ built in ...ms` | Vite 完成打包 | Vite 自己输出，不是 Astro 主体打印 |
| `generating static routes` | 开始逐页生成静态页面 | `packages/astro/src/core/build/generate.ts` |

这里有个值得记住的点：

> 不是所有日志都来自 Astro 本体 `[vite]` 这一类日志，其实来自 Astro 底下使用的 Vite

这也说明 Astro 不是自己从零实现整套打包系统，而是建立在 Vite 之上。

## `packages/astro/src/core/build/index.ts` 和 `packages/integrations/sitemap/src/index.ts` 的区别

这两个文件名字都叫 `index.ts`，但角色完全不同。

### `packages/astro/src/core/build/index.ts`

这是 **Astro 核心构建流程的一部分**

它的职责是：

- 读取配置
- 初始化构建环境
- 调度 Vite
- 组织页面生成
- 控制整个 build 生命周期

可以把它理解成：**老板 / 总调度器**

### `packages/integrations/sitemap/src/index.ts`

这是一个 **integration 插件的入口文件**

它本身不负责控制 build 流程，是把自己挂到 Astro 的生命周期上，在合适的时候执行自己的逻辑

它的职责是：

- 监听构建相关的 hook
- 在构建完成后，根据页面列表生成 sitemap 文件

可以把它理解成：**插件 / 外挂功能**

### 一句话区分

- `core/build/index.ts`：负责把房子盖起来
- `integrations/sitemap/index.ts`：等房子盖完后，顺手帮你写一份“房间清单”给搜索引擎

## hook 机制是什么

今天最重要的新概念之一就是 hook

### 本质

**hook = 事件通知机制**。

可以简单理解成：

> “如果某个时刻发生了某件事，就自动调用我提前登记好的函数。”

这和生活里的“快递到了通知我”“朋友下飞机给我发消息”是同一种模式

### 在 Astro 里的样子

以 sitemap 集成为例，它会返回一个对象，里面有 `hooks`：

```ts
return {
  name: '@astrojs/sitemap',
  hooks: {
    'astro:routes:resolved': (...) => { ... },
    'astro:config:done': (...) => { ... },
    'astro:build:done': (...) => { ... },
  }
}
```

意思是：

- 路由解析完时通知我
- 配置读完时通知我
- 构建结束时通知我

### 核心代码如何触发 hook

对应的核心代码在：

- `packages/astro/src/integrations/hooks.ts`

例如 `runHookBuildDone()` 会遍历所有安装过的 integration，然后调用它们注册的 `astro:build:done`。

结构可以粗略理解成：

```ts
for (const integration of integrations) {
  找到 integration.hooks['astro:build:done']
  如果有，就执行它
}
```

所以 hook 机制的本质不是“神秘机制”，而是很朴素的设计：

- 核心负责在某些时刻广播事件
- 插件负责声明“我想在这个时刻做什么”

![Astro 的 hook 机制示意图：核心代码广播事件，@astrojs/sitemap 在 routes、config、build 完成时分别接收并处理](/assets/images/posts/astro-source-learning/hook-sitemap.svg)

## sitemap 集成是什么

`sitemap` 是网站地图文件，主要给搜索引擎使用

它的作用是：

- 把站点里的页面 URL 整理成一份清单
- 方便搜索引擎发现和抓取页面

在 Astro 里，`@astrojs/sitemap` 是一个官方 integration。

它会在构建完成后：

- 收集所有页面 URL
- 过滤不需要进入 sitemap 的页面（比如 404/500）
- 结合 `site` 配置拼成完整地址
- 最后写出 sitemap 文件

如果没有配置 `site`，它就没法生成完整 URL，所以这个集成会直接跳过

这一点在源码里也能看到：它会检查 `config.site` 是否存在

## Vite 是什么

**Vite 是前端构建工具和开发服务器。**

可以先把它理解成 Astro 背后的“施工队”：

- 开发时提供 dev server 和热更新
- 构建时负责模块打包、依赖处理、产物生成
- Astro 站在它上面做更高层的页面组织和渲染逻辑

所以：

- Astro 不是 Vite
- Astro 会使用 Vite

## SSR 是什么

**SSR = Server-Side Rendering，服务端渲染。**

意思是：

> 页面 HTML 由服务器先生成，再发给浏览器。

和它对照的是 CSR（客户端渲染）：

- CSR：浏览器下载 JS，再自己把页面拼出来
- SSR：服务器先把 HTML 拼好，浏览器先看到内容

SSR 回答的是：

> **HTML 是在哪里生成的？**

## Astro 有岛屿架构，为什么还可以 SSR

这两个概念不是一回事。

### SSR 解决的问题

SSR 解决的是：

- 页面 HTML 是构建时生成，还是请求时生成
- 是服务器生成，还是浏览器生成

### 岛屿架构解决的问题

岛屿架构解决的是：

- 页面里的 JS 应该加载到多细的粒度
- 是整页都交给前端框架，还是只给局部交互区域加载 JS

所以可以有这些组合：

- **静态生成 + 岛屿架构**
- **SSR + 岛屿架构**

并不冲突

速记：

- SSR 关注“HTML 什么时候、在哪里生成”
- 岛屿架构关注“JS 只给谁加载”

![SSR、岛屿架构与 hydrate 的关系图：SSR 负责先生成 HTML，岛屿架构只给局部组件加载 JS，hydrate 负责让这些组件在浏览器中活过来](/assets/images/posts/astro-source-learning/render-concepts.svg)

## “岛屿”到底是什么

Astro 里的“岛屿”，不是整页，而是：

> 页面中那些需要交互的局部组件。

比如一个博客文章页：

- 标题
- 正文
- 页脚
- 评论框
- 搜索框
- 点赞按钮

这里通常只有：

- 评论框
- 搜索框
- 点赞按钮

需要浏览器端 JS 才能交互。那它们就是“岛屿”页面其余内容只是静态 HTML，可以直接输出，不需要运行客户端 JS

所以“岛屿架构”的直观理解是：

- 页面大部分是静态海洋
- 少数交互组件是散落在海洋上的岛屿

## hydrate 是什么意思

`hydrate` 可以理解成：

> 给已经存在的 HTML 接上行为，让它从“能显示”变成“能交互”

比如服务器先输出一个按钮：

```html
<button>点赞</button>
```

浏览器一开始能看到它，但这个按钮不一定已经有点击逻辑。

等对应组件的客户端JS下载并执行之后事件绑定上去后状态恢复起来，按钮才能点击

这个过程就是hydration

所以hydrate的作用是在HTML的基础上把JS变成可用的的交互组件

## 总结

```text
Astro负责组织页面和构建流程
  ↓
Vite负责开发和打包
  ↓
页面可以是静态生成，也可以是SSR
  ↓
页面里大部分内容直接输出成HTML
  ↓
只有少数需要交互的组件成为“岛屿”
  ↓
这些岛屿在浏览器中再进行hydrate
```

## 速记

- `astro build` 的主流程在 `AstroBuilder.run()` 里
- `run()` 负责调度 `setup()` 和 `build()`
- `core` 目录是 Astro 本体，`integrations` 目录是插件能力
- hook 本质就是事件通知机制
- `@astrojs/sitemap` 是构建结束后生成网站地图的 integration
- Vite 是 Astro 底下的构建工具，不是 Astro 本身
- SSR 和岛屿架构不是对立关系
- 岛屿是局部交互组件，不是整页
- hydrate 是给已有 HTML 接上交互能力
