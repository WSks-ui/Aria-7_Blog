import { describe, expect, it, vi } from "vitest";
import {
  isAllowedMediaUrl,
  readLimitedText,
  validateMetingPayload,
} from "../../src/scripts/core/media-policy";

describe("Meting 媒体策略", () => {
  it.each([
    ["/audio/local.mp3", "https://blog.example/path", true],
    ["https://blog.example/audio/local.mp3", "https://blog.example/path", true],
    ["https://api.i-meto.com/audio/remote.mp3", "https://blog.example", true],
    ["http://api.i-meto.com/audio/remote.mp3", "https://blog.example", false],
    ["https://api.i-meto.com.evil.test/audio.mp3", "https://blog.example", false],
    ["https://user:pass@blog.example/audio.mp3", "https://blog.example", false],
    ["https://blog.example:8443/audio.mp3", "https://blog.example", false],
    ["data:audio/mpeg;base64,AA==", "https://blog.example", false],
    ["not a url", "https://blog.example", true],
  ])("校验媒体 URL %s", (value, baseUrl, expected) => {
    expect(isAllowedMediaUrl(value, baseUrl)).toBe(expected);
  });

  it("拒绝非字符串、空值和超长 URL", () => {
    expect(isAllowedMediaUrl(null)).toBe(false);
    expect(isAllowedMediaUrl(42)).toBe(false);
    expect(isAllowedMediaUrl("")).toBe(false);
    expect(isAllowedMediaUrl(`/${"a".repeat(2048)}`)).toBe(false);
  });

  it("清洗字段别名、默认文案并限制曲目数量", () => {
    const payload = [
      {
        url: "/audio/one.mp3",
        name: `  ${"曲".repeat(220)}  `,
        artist: "  Aria  ",
        picture: "https://api.i-meto.com/cover.webp",
        lyric: "/audio/one.lrc",
      },
      { url: "https://api.i-meto.com/two.mp3" },
      { url: "/audio/ignored.mp3", title: "ignored" },
    ];

    const tracks = validateMetingPayload(payload, "https://blog.example", 2);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      src: "/audio/one.mp3",
      title: "曲".repeat(200),
      artist: "Aria",
      cover: "https://api.i-meto.com/cover.webp",
      lyric: "/audio/one.lrc",
    });
    expect(tracks[1]).toMatchObject({
      title: "Untitled",
      artist: "Aria-7th Lab",
      cover: "",
      lyric: "",
    });
  });

  it("保留合法长 URL，不按展示文本上限截断", () => {
    const url = `/audio/${"segment".repeat(40)}.mp3`;
    const [track] = validateMetingPayload([{ url }], "https://blog.example");

    expect(url.length).toBeGreaterThan(200);
    expect(track?.src).toBe(url);
  });

  it("过滤结构错误、非法主音频及非法可选资源", () => {
    const payload = [
      null,
      "track",
      {},
      { url: "https://evil.example/song.mp3" },
      { url: "/audio/ok.mp3", pic: "https://evil.example/cover.webp" },
      { url: "/audio/ok.mp3", lrc: "javascript:alert(1)" },
      { url: "/audio/valid.mp3", cover: "", lrc: "" },
    ];

    expect(validateMetingPayload(payload, "https://blog.example")).toEqual([
      {
        src: "/audio/valid.mp3",
        title: "Untitled",
        artist: "Aria-7th Lab",
        cover: "",
        lyric: "",
      },
    ]);
    expect(validateMetingPayload({ tracks: payload })).toEqual([]);
  });
});

describe("受限响应读取", () => {
  it("读取分块 UTF-8 响应且不破坏多字节字符", async () => {
    const bytes = new TextEncoder().encode("你好 Astro");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });

    await expect(readLimitedText(new Response(body), bytes.byteLength)).resolves.toBe("你好 Astro");
  });

  it("根据状态码和 Content-Length 提前拒绝响应", async () => {
    await expect(readLimitedText(new Response("fail", { status: 503 }))).rejects.toThrow("503");
    await expect(
      readLimitedText(new Response("small", { headers: { "content-length": "99" } }), 10),
    ).rejects.toThrow("超过上限");
  });

  it("没有响应流时仍按 UTF-8 字节数限制内容", async () => {
    const response = {
      ok: true,
      headers: new Headers(),
      body: null,
      text: vi.fn().mockResolvedValue("你好"),
    } as unknown as Response;

    await expect(readLimitedText(response, 6)).resolves.toBe("你好");
    await expect(readLimitedText(response, 5)).rejects.toThrow("超过上限");
  });

  it("流式读取超限时取消 reader", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel,
    });

    await expect(readLimitedText(new Response(body), 5)).rejects.toThrow("超过上限");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
