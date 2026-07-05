interface PostMetrics {
  words: number;
  minutes: number;
}

const stripFrontmatter = (text: string) => text.replace(/^---[\s\S]*?---/, "");

const stripMarkdownSyntax = (text: string) =>
  stripFrontmatter(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/\]\([^)]+\)/, ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~|[\]()-]/g, " ");

export const getPostMetrics = (body = ""): PostMetrics => {
  const text = stripMarkdownSyntax(body);
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  const total = chineseChars + words;

  // 中文和英文混排时按偏保守的阅读速度估算，避免短文章显示成 0 分钟。
  return {
    words: total,
    minutes: Math.max(1, Math.ceil(total / 360)),
  };
};
