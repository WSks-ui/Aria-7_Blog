import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const normalizeForComparison = (value: string) => value.normalize("NFKC").toLocaleLowerCase("zh-CN");

const uniqueStringList = (label: string, maxItems: number, maxLength: number) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, `${label}不能包含空字符串`)
        .max(maxLength, `${label}单项不能超过 ${maxLength} 个字符`)
        // 标签与关键词同时用于 URL、搜索和导航，保留空白会造成看似相同却无法匹配的词条。
        .refine((value) => !/\s/u.test(value), `${label}不能包含空白字符`),
    )
    .max(maxItems, `${label}最多包含 ${maxItems} 项`)
    .default([])
    .superRefine((values, context) => {
      const seen = new Map<string, number>();
      values.forEach((value, index) => {
        const key = normalizeForComparison(value);
        const previousIndex = seen.get(key);
        if (previousIndex !== undefined) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `${label}不能重复（与第 ${previousIndex + 1} 项冲突）`,
          });
          return;
        }
        seen.set(key, index);
      });
    });

export const blogSchema = z
  .object({
    title: z.string().trim().min(1, "标题至少需要 1 个字符").max(70, "标题不能超过 70 个字符"),
    description: z.string().trim().min(20, "摘要至少需要 20 个字符").max(160, "摘要不能超过 160 个字符"),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    lastReviewed: z.coerce.date().optional(),
    tags: uniqueStringList("标签", 5, 40),
    keywords: uniqueStringList("关键词", 12, 60),
    category: z.string().trim().min(1, "分类不能为空").max(40, "分类不能超过 40 个字符").optional(),
    series: z.string().trim().min(1, "系列不能为空").max(80, "系列不能超过 80 个字符").optional(),
    seriesOrder: z.number().int("系列顺序必须是整数").positive("系列顺序必须大于 0").optional(),
    cover: z.string().trim().min(1).max(512).optional(),
    comment: z.boolean().default(true),
    draft: z.boolean().default(false),
  })
  .superRefine((data, context) => {
    if (data.updatedDate && data.updatedDate < data.pubDate) {
      context.addIssue({
        code: "custom",
        path: ["updatedDate"],
        message: "更新日期不能早于发布日期",
      });
    }
    if (data.lastReviewed && data.lastReviewed < data.pubDate) {
      context.addIssue({
        code: "custom",
        path: ["lastReviewed"],
        message: "复查日期不能早于发布日期",
      });
    }
    if (data.seriesOrder !== undefined && !data.series) {
      context.addIssue({
        code: "custom",
        path: ["seriesOrder"],
        message: "设置系列顺序时必须同时设置 series",
      });
    }
    if (data.series && data.seriesOrder === undefined) {
      context.addIssue({
        code: "custom",
        path: ["series"],
        message: "设置 series 时必须同时设置 seriesOrder",
      });
    }
  });

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: blogSchema,
});

export const collections = { blog };
