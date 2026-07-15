import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { imageSize } from "image-size";

export interface ImageDimensions {
  width: number;
  height: number;
}

const isInsideDirectory = (directory: string, target: string) => {
  const relativePath = relative(directory, target);
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
};

/**
 * 将站内根路径映射到 public 文件。这里同时检查编码前后的路径段和最终真实路径，
 * 避免 `%2e%2e`、反斜杠或符号链接绕过目录边界。远程及相对 URL 交给浏览器处理，
 * 构建阶段不会主动访问网络。
 */
export async function readPublicImageDimensions(
  source: string,
  publicDirectory: string,
): Promise<ImageDimensions | null> {
  if (!source.startsWith("/") || source.startsWith("//")) return null;

  const pathWithoutQuery = source.split(/[?#]/, 1)[0];
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathWithoutQuery);
  } catch {
    throw new Error(`本地图片 URL 包含无效编码：${source}`);
  }

  const segments = decodedPath.split("/");
  if (
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`本地图片 URL 不得越过 public 目录：${source}`);
  }

  const publicRoot = resolve(publicDirectory);
  const candidate = resolve(publicRoot, `.${decodedPath}`);
  if (!isInsideDirectory(publicRoot, candidate)) {
    throw new Error(`本地图片 URL 不得越过 public 目录：${source}`);
  }

  let realPublicRoot: string;
  let realImagePath: string;
  try {
    [realPublicRoot, realImagePath] = await Promise.all([realpath(publicRoot), realpath(candidate)]);
  } catch (error) {
    throw new Error(`无法读取 public 中的本地图片：${source}`, { cause: error });
  }

  if (!isInsideDirectory(realPublicRoot, realImagePath)) {
    throw new Error(`本地图片的真实路径越过 public 目录：${source}`);
  }

  let dimensions;
  try {
    dimensions = imageSize(await readFile(realImagePath));
  } catch (error) {
    throw new Error(`无法解析本地图片尺寸：${source}`, { cause: error });
  }

  if (!dimensions.width || !dimensions.height) {
    throw new Error(`本地图片缺少有效尺寸：${source}`);
  }

  return { width: dimensions.width, height: dimensions.height };
}

// Astro 预渲染会把模块打包到 dist/.prerender，不能用 import.meta.url 反推源码目录。
const sitePublicDirectory = resolve(process.cwd(), "public");

export const readSiteImageDimensions = (source: string) =>
  readPublicImageDimensions(source, sitePublicDirectory);
