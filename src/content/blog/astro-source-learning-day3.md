---
"title": "Astro源码学习 Day3:第一次改源码"
"description": "理解monorepo工作流,在Astro源码里加代码并验证生效,掌握改-编译-验证循环"
"pubDate": "2026-08-14"
"tags":
  - "Astro"
  - "源码学习"
"keywords":
  - "Astro源码"
  - "monorepo"
  - "源码修改"
"cover": "/images/astro-learning/astro-logo.png"
---

## monorepo工作流

改源码到生效的完整链路

```
packages/astro/src/ (源码)
    ↓ pnpm -C packages/astro build
packages/astro/dist/ (编译产物)
    ↓ 软链接
examples/minimal/node_modules/astro (运行时)
```

**关键点**:examples通过软链接指向本地`packages/astro`,但实际运行的是编译后的`dist/`目录,改源码后必须重新编译才生效

## 实战:加第一行日志

**位置**:`packages/astro/src/core/build/index.ts:187`前

```typescript
private async build({ viteConfig }) {
	this.logger.info('build', `你好呀,这是我添加的第一行代码`)
	this.logger.info('build', `output: ...`)
}
```

选这里的原因
- `build()`方法是构建核心入口
- 位置靠前,容易观察
- 紧挨着官方日志,便于对比

**验证**:编译包→跑示例构建→看到输出在`[types]`之后`[build] output`之前

## 常见问题

改了没生效→检查是否重新编译了`packages/astro`

时间戳对比→`dist/`编译产物应该比`src/`源码文件新

## 核心收获

- 掌握monorepo"改-编译-验证"循环
- Astro日志规范:`this.logger.info('类别', 内容)`而非`console.log`
- 源码(TypeScript)和运行时代码(JavaScript)分离

