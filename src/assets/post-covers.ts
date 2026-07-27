import heroBackground from "./images/hero-bg.webp";

/**
 * 文章 frontmatter 仍保留公开 URL，既不打断旧链接也不改变搜索索引；
 * 需要响应式输出的模板则通过此映射取得 Astro 可优化的静态资源。
 */
const postCoverAssets = {
  "/images/hero-bg.webp": heroBackground,
} as const;

export const getPostCoverAsset = (cover: string | undefined) =>
  cover ? postCoverAssets[cover as keyof typeof postCoverAssets] : undefined;
