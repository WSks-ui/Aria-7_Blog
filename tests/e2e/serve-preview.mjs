import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || "127.0.0.1";

if (!existsSync(distRoot)) {
  console.error("未找到 dist，请先运行 npm run build。");
  process.exit(1);
}

const { headers: headerRules = [] } = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".lrc", "text/plain; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

const applyConfiguredHeaders = (response, pathname) => {
  for (const rule of headerRules) {
    const matcher = new RegExp(`^${rule.source}$`);
    if (!matcher.test(pathname)) continue;
    for (const header of rule.headers ?? []) response.setHeader(header.key, header.value);
  }
};

const findStaticFile = (pathname) => {
  // 依次解码、规范化并校验最终绝对路径，覆盖编码斜杠和 Windows 反斜杠造成的目录穿越。
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = normalize(decoded.replace(/^\/+/, ""));
  if (relative === ".." || relative.startsWith(`..${sep}`)) return null;

  const candidates = decoded.endsWith("/")
    ? [join(distRoot, relative, "index.html")]
    : [join(distRoot, relative), join(distRoot, `${relative}.html`), join(distRoot, relative, "index.html")];

  return candidates.find((candidate) => {
    const absolute = resolve(candidate);
    return absolute.startsWith(`${distRoot}${sep}`) && existsSync(absolute) && statSync(absolute).isFile();
  }) ?? null;
};

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const file = findStaticFile(url.pathname);
  applyConfiguredHeaders(response, url.pathname);

  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const size = statSync(file).size;
  const type = contentTypes.get(extname(file).toLowerCase()) || "application/octet-stream";
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Type", type);

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end >= size) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { "Content-Length": size });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`E2E preview: http://${host}:${port}`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
