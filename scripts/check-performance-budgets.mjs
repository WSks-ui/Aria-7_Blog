import { brotliCompressSync, constants } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const distDirectory = resolve(projectRoot, process.env.PERF_DIST_DIR ?? "dist");
const maximumInitialJavaScriptBrotliBytes = 25 * 1024;
const maximumBlogMobileFirstViewportBytes = 220 * 1024;

const brotliOptions = {
  params: {
    [constants.BROTLI_PARAM_QUALITY]: 11,
  },
};

const isWithinDirectory = (directory, candidate) => {
  const relativePath = relative(directory, candidate);
  return (
    relativePath === ""
    || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith(".."))
  );
};

const formatBytes = (value) => `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KiB`;

const toBrotliBytes = (buffer) => brotliCompressSync(buffer, brotliOptions).byteLength;

const isExternalUrl = (value) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(value);

const decodePathname = (value) => {
  const pathname = value.split(/[?#]/u, 1)[0];
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new Error(`资源 URL 包含无效编码：${value}`);
  }
};

/**
 * 将页面内的本地 URL 解析成 dist 中的文件路径。
 * 预算只统计最终由本次构建提供的同源资源；Meting、Giscus、音频等运行时网络请求不在这里混入。
 */
const resolveLocalAsset = (value, pageFile) => {
  if (!value || isExternalUrl(value)) return null;

  const pathname = decodePathname(value);
  if (!pathname) return null;

  const candidate = pathname.startsWith("/")
    ? resolve(distDirectory, `.${pathname}`)
    : resolve(dirname(pageFile), pathname);

  if (!isWithinDirectory(distDirectory, candidate)) {
    throw new Error(`资源 URL 越过 dist 目录：${value}`);
  }

  return candidate;
};

const readAttributes = (source) => {
  const attributes = new Map();
  const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;

  for (const match of source.matchAll(attributePattern)) {
    const [, rawName, doubleQuoted, singleQuoted, unquoted] = match;
    attributes.set(rawName.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted ?? "");
  }

  return attributes;
};

const readHtmlElements = (html) => {
  const elements = [];
  const elementPattern = /<(script|link|img|source)\b([^>]*)>/giu;

  for (const match of html.matchAll(elementPattern)) {
    elements.push({
      tag: match[1].toLowerCase(),
      attributes: readAttributes(match[2]),
    });
  }

  return elements;
};

const getHtmlAssetGroups = (html, pageFile) => {
  const scripts = new Set();
  const styles = new Set();
  const preloadedImages = new Set();
  const elements = readHtmlElements(html);

  for (const { tag, attributes } of elements) {
    const href = attributes.get("href");
    const src = attributes.get("src");
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/u);
    const as = (attributes.get("as") ?? "").toLowerCase();

    if (tag === "script" && src) {
      const asset = resolveLocalAsset(src, pageFile);
      if (asset && extname(asset) === ".js") scripts.add(asset);
    }

    if (tag === "link" && href && rel.includes("modulepreload")) {
      const asset = resolveLocalAsset(href, pageFile);
      if (asset && extname(asset) === ".js") scripts.add(asset);
    }

    if (tag === "link" && href && rel.includes("stylesheet")) {
      const asset = resolveLocalAsset(href, pageFile);
      if (asset && extname(asset) === ".css") styles.add(asset);
    }

    if (tag === "link" && href && rel.includes("preload") && as === "image") {
      const asset = resolveLocalAsset(href, pageFile);
      if (asset) preloadedImages.add(asset);
    }
  }

  return { elements, scripts, styles, preloadedImages };
};

const staticModuleSpecifierPattern = /\b(?:import|export)\s+(?:(?:[\s\S]*?)\s+from\s+)?["']([^"']+)["']/gu;
const dynamicModuleSpecifierPattern = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gu;

const collectInitialJavaScript = async (entrypoints, { includeDynamicImports = false } = {}) => {
  const files = new Set();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;

    files.add(file);
    const source = await readFile(file, "utf8");

    const importSpecifiers = [
      ...source.matchAll(staticModuleSpecifierPattern),
      ...(includeDynamicImports ? [...source.matchAll(dynamicModuleSpecifierPattern)] : []),
    ];

    for (const match of importSpecifiers) {
      const imported = resolveLocalAsset(match[1], file);
      if (imported && extname(imported) === ".js" && !files.has(imported)) {
        queue.push(imported);
      }
    }
  }

  return files;
};

const walkHtmlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkHtmlFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(absolutePath);
    }
  }

  return files;
};

const toRoute = (file) => {
  const filePath = relative(distDirectory, file).replaceAll("\\", "/");
  if (filePath === "index.html") return "/";
  if (filePath.endsWith("/index.html")) return `/${filePath.slice(0, -"index.html".length)}`;
  return `/${filePath}`;
};

const getBrotliFileSize = async (file) => toBrotliBytes(await readFile(file));

const sumBrotliFileSizes = async (files) => {
  const sizes = await Promise.all([...files].map(async (file) => [file, await getBrotliFileSize(file)]));
  return new Map(sizes);
};

const readSrcsetCandidate = (value) => {
  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [url, descriptor = ""] = candidate.split(/\s+/u);
      const widthMatch = descriptor.match(/^(\d+)w$/u);
      return { url, width: widthMatch ? Number(widthMatch[1]) : 0 };
    })
    .sort((left, right) => left.width - right.width);

  // 390px CSS viewport 以 DPR 2 估算，优先选择不会低于 780px 的候选；没有则用最大的候选。
  return candidates.find((candidate) => candidate.width >= 780) ?? candidates.at(-1) ?? null;
};

/**
 * 仅将明确标记为首屏关键图片的资源计入 Blog 移动端传输预算。
 * 图片格式优先级与 Chromium 一致：AVIF、WebP、最后才是 img fallback。
 */
const collectCriticalBlogImages = (html, pageFile) => {
  const images = new Set();
  const picturePattern = /<picture\b[^>]*>([\s\S]*?)<\/picture>/giu;
  const pictures = [...html.matchAll(picturePattern)];
  const imageGroups = pictures.map((match) => readHtmlElements(match[0]));

  // picture 内的 source 不会重复携带 loading/fetchpriority；由 fallback img 的属性决定其是否为关键图。
  // 因此按 picture 分组后再挑选 AVIF/WebP，可避免把 fallback 当成真实浏览器选择的资源。
  const standaloneElements = readHtmlElements(html).filter(({ tag, attributes }) => (
    tag === "img"
    && !pictures.some((picture) => picture[0].includes(attributes.get("src") ?? ""))
  ));

  for (const group of [...imageGroups, standaloneElements]) {
    const isCritical = group.some(({ tag, attributes }) => (
      tag === "img"
      && (
        attributes.has("data-performance-critical")
        || attributes.get("fetchpriority") === "high"
        || attributes.get("loading") === "eager"
      )
    ));
    if (!isCritical) continue;

    const candidates = group.flatMap(({ tag, attributes }) => {
      if (tag === "source") {
        const candidate = readSrcsetCandidate(attributes.get("srcset") ?? "");
        return candidate ? [{
          source: candidate.url,
          type: (attributes.get("type") ?? "").toLowerCase(),
        }] : [];
      }
      if (tag === "img") {
        const candidate = readSrcsetCandidate(attributes.get("srcset") ?? "");
        return [{
          source: candidate?.url ?? attributes.get("src") ?? "",
          type: "",
        }];
      }
      return [];
    });

    const preferred = candidates.find((candidate) => candidate.type === "image/avif")
      ?? candidates.find((candidate) => candidate.type === "image/webp")
      ?? candidates[0];
    if (!preferred?.source) continue;

    const asset = resolveLocalAsset(preferred.source, pageFile);
    if (asset) images.add(asset);
  }

  return images;
};

const printTable = (title, entries) => {
  console.log(`\n${title}`);
  for (const [name, size] of entries) {
    console.log(`  ${formatBytes(size).padStart(9)}  ${name}`);
  }
};

const assertBudget = (actual, maximum, label) => {
  if (actual <= maximum) return;
  throw new Error(`${label} 超出预算：${formatBytes(actual)} / ${formatBytes(maximum)}`);
};

const main = async () => {
  const htmlFiles = await walkHtmlFiles(distDirectory);
  const nonGamePages = htmlFiles.filter((file) => {
    const route = toRoute(file);
    return route !== "/game/" && route !== "/game.html";
  });
  const initialJavaScriptByRoute = [];

  for (const pageFile of nonGamePages) {
    const html = await readFile(pageFile, "utf8");
    const { scripts } = getHtmlAssetGroups(html, pageFile);
    const initialScripts = await collectInitialJavaScript(scripts);
    const scriptSizes = await sumBrotliFileSizes(initialScripts);
    const total = [...scriptSizes.values()].reduce((sum, size) => sum + size, 0);
    initialJavaScriptByRoute.push({
      route: toRoute(pageFile),
      total,
      scriptSizes,
    });
  }

  const failingJavaScriptPages = initialJavaScriptByRoute.filter(
    (entry) => entry.total > maximumInitialJavaScriptBrotliBytes,
  );

  printTable(
    "非 Game 页初始 JavaScript（Brotli）",
    initialJavaScriptByRoute
      .sort((left, right) => right.total - left.total)
      .map((entry) => [entry.route, entry.total]),
  );

  if (failingJavaScriptPages.length > 0) {
    const details = failingJavaScriptPages
      .map((entry) => `${entry.route} ${formatBytes(entry.total)}`)
      .join("；");
    throw new Error(`非 Game 页初始 JavaScript 超出 ${formatBytes(maximumInitialJavaScriptBrotliBytes)}：${details}`);
  }

  const blogPage = resolve(distDirectory, "blog", "index.html");
  const blogHtml = await readFile(blogPage, "utf8");
  const {
    scripts: blogScriptEntrypoints,
    styles: blogStyles,
    preloadedImages,
  } = getHtmlAssetGroups(blogHtml, blogPage);
  const blogScripts = await collectInitialJavaScript(blogScriptEntrypoints);
  const criticalImages = new Set([
    ...preloadedImages,
    ...collectCriticalBlogImages(blogHtml, blogPage),
  ]);
  const blogHtmlBrotli = toBrotliBytes(Buffer.from(blogHtml));
  const blogScriptSizes = await sumBrotliFileSizes(blogScripts);
  const blogStyleSizes = await sumBrotliFileSizes(blogStyles);
  const criticalImageSizes = new Map(await Promise.all(
    [...criticalImages].map(async (file) => [file, (await readFile(file)).byteLength]),
  ));
  const blogJavaScriptBrotli = [...blogScriptSizes.values()].reduce((sum, size) => sum + size, 0);
  const blogStylesBrotli = [...blogStyleSizes.values()].reduce((sum, size) => sum + size, 0);
  const blogImageBytes = [...criticalImageSizes.values()].reduce((sum, size) => sum + size, 0);
  const blogMobileFirstViewportTransfer = blogHtmlBrotli + blogJavaScriptBrotli + blogStylesBrotli + blogImageBytes;

  printTable("Blog 移动端首屏传输构成", [
    ["HTML（Brotli）", blogHtmlBrotli],
    ["JavaScript（Brotli）", blogJavaScriptBrotli],
    ["CSS（Brotli）", blogStylesBrotli],
    ["关键图片（原始传输）", blogImageBytes],
    ["合计", blogMobileFirstViewportTransfer],
  ]);

  if (criticalImages.size === 0) {
    throw new Error("Blog 页面缺少首屏关键图片标记；请为首张可见封面添加 data-performance-critical。");
  }

  assertBudget(
    blogMobileFirstViewportTransfer,
    maximumBlogMobileFirstViewportBytes,
    "Blog 移动端首屏传输",
  );

  console.log("\n性能预算通过。");
};

main().catch((error) => {
  console.error(`\n性能预算检查失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
