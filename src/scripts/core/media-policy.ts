const METING_ORIGIN = "https://api.i-meto.com";
const DEFAULT_BASE = "https://aria.local";

export interface MetingTrack {
  src: string;
  title: string;
  artist: string;
  cover: string;
  lyric: string;
}

const firstText = (...values: unknown[]): string => {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
};

const firstUrl = (...values: unknown[]): string => {
  const value = values.find((item) => typeof item === "string" && item.trim());
  // URL 必须先保留完整内容，再由统一策略检查长度和来源；截断会把原地址静默改成另一个地址。
  return typeof value === "string" ? value.trim() : "";
};

// 媒体信任边界仅包含当前站点和固定的 Meting HTTPS 源，拒绝凭据、端口及其他外部地址。
export const isAllowedMediaUrl = (value: unknown, baseUrl = DEFAULT_BASE): value is string => {
  if (typeof value !== "string" || !value || value.length > 2048) return false;
  try {
    const base = new URL(baseUrl, DEFAULT_BASE);
    const url = new URL(value, base);
    if (url.username || url.password || url.port) return false;
    if (url.origin === base.origin) return url.protocol === "http:" || url.protocol === "https:";
    return url.protocol === "https:" && url.origin === METING_ORIGIN;
  } catch {
    return false;
  }
};

export const validateMetingPayload = (
  payload: unknown,
  baseUrl = DEFAULT_BASE,
  maxTracks = 50,
): MetingTrack[] => {
  if (!Array.isArray(payload)) return [];
  return payload.slice(0, maxTracks).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const src = firstUrl(record.url);
    const cover = firstUrl(record.pic, record.cover, record.picture);
    const lyric = firstUrl(record.lrc, record.lyric);
    if (!isAllowedMediaUrl(src, baseUrl)) return [];
    if (cover && !isAllowedMediaUrl(cover, baseUrl)) return [];
    if (lyric && !isAllowedMediaUrl(lyric, baseUrl)) return [];
    return [{
      src,
      title: firstText(record.title, record.name, record.songname) || "Untitled",
      artist: firstText(record.author, record.artist, record.artistname) || "Aria-7th Lab",
      cover,
      lyric,
    }];
  });
};

export const readLimitedText = async (response: Response, maxBytes = 256 * 1024): Promise<string> => {
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  // Content-Length 只能快速拒绝声明超限的响应；分块传输或伪造长度仍必须以实际读取字节数为准。
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("响应内容超过上限");
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("响应内容超过上限");
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("响应内容超过上限");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
};
