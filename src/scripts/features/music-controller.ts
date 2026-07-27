import {
  readLimitedText,
  validateMetingPayload,
  type MetingTrack,
} from "../core/media-policy";
import { RuntimeStyles } from "../core/runtime-styles";
import { createSafeStorage } from "../core/safe-storage";

export type MusicMode = "local" | "meting";

export interface MusicState {
  mode: MusicMode;
  index: number;
  currentTime: number;
  duration: number;
  volume: number;
  playing: boolean;
  loadingSource: boolean;
  title: string;
  artist: string;
}

export interface MusicController {
  readonly state: MusicState;
  mount(root?: HTMLElement | null): boolean;
  destroy(): void;
}

interface MusicTrack extends MetingTrack {
  node: HTMLButtonElement | null;
}

interface PlaybackSnapshot {
  mode?: MusicMode;
  index?: number;
  currentTime?: number;
  playing?: boolean;
}

interface RequestLease {
  controller: AbortController;
  generation: number;
  mode: MusicMode;
}

const MODE_STORAGE_KEY = "aria-music-mode";
const PLAYBACK_STORAGE_KEY = "aria-music-playback-state";
const ALLOWED_MODES = new Set<MusicMode>(["local", "meting"]);

const SOURCE_HINTS: Record<MusicMode, string> = {
  local: "当前使用旧版博客中的本地曲目。",
  meting: "当前使用旧版博客的 Meting 歌单源。",
};

const SOURCE_LOADING_HINT = "正在读取旧版博客的 Meting 歌单...";
const SOURCE_FALLBACK_HINT = "Meting 暂时没有返回可播放音源，已切回本地曲目。";

const isMusicMode = (value: unknown): value is MusicMode =>
  typeof value === "string" && ALLOWED_MODES.has(value as MusicMode);

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
};

const parseLrcTime = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = Number((match[3] || "0").padEnd(3, "0"));
  return minutes * 60 + seconds + fraction / 1000;
};

const isLyricCreditLine = (text: string): boolean =>
  /^(作词|作曲|编曲|制作人|监制|混音|母带|录音|和声|词|曲|arranged|composer|lyricist|producer|vocal|guitar|bass|drum|piano|strings|mixed|mastered)\s*[:：]/i.test(text);

const parseLrc = (text: string): Array<{ time: number; text: string }> =>
  text
    .split(/\r?\n/)
    .flatMap((line) => {
      const times = [...line.matchAll(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g)]
        .map((match) => parseLrcTime(match[1]))
        .filter((time): time is number => time !== null);
      const lyric = line.replace(/\[[^\]]+\]/g, "").trim();
      if (!times.length || !lyric || isLyricCreditLine(lyric)) return [];
      return times.map((time) => ({ time, text: lyric }));
    })
    .sort((a, b) => a.time - b.time);

class PersistentMusicController implements MusicController {
  readonly #storage = createSafeStorage();
  readonly #runtimeStyles = new RuntimeStyles();
  readonly #lifetime = new AbortController();

  #root: HTMLElement | null = null;
  #player: HTMLElement | null = null;
  #audio: HTMLAudioElement | null = null;
  #sourcePanel: HTMLElement | null = null;
  #sourceHint: HTMLElement | null = null;
  #playlistToggle: HTMLButtonElement | null = null;
  #playlistPanel: HTMLElement | null = null;
  #trackList: HTMLElement | null = null;
  #progress: HTMLInputElement | null = null;
  #volume: HTMLInputElement | null = null;
  #toggles: HTMLButtonElement[] = [];
  #modeButtons: HTMLButtonElement[] = [];
  #titleNodes: HTMLElement[] = [];
  #artistNodes: HTMLElement[] = [];
  #countNodes: HTMLElement[] = [];
  #coverNodes: HTMLElement[] = [];
  #currentNodes: HTMLElement[] = [];
  #durationNodes: HTMLElement[] = [];
  #lyricNodes: HTMLElement[] = [];

  #mode: MusicMode = "local";
  #tracks: MusicTrack[] = [];
  #localTracks: MusicTrack[] = [];
  #metingTracks: MusicTrack[] = [];
  #activeIndex = 0;
  #sourceNotice = "";
  #metingLoaded = false;
  #isSeeking = false;
  #detailsTrack: MusicTrack | null = null;
  #lyricEntries: Array<{ time: number; text: string }> = [];
  #activeLyricIndex = -1;
  #pendingRestoreTime = 0;
  #shouldResumePlayback = false;
  #lastPlaybackSaveAt = 0;
  #playlistCloseTimer = 0;

  #metingGeneration = 0;
  #lyricGeneration = 0;
  #mediaGeneration = 0;
  #modeGeneration = 0;
  #metingRequest: RequestLease | null = null;
  #lyricRequest: RequestLease | null = null;
  #mediaRequest: RequestLease | null = null;

  #metingConfig = {
    api: "",
    server: "netease",
    type: "playlist",
    id: "",
  };

  get state(): MusicState {
    const track = this.#tracks[this.#activeIndex];
    const audio = this.#audio;
    return {
      mode: this.#mode,
      index: this.#activeIndex,
      currentTime: audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
      volume: audio?.volume ?? Number(this.#volume?.value || 0.72),
      playing: Boolean(audio && !audio.paused && !audio.ended),
      loadingSource: this.#player?.classList.contains("is-source-loading") ?? false,
      title: track?.title || "Shelter",
      artist: track?.artist || "Porter Robinson & Madeon",
    };
  }

  mount(root = document.querySelector<HTMLElement>("[data-music-root]")): boolean {
    if (!root) return false;
    if (this.#root === root && root.dataset.ariaMusicControllerReady === "true") {
      this.#syncPlayingState();
      return true;
    }
    if (this.#root && this.#root !== root) {
      // ClientRouter 正常情况下会保留同一节点；若宿主节点确实被替换，必须重建单例而不是复用失效引用。
      return false;
    }

    const player = root.querySelector<HTMLElement>("[data-music-player]");
    const audio = player?.querySelector<HTMLAudioElement>("[data-music-audio]");
    if (!player || !audio) return false;

    this.#root = root;
    this.#player = player;
    this.#audio = audio;
    this.#sourcePanel = player.querySelector<HTMLElement>("[data-music-source-panel]");
    this.#sourceHint = player.querySelector<HTMLElement>("[data-music-source-hint]");
    this.#playlistToggle = player.querySelector<HTMLButtonElement>("[data-music-list-toggle]");
    this.#playlistPanel = player.querySelector<HTMLElement>("[data-music-list-panel]");
    this.#trackList = player.querySelector<HTMLElement>("[data-music-list]");
    this.#progress = player.querySelector<HTMLInputElement>("[data-music-progress]");
    this.#volume = player.querySelector<HTMLInputElement>("[data-music-volume]");
    this.#toggles = [...root.querySelectorAll<HTMLButtonElement>("[data-music-toggle]")];
    this.#modeButtons = [...player.querySelectorAll<HTMLButtonElement>("[data-music-mode]")];
    this.#titleNodes = [...root.querySelectorAll<HTMLElement>("[data-music-title]")];
    this.#artistNodes = [...root.querySelectorAll<HTMLElement>("[data-music-artist]")];
    this.#countNodes = [...root.querySelectorAll<HTMLElement>("[data-music-count]")];
    this.#coverNodes = [...root.querySelectorAll<HTMLElement>("[data-music-cover]")];
    this.#currentNodes = [...root.querySelectorAll<HTMLElement>("[data-music-current]")];
    this.#durationNodes = [...root.querySelectorAll<HTMLElement>("[data-music-duration]")];
    this.#lyricNodes = [...root.querySelectorAll<HTMLElement>("[data-music-lyric]")];

    const config = player.querySelector<HTMLElement>("[data-music-config]");
    this.#metingConfig = {
      api: config?.dataset.metingApi || "",
      server: config?.dataset.metingServer || "netease",
      type: config?.dataset.metingType || "playlist",
      id: config?.dataset.metingId || "",
    };

    this.#localTracks = [...player.querySelectorAll<HTMLButtonElement>("[data-music-track]")]
      .map((node): MusicTrack => ({
        src: node.dataset.src || "",
        title: node.dataset.title || node.textContent?.trim() || "Untitled",
        artist: node.dataset.artist || "Aria-7th Lab",
        cover: node.dataset.cover || "",
        lyric: node.dataset.lyric || "",
        node,
      }));
    this.#tracks = this.#localTracks;

    const defaultMode = isMusicMode(config?.dataset.defaultMode)
      ? config.dataset.defaultMode
      : "local";
    const storedMode = this.#storage.get(MODE_STORAGE_KEY);
    this.#mode = isMusicMode(storedMode) ? storedMode : defaultMode;

    const storedPlayback = this.#storage.getJSON<PlaybackSnapshot>(
      PLAYBACK_STORAGE_KEY,
      {},
      (value): value is PlaybackSnapshot => Boolean(value && typeof value === "object"),
    );
    if (isMusicMode(storedPlayback.mode)) this.#mode = storedPlayback.mode;

    const storedTrack = Number(this.#storage.get(`aria-music-track:${this.#mode}`));
    const storedPlaybackIndex = Number(storedPlayback.index);
    this.#activeIndex = Math.max(
      0,
      Number.isInteger(storedPlaybackIndex)
        ? storedPlaybackIndex
        : Number.isInteger(storedTrack)
          ? storedTrack
          : 0,
    );
    this.#pendingRestoreTime = Number(storedPlayback.currentTime) || 0;
    this.#shouldResumePlayback = storedPlayback.playing === true;

    const storedVolume = this.#storage.get("aria-music-volume");
    if (this.#volume && storedVolume !== null) this.#volume.value = storedVolume;
    if (this.#volume) audio.volume = Number(this.#volume.value);

    root.dataset.ariaMusicControllerReady = "true";
    // 兼容既有 DOM 契约，并阻止旧的页面级播放器重复绑定监听器。
    root.dataset.ariaMusicReady = "true";

    this.#bindEvents();
    this.#renderTrackButtons();
    this.#setPlaylistOpen(this.#storage.get("aria-music-playlist-open") === "true");
    this.#syncModeUi();
    this.#syncPlayingState();

    if (this.#mode === "meting") {
      const generation = ++this.#modeGeneration;
      void this.#fetchMetingTracks().then((loaded) => {
        if (!loaded || generation !== this.#modeGeneration || this.#mode !== "meting") return;
        this.#loadTrack(this.#activeIndex, this.#shouldResumePlayback, this.#shouldResumePlayback);
      });
    } else {
      this.#loadTrack(this.#activeIndex, this.#shouldResumePlayback, this.#shouldResumePlayback);
    }

    return true;
  }

  destroy(): void {
    this.#savePlaybackState(true);
    this.#cancelMetingRequest();
    this.#cancelLyricRequest();
    this.#cancelMediaRequest(false);
    window.clearTimeout(this.#playlistCloseTimer);
    this.#lifetime.abort();
    this.#runtimeStyles.dispose();
    this.#root?.removeAttribute("data-aria-music-controller-ready");
    this.#root?.removeAttribute("data-aria-music-ready");
  }

  #bindEvents(): void {
    const signal = this.#lifetime.signal;
    const audio = this.#audio;
    const player = this.#player;
    if (!audio || !player) return;

    this.#toggles.forEach((button) => {
      button.addEventListener("click", () => this.#togglePlayback(), { signal });
    });

    player.querySelector<HTMLButtonElement>("[data-music-prev]")?.addEventListener(
      "click",
      () => this.#loadTrack(this.#activeIndex - 1, !audio.paused),
      { signal },
    );
    player.querySelector<HTMLButtonElement>("[data-music-next]")?.addEventListener(
      "click",
      () => this.#loadTrack(this.#activeIndex + 1, !audio.paused),
      { signal },
    );

    player.querySelector<HTMLButtonElement>("[data-music-source-toggle]")?.addEventListener(
      "click",
      (event) => {
        if (!this.#sourcePanel) return;
        const button = event.currentTarget as HTMLButtonElement;
        const opening = this.#sourcePanel.hasAttribute("hidden");
        this.#sourcePanel.toggleAttribute("hidden", !opening);
        button.setAttribute("aria-expanded", String(opening));
      },
      { signal },
    );

    this.#playlistToggle?.addEventListener(
      "click",
      () => this.#setPlaylistOpen(this.#playlistToggle?.getAttribute("aria-expanded") !== "true"),
      { signal },
    );

    this.#modeButtons.forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          if (isMusicMode(button.dataset.musicMode)) void this.#setMusicMode(button.dataset.musicMode);
        },
        { signal },
      );
    });

    this.#trackList?.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-music-track]")
          : null;
        if (!target || !this.#trackList?.contains(target)) return;
        const index = Number(target.dataset.musicIndex);
        if (Number.isInteger(index)) this.#loadTrack(index, !audio.paused, true);
      },
      { signal },
    );

    this.#progress?.addEventListener(
      "input",
      () => {
        this.#isSeeking = true;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (duration <= 0 || !this.#progress) return;
        this.#currentNodes.forEach((node) => {
          node.textContent = formatTime((Number(this.#progress?.value) / 100) * duration);
        });
      },
      { signal },
    );
    this.#progress?.addEventListener(
      "change",
      () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (duration > 0 && this.#progress) {
          audio.currentTime = (Number(this.#progress.value) / 100) * duration;
        }
        this.#isSeeking = false;
        this.#updateProgress();
      },
      { signal },
    );
    this.#volume?.addEventListener(
      "input",
      () => {
        if (!this.#volume) return;
        audio.volume = Number(this.#volume.value);
        this.#storage.set("aria-music-volume", this.#volume.value);
      },
      { signal },
    );

    audio.addEventListener("play", () => {
      this.#syncPlayingState();
      this.#savePlaybackState(true);
    }, { signal });
    audio.addEventListener("pause", () => {
      this.#syncPlayingState();
      this.#savePlaybackState(true);
    }, { signal });
    audio.addEventListener("ended", () => this.#loadTrack(this.#activeIndex + 1, true), { signal });
    audio.addEventListener("timeupdate", () => this.#updateProgress(), { signal });
    window.addEventListener("pagehide", () => this.#savePlaybackState(true), { signal });
  }

  #togglePlayback(): void {
    const audio = this.#audio;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!audio.getAttribute("src")) {
      this.#loadTrack(this.#activeIndex, true, true);
      return;
    }
    void audio.play().catch(() => this.#syncPlayingState());
  }

  #renderTrackButtons(): void {
    if (!this.#trackList) return;
    this.#trackList.replaceChildren();
    this.#tracks.forEach((track, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.musicTrack = "";
      button.dataset.musicIndex = String(index);
      button.dataset.src = track.src;
      button.dataset.title = track.title;
      button.dataset.artist = track.artist;
      button.dataset.cover = track.cover;
      button.dataset.lyric = track.lyric;
      button.textContent = track.title;
      button.classList.toggle("is-active", index === this.#activeIndex);
      this.#trackList?.append(button);
      track.node = button;
    });
  }

  #syncModeUi(): void {
    if (!this.#player) return;
    this.#player.dataset.musicMode = this.#mode;
    if (this.#sourceHint) {
      this.#sourceHint.textContent = this.#sourceNotice || SOURCE_HINTS[this.#mode];
    }
    this.#modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.musicMode === this.#mode);
    });
  }

  #syncPlayingState(): void {
    const audio = this.#audio;
    if (!audio || !this.#player || !this.#root) return;
    const playing = !audio.paused && !audio.ended;
    this.#player.classList.toggle("is-playing", playing);
    this.#root.classList.toggle("is-music-playing", playing);
    this.#toggles.forEach((button) => button.setAttribute("aria-label", playing ? "暂停" : "播放"));
  }

  #savePlaybackState(force = false): void {
    const audio = this.#audio;
    if (!audio) return;
    const now = Date.now();
    if (!force && now - this.#lastPlaybackSaveAt < 5_000) return;
    this.#lastPlaybackSaveAt = now;
    this.#storage.setJSON(PLAYBACK_STORAGE_KEY, {
      mode: this.#mode,
      index: this.#activeIndex,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      playing: !audio.paused && !audio.ended,
      updatedAt: now,
    });
  }

  #setPlaylistOpen(open: boolean): void {
    const toggle = this.#playlistToggle;
    const panel = this.#playlistPanel;
    if (!toggle || !panel) return;
    window.clearTimeout(this.#playlistCloseTimer);
    toggle.setAttribute("aria-expanded", String(open));
    this.#storage.set("aria-music-playlist-open", String(open));

    if (open) {
      panel.hidden = false;
      window.requestAnimationFrame(() => panel.classList.add("is-open"));
      return;
    }

    panel.classList.remove("is-open");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.#playlistCloseTimer = window.setTimeout(() => {
      if (toggle.getAttribute("aria-expanded") !== "true") panel.hidden = true;
    }, reduceMotion ? 0 : 220);
  }

  #loadTrack(index: number, shouldPlay = false, shouldLoad = true): void {
    const audio = this.#audio;
    if (!audio || !this.#tracks.length) return;
    this.#activeIndex = (index + this.#tracks.length) % this.#tracks.length;
    const track = this.#tracks[this.#activeIndex];

    this.#titleNodes.forEach((node) => {
      node.textContent = track.title || "Untitled";
    });
    this.#artistNodes.forEach((node) => {
      node.textContent = track.artist || "Aria-7th Lab";
    });
    this.#countNodes.forEach((node) => {
      node.textContent = `${this.#activeIndex + 1} / ${this.#tracks.length}`;
    });

    if (shouldLoad && this.#detailsTrack !== track) {
      this.#detailsTrack = track;
      this.#coverNodes.forEach((node) => {
        node.classList.toggle("has-cover", Boolean(track.cover));
        if (track.cover) this.#runtimeStyles.set(node, "--music-cover-image", `url("${track.cover}")`);
        else this.#runtimeStyles.remove(node, "--music-cover-image");
      });
      void this.#loadLyrics(track);
    }

    this.#tracks.forEach((item) => item.node?.classList.toggle("is-active", item === track));
    this.#storage.set(`aria-music-track:${this.#mode}`, String(this.#activeIndex));

    if (shouldLoad && audio.getAttribute("src") !== track.src) {
      this.#startMediaRequest(track, shouldPlay);
      return;
    }
    if (shouldPlay) void audio.play().catch(() => this.#syncPlayingState());
  }

  #startMediaRequest(track: MusicTrack, shouldPlay: boolean): void {
    const audio = this.#audio;
    if (!audio) return;
    this.#cancelMediaRequest(false);
    const lease: RequestLease = {
      controller: new AbortController(),
      generation: ++this.#mediaGeneration,
      mode: this.#mode,
    };
    this.#mediaRequest = lease;
    const expectedSource = track.src;

    const isCurrent = (): boolean =>
      this.#isCurrentLease(lease, this.#mediaRequest, this.#mediaGeneration) &&
      this.#tracks[this.#activeIndex] === track &&
      audio.getAttribute("src") === expectedSource;

    const finish = (): void => {
      if (!isCurrent()) return;
      if (this.#pendingRestoreTime > 0) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        audio.currentTime = duration > 0
          ? Math.min(this.#pendingRestoreTime, Math.max(0, duration - 0.4))
          : this.#pendingRestoreTime;
        this.#pendingRestoreTime = 0;
      }
      this.#updateProgress();
      if (this.#mediaRequest === lease) this.#mediaRequest = null;
    };

    audio.addEventListener("loadedmetadata", finish, {
      once: true,
      signal: lease.controller.signal,
    });
    audio.addEventListener("error", () => {
      if (!isCurrent()) return;
      this.#shouldResumePlayback = false;
      this.#syncPlayingState();
      if (this.#mediaRequest === lease) this.#mediaRequest = null;
    }, {
      once: true,
      signal: lease.controller.signal,
    });

    audio.dataset.musicRequestGeneration = String(lease.generation);
    audio.src = expectedSource;
    if (this.#progress) this.#progress.value = "0";
    this.#currentNodes.forEach((node) => {
      node.textContent = "0:00";
    });
    this.#durationNodes.forEach((node) => {
      node.textContent = "0:00";
    });

    if (shouldPlay) {
      void audio.play().catch(() => {
        if (!isCurrent()) return;
        this.#shouldResumePlayback = false;
        this.#savePlaybackState();
        this.#syncPlayingState();
      });
    } else {
      audio.load();
    }
  }

  #cancelMediaRequest(clearSource: boolean): void {
    this.#mediaGeneration += 1;
    this.#mediaRequest?.controller.abort();
    this.#mediaRequest = null;
    const audio = this.#audio;
    if (!clearSource || !audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  async #setMusicMode(mode: MusicMode): Promise<void> {
    const audio = this.#audio;
    if (!audio || mode === this.#mode) return;
    const generation = ++this.#modeGeneration;
    this.#cancelMetingRequest();
    this.#cancelLyricRequest();
    this.#cancelMediaRequest(true);
    this.#sourceNotice = "";
    this.#mode = mode;
    this.#storage.set(MODE_STORAGE_KEY, mode);

    if (mode === "meting") {
      const loaded = await this.#fetchMetingTracks();
      if (generation !== this.#modeGeneration || this.#mode !== mode) return;
      if (!loaded) this.#storage.set(MODE_STORAGE_KEY, this.#mode);
    } else {
      this.#tracks = this.#localTracks;
      this.#activeIndex = Number(this.#storage.get("aria-music-track:local")) || 0;
      this.#renderTrackButtons();
      // 切回本地音源时同样刷新封面、歌词与媒体状态，不能因为前一首是远程歌曲
      // 而让“歌词读取中”或远程封面残留在持久 Dock 上。
      this.#loadTrack(this.#activeIndex, false, true);
    }

    if (generation !== this.#modeGeneration || this.#mode !== mode) return;
    this.#syncModeUi();
    this.#syncPlayingState();
  }

  #buildMetingUrl(): string {
    if (!this.#metingConfig.api || !this.#metingConfig.id) return "";
    return this.#metingConfig.api
      .replace(":server", encodeURIComponent(this.#metingConfig.server))
      .replace(":type", encodeURIComponent(this.#metingConfig.type))
      .replace(":id", encodeURIComponent(this.#metingConfig.id))
      .replace(":r", String(Date.now()));
  }

  #cancelMetingRequest(): void {
    this.#metingGeneration += 1;
    this.#metingRequest?.controller.abort();
    this.#metingRequest = null;
    this.#player?.classList.remove("is-source-loading");
  }

  async #fetchMetingTracks(): Promise<boolean> {
    if (this.#metingLoaded) {
      this.#tracks = this.#metingTracks;
      this.#activeIndex = Number(this.#storage.get("aria-music-track:meting")) || 0;
      this.#renderTrackButtons();
      this.#loadTrack(this.#activeIndex, false, true);
      this.#sourceNotice = "";
      this.#syncModeUi();
      return true;
    }

    const url = this.#buildMetingUrl();
    if (!url || this.#mode !== "meting") return false;
    this.#cancelMetingRequest();
    const lease: RequestLease = {
      controller: new AbortController(),
      generation: ++this.#metingGeneration,
      mode: this.#mode,
    };
    this.#metingRequest = lease;
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, 8_000);

    this.#sourceNotice = "";
    this.#player?.classList.add("is-source-loading");
    if (this.#sourceHint) this.#sourceHint.textContent = SOURCE_LOADING_HINT;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([lease.controller.signal, timeoutController.signal]),
        credentials: "omit",
      });
      const payload: unknown = JSON.parse(await readLimitedText(response));
      const mappedTracks: MusicTrack[] = validateMetingPayload(payload, window.location.href)
        .map((track) => ({ ...track, node: null }));
      if (!this.#isCurrentMetingLease(lease)) return false;

      if (!mappedTracks.length) {
        this.#fallbackToLocal();
        return false;
      }

      this.#metingTracks = mappedTracks;
      this.#tracks = mappedTracks;
      this.#activeIndex = Number(this.#storage.get("aria-music-track:meting")) || 0;
      this.#metingLoaded = true;
      this.#sourceNotice = "";
      this.#renderTrackButtons();
      this.#loadTrack(this.#activeIndex, false, true);
      return true;
    } catch (error) {
      if (!this.#isCurrentMetingLease(lease)) return false;
      if (!timedOut && error instanceof DOMException && error.name === "AbortError") return false;
      this.#fallbackToLocal();
      return false;
    } finally {
      window.clearTimeout(timeout);
      // catch/finally 同样必须持有当前代次和模式令牌，旧请求不得清理新请求的加载态。
      if (this.#isCurrentMetingLease(lease)) {
        this.#metingRequest = null;
        this.#player?.classList.remove("is-source-loading");
        if (!this.#sourceNotice && this.#sourceHint) {
          this.#sourceHint.textContent = SOURCE_HINTS.meting;
        }
      }
    }
  }

  #fallbackToLocal(): void {
    this.#sourceNotice = SOURCE_FALLBACK_HINT;
    this.#mode = "local";
    this.#modeGeneration += 1;
    // 请求失败后的降级也可能发生在歌词尚未返回时；主动中止可避免无效连接继续占用，
    // 而代次校验会继续兜底，防止已在传输中的旧响应覆盖本地歌曲的信息。
    this.#cancelLyricRequest();
    this.#tracks = this.#localTracks;
    this.#storage.set(MODE_STORAGE_KEY, "local");
    this.#player?.classList.remove("is-source-loading");
    this.#renderTrackButtons();
    this.#syncModeUi();
    this.#loadTrack(0, false, true);
  }

  #cancelLyricRequest(): void {
    this.#lyricGeneration += 1;
    this.#lyricRequest?.controller.abort();
    this.#lyricRequest = null;
  }

  async #loadLyrics(track: MusicTrack): Promise<void> {
    this.#cancelLyricRequest();
    const lease: RequestLease = {
      controller: new AbortController(),
      generation: ++this.#lyricGeneration,
      mode: this.#mode,
    };
    this.#lyricRequest = lease;
    this.#lyricEntries = [];
    this.#activeLyricIndex = -1;

    if (!track.lyric) {
      if (this.#isCurrentLyricLease(lease, track)) this.#setLyricText("这首歌暂时没有歌词。");
      return;
    }

    this.#setLyricText("歌词读取中...");
    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), 8_000);

    try {
      const lyricText = /^\s*\[/.test(track.lyric)
        ? track.lyric
        : await fetch(track.lyric, {
          signal: AbortSignal.any([lease.controller.signal, timeoutController.signal]),
          credentials: "omit",
        }).then((response) => readLimitedText(response));
      if (!this.#isCurrentLyricLease(lease, track)) return;
      this.#lyricEntries = parseLrc(lyricText);
      this.#activeLyricIndex = -2;
      if (this.#lyricEntries.length) this.#syncLyric(this.#audio?.currentTime || 0);
      else this.#setLyricText("这首歌暂时没有逐行歌词。");
    } catch {
      if (!this.#isCurrentLyricLease(lease, track)) return;
      this.#setLyricText("歌词暂时加载失败。");
    } finally {
      window.clearTimeout(timeout);
      if (this.#isCurrentLyricLease(lease, track)) this.#lyricRequest = null;
    }
  }

  #setLyricText(text: string): void {
    this.#lyricNodes.forEach((node) => {
      node.textContent = text;
    });
  }

  #syncLyric(currentTime: number): void {
    if (!this.#lyricEntries.length) return;
    let nextIndex = -1;
    for (let index = this.#lyricEntries.length - 1; index >= 0; index -= 1) {
      if (currentTime >= this.#lyricEntries[index].time) {
        nextIndex = index;
        break;
      }
    }
    if (nextIndex === this.#activeLyricIndex) return;
    this.#activeLyricIndex = nextIndex;
    this.#setLyricText(nextIndex >= 0 ? this.#lyricEntries[nextIndex].text : "歌词准备中...");
  }

  #updateProgress(): void {
    const audio = this.#audio;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    this.#currentNodes.forEach((node) => {
      node.textContent = formatTime(audio.currentTime);
    });
    this.#durationNodes.forEach((node) => {
      node.textContent = formatTime(duration);
    });
    if (this.#progress && !this.#isSeeking) {
      this.#progress.value = duration > 0 ? String((audio.currentTime / duration) * 100) : "0";
    }
    this.#syncLyric(audio.currentTime);
    this.#savePlaybackState();
  }

  #isCurrentLease(
    lease: RequestLease,
    active: RequestLease | null,
    generation: number,
  ): boolean {
    return !lease.controller.signal.aborted &&
      active === lease &&
      generation === lease.generation &&
      this.#mode === lease.mode &&
      Boolean(this.#root?.isConnected);
  }

  #isCurrentMetingLease(lease: RequestLease): boolean {
    return this.#isCurrentLease(lease, this.#metingRequest, this.#metingGeneration) &&
      this.#mode === "meting";
  }

  #isCurrentLyricLease(lease: RequestLease, track: MusicTrack): boolean {
    return this.#isCurrentLease(lease, this.#lyricRequest, this.#lyricGeneration) &&
      this.#detailsTrack === track;
  }
}

let controller: PersistentMusicController | null = null;

export const getMusicController = (): MusicController => {
  controller ??= new PersistentMusicController();
  return controller;
};

export const initMusicController = (): MusicController => {
  let current = getMusicController();
  if (!current.mount()) {
    current.destroy();
    controller = new PersistentMusicController();
    current = controller;
    current.mount();
  }
  return current;
};
