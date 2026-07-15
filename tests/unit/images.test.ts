import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPublicImageDimensions, readSiteImageDimensions } from "../../src/lib/images";
import rehypeImagePerformance from "../../src/plugins/rehype-image-performance.mjs";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let temporaryRoot: string;
let publicDirectory: string;

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "aria-images-"));
  publicDirectory = join(temporaryRoot, "public");
  await mkdir(join(publicDirectory, "images"), { recursive: true });
  await writeFile(join(publicDirectory, "images", "pixel.png"), ONE_PIXEL_PNG);
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("public 图片元数据", () => {
  it("读取带查询参数和片段的站内图片尺寸", async () => {
    await expect(
      readPublicImageDimensions("/images/pixel.png?v=1#preview", publicDirectory),
    ).resolves.toEqual({ width: 1, height: 1 });
  });

  it("使用站点 public 目录读取构建资源", async () => {
    await expect(readSiteImageDimensions("/images/aria-avatar.webp")).resolves.toEqual({
      width: 512,
      height: 512,
    });
  });

  it.each([
    "https://example.com/image.png",
    "//cdn.example.com/image.png",
    "images/relative.png",
    "data:image/png;base64,AA==",
  ])("跳过非 public 根路径：%s", async (source) => {
    await expect(readPublicImageDimensions(source, publicDirectory)).resolves.toBeNull();
  });

  it("缺失或不可解析的站内图片使构建失败", async () => {
    await expect(
      readPublicImageDimensions("/images/missing.png", publicDirectory),
    ).rejects.toThrow("无法读取");
    await writeFile(join(publicDirectory, "images", "invalid.png"), "not an image");
    await expect(
      readPublicImageDimensions("/images/invalid.png", publicDirectory),
    ).rejects.toThrow("无法解析");
  });

  it.each([
    "/../secret.png",
    "/%2e%2e/secret.png",
    "/images/..%2f..%2fsecret.png",
    "/images\\..\\secret.png",
  ])("拒绝路径逃逸：%s", async (source) => {
    await expect(readPublicImageDimensions(source, publicDirectory)).rejects.toThrow("不得越过");
  });

  it("拒绝无效 URL 编码", async () => {
    await expect(
      readPublicImageDimensions("/images/%ZZ.png", publicDirectory),
    ).rejects.toThrow("无效编码");
  });

  it("拒绝通过目录链接读取 public 外部文件", async () => {
    const outside = join(temporaryRoot, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.png"), ONE_PIXEL_PNG);
    await symlink(outside, join(publicDirectory, "linked"), "junction");

    await expect(
      readPublicImageDimensions("/linked/secret.png", publicDirectory),
    ).rejects.toThrow("真实路径越过");
  });
});

describe("Markdown 图片性能插件", () => {
  it("为本地图片注入尺寸和加载属性，同时跳过远程尺寸探测", async () => {
    const localProperties = { src: "/images/pixel.png", width: 9 };
    const remoteProperties = { src: "https://example.com/remote.png" };
    const tree = {
      type: "root",
      children: [
        { type: "element", tagName: "img", properties: localProperties, children: [] },
        { type: "element", tagName: "section", children: [
          { type: "element", tagName: "img", properties: remoteProperties, children: [] },
        ] },
        { type: "text", value: "ignored" },
      ],
    };

    await rehypeImagePerformance({ publicDirectory })(tree);

    expect(localProperties).toEqual({
      src: "/images/pixel.png",
      width: 9,
      height: 1,
      loading: "lazy",
      decoding: "async",
    });
    expect(remoteProperties).toEqual({
      src: "https://example.com/remote.png",
      loading: "lazy",
      decoding: "async",
    });
  });

  it("保留已有加载属性并忽略没有字符串 src 的图片", async () => {
    const properties = { src: null, loading: "eager", decoding: "sync" };
    const tree = {
      type: "root",
      children: [{ type: "element", tagName: "img", properties, children: [] }],
    };

    await rehypeImagePerformance({ publicDirectory })(tree);
    expect(properties).toEqual({ src: null, loading: "eager", decoding: "sync" });
  });

  it("传播本地图片缺失错误", async () => {
    const tree = {
      type: "root",
      children: [{
        type: "element",
        tagName: "img",
        properties: { src: "/missing.png" },
        children: [],
      }],
    };

    await expect(rehypeImagePerformance({ publicDirectory })(tree)).rejects.toThrow("无法读取");
  });

  it("安全忽略空语法树", async () => {
    await expect(rehypeImagePerformance({ publicDirectory })(null)).resolves.toBeUndefined();
  });
});
