import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const origin = "https://aria7bl0g.pages.dev";

if (!existsSync(distRoot)) {
  throw new Error("未找到 dist，请先运行 npm run build。");
}

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  }));
  return nested.flat();
};

const resolveLocalTarget = (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = normalize(decoded.replace(/^\/+/, ""));
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) return null;

  const candidates = relativePath.endsWith("/")
    ? [join(distRoot, relativePath, "index.html")]
    : [
      join(distRoot, relativePath),
      join(distRoot, `${relativePath}.html`),
      join(distRoot, relativePath, "index.html"),
    ];

  return candidates.find((candidate) => {
    const resolved = resolve(candidate);
    return resolved.startsWith(`${distRoot}${sep}`) && existsSync(resolved);
  }) ?? null;
};

const extractReferences = (html) => {
  const references = [];
  const attributePattern = /\b(?:href|src|srcset)=["']([^"']+)["']/gi;

  for (const match of html.matchAll(attributePattern)) {
    const [, value] = match;
    if (!value) continue;

    if (match[0].toLowerCase().startsWith("srcset=")) {
      value.split(",").forEach((candidate) => {
        const url = candidate.trim().split(/\s+/, 1)[0];
        if (url) references.push(url);
      });
    } else {
      references.push(value);
    }
  }

  return references;
};

const htmlFiles = (await walk(distRoot)).filter((file) => extname(file) === ".html");
const failures = [];

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  const source = `/${relative(distRoot, htmlFile).replaceAll("\\", "/")}`;

  for (const reference of extractReferences(html)) {
    if (
      reference.startsWith("#") ||
      /^(?:data|javascript|mailto|tel|blob):/i.test(reference) ||
      reference.startsWith("//")
    ) {
      continue;
    }

    let url;
    try {
      url = new URL(reference, origin);
    } catch {
      failures.push({ source, reference, reason: "URL 格式无效" });
      continue;
    }

    if (url.origin !== origin) continue;
    if (!resolveLocalTarget(url.pathname)) {
      failures.push({ source, reference, reason: "构建产物中不存在目标" });
    }
  }
}

if (failures.length > 0) {
  failures.forEach(({ source, reference, reason }) => {
    console.error(`${source} -> ${reference}: ${reason}`);
  });
  process.exitCode = 1;
} else {
  console.log(`内部链接与资源检查通过，共检查 ${htmlFiles.length} 个 HTML 页面。`);
}
