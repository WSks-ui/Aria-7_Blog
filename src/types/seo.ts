export type JsonLdValue = Record<string, unknown> | Record<string, unknown>[];

export interface ArticleSeoData {
  publishedTime: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
}

export interface SeoData {
  /** 仅接受站内路径；组件会统一去除查询参数、片段并补足规范地址。 */
  canonicalPath?: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  noindex?: boolean;
  article?: ArticleSeoData;
  jsonLd?: JsonLdValue;
}
