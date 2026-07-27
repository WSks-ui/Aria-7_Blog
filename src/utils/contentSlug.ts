/**
 * 内容归档使用稳定、可读且跨语言一致的 slug：
 * - NFKC 统一全角字符；
 * - 英文统一小写；
 * - 空白和下划线归一为连字符；
 * - 保留中文、字母、数字和连字符，去掉其余标点。
 */
export const slugifyContent = (value: string): string => {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return normalized
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}\p{M}-]+/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "");
};

export const assertUniqueContentSlugs = (
  labels: Iterable<string>,
  kind: "标签" | "分类" | "系列",
): Map<string, string> => {
  const slugs = new Map<string, string>();
  for (const rawLabel of labels) {
    const label = rawLabel.normalize("NFKC").trim();
    const slug = slugifyContent(label);
    if (!slug) throw new Error(`${kind}“${label}”无法生成有效 slug`);
    const previous = slugs.get(slug);
    // 即使只差大小写或全半角，也不能让两个可见词条静默共享同一个归档 URL。
    if (previous && previous !== label) {
      throw new Error(`${kind} slug 冲突：${previous} 与 ${label} 都映射为“${slug}”`);
    }
    slugs.set(slug, previous ?? label);
  }
  return slugs;
};
