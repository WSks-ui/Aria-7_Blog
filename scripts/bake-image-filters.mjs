import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * 一次性构建期处理：把原本挂在 .home-next__video 上的 CSS filter
 * saturate(1.08) contrast(1.04) brightness(1.02) 烘进 home-bg 系列源图。
 *
 * 动机：全屏图片挂 CSS filter 会阻断浏览器直接合成，上方任何元素
 * （物理标签、品牌视差、光斑）每帧变动都会触发整屏滤镜光栅。
 * 烘焙后视觉等价，但渲染时图片可作为普通纹理直接上屏。
 *
 * CSS contrast(c) 等价线性映射 out = (in - 128) * c + 128，
 * 即 sharp 的 .linear(c, 128 * (1 - c))；saturate/brightness 对应 modulate。
 * ±4% 以内的顺序差异对装饰背景不可感知。
 */
const targets = [
  { file: "public/images/home-bg.webp", format: "webp", quality: 80 },
  { file: "public/images/home-bg.avif", format: "avif", quality: 55 },
  { file: "public/images/home-bg-mobile.webp", format: "webp", quality: 80 },
];

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

const bakeOne = async ({ file, format, quality }) => {
  const absolute = resolve(process.cwd(), file);
  const before = (await stat(absolute)).size;

  // 先读入内存再写回同一路径；直接 path->toFile 在 Windows 上会因文件锁偶发写失败。
  const input = await readFile(absolute);
  const pipeline = sharp(input)
    .linear(1.04, 128 * (1 - 1.04))
    .modulate({ brightness: 1.02, saturation: 1.08 });

  const buffer = format === "avif"
    ? await pipeline.avif({ quality }).toBuffer()
    : await pipeline.webp({ quality }).toBuffer();

  await writeFile(absolute, buffer);
  const after = (await stat(absolute)).size;
  console.log(`${file}: ${formatBytes(before)} -> ${formatBytes(after)}`);
};

for (const target of targets) {
  await bakeOne(target);
}
console.log("滤镜烘焙完成。请同步删除 home.css 中 .home-next__video 的 filter 声明。");
