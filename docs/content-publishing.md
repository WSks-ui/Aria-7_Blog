# 内容发布说明

1. 在 `src/content/blog` 新建 Markdown 文件，并填写标题、摘要、发布日期、分类、导航标签与关键词。
2. 标签最多 5 个、关键词最多 12 个；两者不能有空白项或重复项。技术细节放入 `keywords`，`tags` 只保留适合作为归档导航的主题。
3. `draft: true` 或未来 `pubDate` 的文章不会出现在首页、归档、搜索、RSS、sitemap 或相关文章中。
4. `updatedDate` 与 `lastReviewed` 不得早于 `pubDate`。使用系列时必须同时提供 `series` 和 `seriesOrder`。
5. 发布前运行：

   ```powershell
   npm run check
   npm run test:unit
   npm run build
   npm run check:links
   ```

构建会验证内容 schema、slug 冲突、内部链接与本地图片尺寸。生产地址、RSS、sitemap 和 canonical 均以 `https://aria7bl0g.pages.dev` 为根。
