(() => {
  window.__ariaInteractionsCleanup?.();

  const pageCleanups = [];
  let pageAlive = true;
  const addPageCleanup = (cleanup) => pageCleanups.push(cleanup);
  const onPage = (target, type, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    addPageCleanup(() => target.removeEventListener(type, listener, options));
  };

  // Astro 客户端路由切页时不会刷新整个窗口；这里集中清理页面级监听，避免越切越慢。
  window.__ariaInteractionsCleanup = () => {
    if (!pageAlive) return;
    pageAlive = false;
    while (pageCleanups.length) {
      pageCleanups.pop()?.();
    }
  };
  onPage(document, "astro:before-swap", window.__ariaInteractionsCleanup, { once: true });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const homeLayerStage = document.querySelector("[data-home-layer-stage]");
  const labFeed = document.querySelector("#lab-feed");
  const homeNavHeader = document.querySelector(".site-header--brandless");
  if (homeLayerStage) {
    let layerFrame = 0;
    let wasPastHero = document.body.classList.contains("is-past-hero");
    let navReturnTimer = 0;

    const getLayerScrollRange = () => {
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      );
      return Math.max(1, documentHeight - window.innerHeight);
    };

    const setPastHeroState = (nextPastHero) => {
      if (nextPastHero === wasPastHero) return;
      wasPastHero = nextPastHero;

      document.body.classList.toggle("is-past-hero", nextPastHero);
      if (!nextPastHero && homeNavHeader) {
        window.clearTimeout(navReturnTimer);
        homeNavHeader.classList.add("is-nav-returning");
        navReturnTimer = window.setTimeout(() => {
          homeNavHeader.classList.remove("is-nav-returning");
        }, reduceMotion ? 0 : 680);
      } else {
        homeNavHeader?.classList.remove("is-nav-returning", "is-nav-open");
      }
    };

    const syncHomeLayerReveal = () => {
      layerFrame = 0;
      const range = getLayerScrollRange();
      const progress = Math.min(Math.max(window.scrollY / range, 0), 1);
      const stageHeight = homeLayerStage.getBoundingClientRect().height || window.innerHeight;
      // 分割线直接贴合滚动位置，避免弹簧追踪带来的黏滞手感。
      const split = stageHeight * (1 - progress);

      setPastHeroState(progress > 0.56);
      homeLayerStage.style.setProperty("--home-layer-progress", progress.toFixed(3));
      homeLayerStage.style.setProperty("--home-layer-split-y", `${split.toFixed(2)}px`);
    };

    const requestHomeLayerReveal = () => {
      if (!layerFrame) layerFrame = window.requestAnimationFrame(syncHomeLayerReveal);
    };

    const scrollToLayerEnd = (event) => {
      event.preventDefault();
      window.scrollTo({
        top: getLayerScrollRange(),
        left: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
      window.history.replaceState({}, "", "#lab-feed");
    };

    document.querySelectorAll('a[href="#lab-feed"]').forEach((link) => {
      onPage(link, "click", scrollToLayerEnd);
    });

    if (window.location.hash === "#lab-feed") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: getLayerScrollRange(), left: 0, behavior: "auto" });
        syncHomeLayerReveal();
      });
    }

    syncHomeLayerReveal();
    onPage(window, "scroll", requestHomeLayerReveal, { passive: true });
    onPage(window, "resize", syncHomeLayerReveal);
    addPageCleanup(() => {
      window.cancelAnimationFrame(layerFrame);
      window.clearTimeout(navReturnTimer);
    });
  }

  if (labFeed && !reduceMotion) {
    let feedPointerFrame = 0;
    let feedPointerEvent = null;

    const resetFeedPointer = () => {
      feedPointerEvent = null;
      if (feedPointerFrame) {
        window.cancelAnimationFrame(feedPointerFrame);
        feedPointerFrame = 0;
      }
      labFeed.classList.remove("is-pointer-active");
      labFeed.style.setProperty("--feed-pointer-x", "0");
      labFeed.style.setProperty("--feed-pointer-y", "0");
      labFeed.style.setProperty("--feed-spot-x", "50%");
      labFeed.style.setProperty("--feed-spot-y", "44%");
    };

    const syncFeedPointer = () => {
      feedPointerFrame = 0;
      if (!feedPointerEvent) return;

      const bounds = labFeed.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (feedPointerEvent.clientX - bounds.left) / bounds.width;
      const y = (feedPointerEvent.clientY - bounds.top) / bounds.height;

      // 标签墙的物理坐标由下方脚本写入 transform，这里只同步 CSS 变量做轻量视差和光斑。
      labFeed.classList.add("is-pointer-active");
      labFeed.style.setProperty("--feed-pointer-x", ((x - 0.5) * 2).toFixed(3));
      labFeed.style.setProperty("--feed-pointer-y", ((y - 0.5) * 2).toFixed(3));
      labFeed.style.setProperty("--feed-spot-x", `${Math.round(x * 100)}%`);
      labFeed.style.setProperty("--feed-spot-y", `${Math.round(y * 100)}%`);
    };

    onPage(labFeed, "pointermove", (event) => {
      if (event.pointerType === "touch") return;
      feedPointerEvent = event;
      if (!feedPointerFrame) feedPointerFrame = window.requestAnimationFrame(syncFeedPointer);
    });
    onPage(labFeed, "pointerleave", resetFeedPointer);
    addPageCleanup(resetFeedPointer);
  }

  const navHeader = homeNavHeader;
  const navHoverZone = navHeader?.querySelector(".nav-hover-zone");
  const navPill = navHeader?.querySelector(".nav-pill");
  if (navHeader && navHoverZone && navPill) {
    let navCloseTimer = 0;
    let navPointerFrame = 0;
    let navPointerEvent = null;

    const syncNavMetrics = () => {
      // 导航宽度会随字体和视口变化；从子项尺寸计算，避免收起态 scrollWidth 被压小。
      const links = [...navPill.querySelectorAll(".nav-link")];
      const gap = Math.min(26, Math.max(12, window.innerWidth * 0.0115));
      const linkWidth = links.length * 132;
      const width = Math.min(window.innerWidth - 128, Math.ceil(linkWidth + gap * Math.max(0, links.length - 1) + 68));
      navPill.style.setProperty("--home-nav-open-width", `${Math.max(width, 320)}px`);
    };

    const openNav = () => {
      window.clearTimeout(navCloseTimer);
      syncNavMetrics();
      navHeader.classList.add("is-nav-open");
    };

    const closeNav = () => {
      window.clearTimeout(navCloseTimer);
      navCloseTimer = window.setTimeout(() => {
        navHeader.classList.remove("is-nav-open");
      }, 90);
    };

    const syncNavPointer = () => {
      navPointerFrame = 0;
      if (!navPointerEvent) return;

      const { clientX, clientY } = navPointerEvent;
      const hit = (node) => {
        const rect = node.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      };

      if (hit(navHoverZone) || hit(navPill)) openNav();
      else closeNav();
    };

    const requestNavPointerSync = (event) => {
      if (event.pointerType === "touch") return;
      navPointerEvent = event;
      if (!navPointerFrame) navPointerFrame = window.requestAnimationFrame(syncNavPointer);
    };

    // 纯 CSS 的 :has(:hover) 在复杂固定层里偶发失效；类名只负责稳定触发动画。
    [navHoverZone, navPill].forEach((node) => {
      onPage(node, "pointerenter", openNav);
      onPage(node, "mouseenter", openNav);
    });
    onPage(document, "pointermove", requestNavPointerSync, { passive: true });
    onPage(document, "mousemove", requestNavPointerSync, { passive: true });
    onPage(navHeader, "focusin", openNav);
    onPage(navHeader, "focusout", closeNav);
    syncNavMetrics();
    onPage(window, "resize", syncNavMetrics);
    addPageCleanup(() => {
      window.clearTimeout(navCloseTimer);
      window.cancelAnimationFrame(navPointerFrame);
    });
  }

  // 首页终端条是触发入口；打开后只替换当前卡片区域，不再生成全屏遮罩层。
  const terminal = document.querySelector("[data-terminal]");
  if (terminal) {
    const output = terminal.querySelector("[data-terminal-text]");
    const commands = JSON.parse(terminal.dataset.commands || "[]");
    const terminalShell = terminal.closest("[data-terminal-shell]");
    const terminalHero = terminal.closest(".hero-section");
    const terminalStage = terminalShell?.querySelector("[data-terminal-stage]");
    const terminalAvatar = terminalStage?.querySelector("[data-terminal-avatar]");
    const terminalBubble = terminalStage?.querySelector("[data-terminal-bubble]");
    const terminalTyped = terminalStage?.querySelector("[data-terminal-window-text]");
    const terminalBubbleTexts = [
      "今天也把灵感收进小抽屉里。",
      "先写一点点也算启动成功。",
      "漫画、音乐和代码都可以慢慢整理。",
      "如果页面卡住，就先喝口水再 debug。",
      "Aria-7th Lab 正在记录短暂但可爱的瞬间。",
    ];
    const terminalTypeLines = [
      "哈喽哇",
      "崎愿-よねやま ( ´∀`)",
      "soft signals drifting through Aria-7th Lab",
      "今日は漫画と音楽を少しだけ整理する",
      "record the fleeting mortal moments",
    ];
    let commandIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let bubbleIndex = Math.floor(Math.random() * terminalBubbleTexts.length);
    let isTerminalOpen = false;
    let terminalTypingTimer = 0;
    let terminalCloseTimer = 0;
    const terminalLineHoldDelay = 5000;

    const showCursorToast = (message, x, y) => {
      window.dispatchEvent(
        new CustomEvent("aria:cursor-toast", {
          detail: { message, x, y },
        }),
      );
    };

    const tick = () => {
      if (!pageAlive || !output || reduceMotion || commands.length === 0) return;

      const current = commands[commandIndex];
      output.textContent = current.slice(0, charIndex);

      if (!deleting && charIndex > current.length) {
        window.setTimeout(() => {
          deleting = true;
          tick();
        }, 1400);
        return;
      }

      if (!deleting && charIndex <= current.length) {
        charIndex += 1;
      } else if (deleting && charIndex > 0) {
        charIndex -= 1;
      }

      if (deleting && charIndex === 0) {
        deleting = false;
        commandIndex = (commandIndex + 1) % commands.length;
      }

      window.setTimeout(tick, deleting ? 48 : 92);
    };

    tick();

    const stopConsoleTyping = () => {
      window.clearTimeout(terminalTypingTimer);
      terminalTypingTimer = 0;
    };

    const startConsoleTyping = () => {
      if (!terminalTyped || terminalTypeLines.length === 0) return;
      stopConsoleTyping();

      if (reduceMotion) {
        terminalTyped.textContent = terminalTypeLines[terminalTypeLines.length - 1];
        return;
      }

      const shuffledLines = [...terminalTypeLines].sort(() => Math.random() - 0.5);
      let lineIndex = 0;
      let letterIndex = 0;
      let isDeleting = false;

      const write = () => {
        if (!pageAlive || !isTerminalOpen) return;

        const current = shuffledLines[lineIndex];
        terminalTyped.textContent = current.slice(0, letterIndex);

        if (!isDeleting && letterIndex > current.length) {
          terminalTypingTimer = window.setTimeout(() => {
            isDeleting = true;
            write();
          }, terminalLineHoldDelay);
          return;
        }

        if (!isDeleting && letterIndex <= current.length) {
          letterIndex += 1;
        } else if (isDeleting && letterIndex > 0) {
          letterIndex -= 1;
        }

        if (isDeleting && letterIndex === 0) {
          isDeleting = false;
          lineIndex = (lineIndex + 1) % shuffledLines.length;
        }

        terminalTypingTimer = window.setTimeout(write, isDeleting ? 32 : 68);
      };

      // 等头像滑到左侧、窗口展开后再启动输入，节奏上更像“开机完成”。
      terminalTypingTimer = window.setTimeout(write, 1180);
    };

    const openTerminalWindow = () => {
      if (!terminalShell || !terminalStage || isTerminalOpen) return;
      window.clearTimeout(terminalCloseTimer);
      terminalCloseTimer = 0;
      isTerminalOpen = true;
      terminalShell.classList.remove("is-closing");
      terminalShell.classList.add("is-opening");
      terminalHero?.classList.remove("is-terminal-closing");
      terminalHero?.classList.add("is-terminal-open");
      terminalStage.classList.remove("is-closing");
      terminalStage.classList.remove("is-open");
      terminalStage.classList.add("is-open");
      terminalStage.setAttribute("aria-hidden", "false");
      terminal.setAttribute("aria-expanded", "true");
      if ("inert" in terminalStage) terminalStage.inert = false;
      else terminalStage.removeAttribute("inert");
      if (terminalTyped) terminalTyped.textContent = "";
      startConsoleTyping();
      window.setTimeout(() => {
        if (!isTerminalOpen) return;
        terminalShell.classList.remove("is-opening");
        terminalShell.classList.add("is-open");
      }, reduceMotion ? 0 : 260);
      window.setTimeout(() => terminalAvatar?.focus({ preventScroll: true }), reduceMotion ? 0 : 980);
    };

    const closeTerminalWindow = () => {
      if (!terminalShell || !terminalStage || !isTerminalOpen) return;
      isTerminalOpen = false;
      stopConsoleTyping();
      window.clearTimeout(terminalCloseTimer);
      terminalShell.classList.remove("is-opening");
      terminalShell.classList.remove("is-open");
      terminalShell.classList.add("is-closing");
      terminalHero?.classList.remove("is-terminal-open");
      terminalHero?.classList.add("is-terminal-closing");
      terminalStage.classList.remove("is-open");
      terminalStage.classList.add("is-closing");
      terminal.setAttribute("aria-expanded", "false");
      terminalCloseTimer = window.setTimeout(
        () => {
          terminalCloseTimer = 0;
          if (isTerminalOpen) return;
          terminalShell.classList.remove("is-closing");
          terminalHero?.classList.remove("is-terminal-closing");
          terminalStage.classList.remove("is-closing");
          terminalStage.setAttribute("aria-hidden", "true");
          if ("inert" in terminalStage) terminalStage.inert = true;
          else terminalStage.setAttribute("inert", "");
          if (terminalTyped) terminalTyped.textContent = "";
          terminal.focus({ preventScroll: true });
        },
        reduceMotion ? 0 : 240,
      );
    };

    terminal.addEventListener("click", openTerminalWindow);
    terminal.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTerminalWindow();
    });

    onPage(document, "keydown", (event) => {
      if (event.key === "Escape") closeTerminalWindow();
    });

    onPage(document, "contextmenu", (event) => {
      if (!isTerminalOpen) return;
      event.preventDefault();
      event.stopPropagation();
      closeTerminalWindow();
      showCursorToast("右键偷偷溜回首页啦", event.clientX, event.clientY);
    }, true);

    addPageCleanup(() => {
      isTerminalOpen = false;
      stopConsoleTyping();
      window.clearTimeout(terminalCloseTimer);
    });

    terminalAvatar?.addEventListener("click", () => {
      bubbleIndex = (bubbleIndex + 1 + Math.floor(Math.random() * (terminalBubbleTexts.length - 1))) % terminalBubbleTexts.length;
      if (terminalBubble) {
        terminalBubble.textContent = terminalBubbleTexts[bubbleIndex];
        terminalBubble.classList.remove("is-pop");
        void terminalBubble.offsetWidth;
        terminalBubble.classList.add("is-pop");
      }

      terminalAvatar.classList.remove("is-shaking");
      void terminalAvatar.offsetWidth;
      terminalAvatar.classList.add("is-shaking");
    });
  }

  const dialog = document.querySelector("[data-announcement-dialog]");
  const openButton = document.querySelector("[data-announcement-open]");
  openButton?.addEventListener("click", () => {
    if (dialog instanceof HTMLDialogElement) dialog.showModal();
  });

  const runtimeNode = document.querySelector("[data-site-runtime]");
  if (runtimeNode && !runtimeNode.dataset.ariaRuntimeReady) {
    runtimeNode.dataset.ariaRuntimeReady = "true";
    const runtimeStart = new Date(runtimeNode.dataset.runtimeStart || "2026-05-21T00:00:00+08:00").getTime();

    const syncRuntime = () => {
      const distance = Math.max(0, Date.now() - runtimeStart);
      const days = Math.ceil(distance / (1000 * 60 * 60 * 24));
      runtimeNode.textContent = `${days} 天`;
    };

    syncRuntime();
    window.setInterval(syncRuntime, 1000 * 60 * 60);
  }

  const sideTools = document.querySelector("[data-side-tools]");
  const consoleTrigger = document.querySelector("[data-console-trigger]");
  if (sideTools && consoleTrigger && !sideTools.dataset.ariaConsoleReady) {
    sideTools.dataset.ariaConsoleReady = "true";
    const sideConsole = sideTools.querySelector("[data-side-console]");

    const syncConsoleState = () => {
      const pinned = sideTools.classList.contains("is-pinned");
      consoleTrigger.setAttribute("aria-expanded", String(pinned));
      sideConsole?.setAttribute("aria-hidden", String(!pinned));
      if (sideConsole && "inert" in sideConsole) sideConsole.inert = !pinned;
    };

    const setPinnedConsole = (open) => {
      // 只通过点击书签打开完整控制台，避免鼠标经过时误触展开。
      sideTools.classList.toggle("is-pinned", open);
      syncConsoleState();
      window.localStorage?.setItem("aria-console-pinned", String(open));
    };

    const togglePinnedConsole = () => {
      setPinnedConsole(!sideTools.classList.contains("is-pinned"));
    };

    let pointerHandled = false;
    consoleTrigger.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      // 收起态按钮获得焦点会让抽屉先位移，改用 pointerdown 提前处理，避免 click 落空。
      event.preventDefault();
      pointerHandled = true;
      togglePinnedConsole();
      window.setTimeout(() => {
        pointerHandled = false;
      }, 360);
    });

    consoleTrigger.addEventListener("click", (event) => {
      if (pointerHandled) {
        event.preventDefault();
        pointerHandled = false;
        return;
      }

      togglePinnedConsole();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (sideTools.classList.contains("is-pinned")) setPinnedConsole(false);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!sideTools.classList.contains("is-pinned")) return;
      if (sideTools.contains(event.target)) return;
      setPinnedConsole(false);
    });

    setPinnedConsole(window.localStorage?.getItem("aria-console-pinned") === "true");
    syncConsoleState();
  }

  const musicRoot = document.querySelector("[data-music-root]");
  const musicPlayer = document.querySelector("[data-music-player]");
  if (musicRoot && musicPlayer && !musicRoot.dataset.ariaMusicReady) {
    musicRoot.dataset.ariaMusicReady = "true";
    const musicConfig = musicPlayer.querySelector("[data-music-config]");
    const audio = musicPlayer.querySelector("[data-music-audio]");
    const toggles = [...musicRoot.querySelectorAll("[data-music-toggle]")];
    const prevButton = musicPlayer.querySelector("[data-music-prev]");
    const nextButton = musicPlayer.querySelector("[data-music-next]");
    const sourceToggle = musicPlayer.querySelector("[data-music-source-toggle]");
    const sourcePanel = musicPlayer.querySelector("[data-music-source-panel]");
    const sourceHint = musicPlayer.querySelector("[data-music-source-hint]");
    const playlistToggle = musicPlayer.querySelector("[data-music-list-toggle]");
    const playlistPanel = musicPlayer.querySelector("[data-music-list-panel]");
    const modeButtons = [...musicPlayer.querySelectorAll("[data-music-mode]")];
    const titleNodes = [...musicRoot.querySelectorAll("[data-music-title]")];
    const artistNodes = [...musicRoot.querySelectorAll("[data-music-artist]")];
    const countNodes = [...musicRoot.querySelectorAll("[data-music-count]")];
    const coverNodes = [...musicRoot.querySelectorAll("[data-music-cover]")];
    const currentNodes = [...musicRoot.querySelectorAll("[data-music-current]")];
    const durationNodes = [...musicRoot.querySelectorAll("[data-music-duration]")];
    const lyricNodes = [...musicRoot.querySelectorAll("[data-music-lyric]")];
    const progress = musicPlayer.querySelector("[data-music-progress]");
    const volume = musicPlayer.querySelector("[data-music-volume]");
    const localTracks = [...musicPlayer.querySelectorAll("[data-music-track]")].map((track) => ({
      src: track.dataset.src || "",
      title: track.dataset.title || track.textContent?.trim() || "Untitled",
      artist: track.dataset.artist || "Aria-7th Lab",
      cover: track.dataset.cover || "",
      lyric: track.dataset.lyric || "",
      node: track,
    }));
    const trackList = musicPlayer.querySelector("[data-music-list]");
    const modeStorageKey = "aria-music-mode";
    const playbackStorageKey = "aria-music-playback-state";
    const defaultMode = musicConfig?.dataset.defaultMode || "local";
    const metingConfig = {
      api: musicConfig?.dataset.metingApi || "",
      server: musicConfig?.dataset.metingServer || "netease",
      type: musicConfig?.dataset.metingType || "playlist",
      id: musicConfig?.dataset.metingId || "",
    };
    const sourceHints = {
      local: "当前使用旧版博客中的本地曲目。",
      meting: "当前使用旧版博客的 Meting 歌单源。",
    };
    const sourceLoadingHints = {
      meting: "正在读取旧版博客的 Meting 歌单...",
    };
    const sourceFallbackHint = "Meting 暂时没有返回可播放音源，已切回本地曲目。";
    const allowedModes = new Set(["local", "meting"]);
    let tracks = localTracks;
    let activeMode = window.localStorage?.getItem(modeStorageKey) || defaultMode;
    if (!allowedModes.has(activeMode)) activeMode = "local";
    const storedPlayback = (() => {
      try {
        const payload = JSON.parse(window.localStorage?.getItem(playbackStorageKey) || "{}");
        return payload && typeof payload === "object" ? payload : {};
      } catch {
        return {};
      }
    })();
    if (allowedModes.has(storedPlayback.mode)) activeMode = storedPlayback.mode;
    const storedTrack = Number(window.localStorage?.getItem(`aria-music-track:${activeMode}`));
    const storedPlaybackIndex = Number(storedPlayback.index);
    const initialTrack = Number.isInteger(storedPlaybackIndex)
      ? storedPlaybackIndex
      : Number.isInteger(storedTrack)
        ? storedTrack
        : 0;
    let activeIndex = Math.max(0, initialTrack);
    let isSeeking = false;
    let metingLoaded = false;
    let metingLoading = false;
    let metingTracks = [];
    let sourceNotice = "";
    let lyricEntries = [];
    let activeLyricIndex = -1;
    let lyricRequestId = 0;
    let pendingRestoreTime = Number(storedPlayback.currentTime) || 0;
    let shouldResumePlayback = storedPlayback.playing === true;

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds)) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const rest = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
      return `${minutes}:${rest}`;
    };

    const firstText = (...values) => {
      const value = values.find((item) => typeof item === "string" && item.trim());
      return value?.trim() || "";
    };

    const setLyricText = (text) => {
      lyricNodes.forEach((node) => {
        node.textContent = text;
      });
    };

    const parseLrcTime = (value) => {
      const match = value.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || "0").padEnd(3, "0"));
      return minutes * 60 + seconds + fraction / 1000;
    };

    const isLyricCreditLine = (text) =>
      /^(作词|作曲|编曲|制作人|监制|混音|母带|录音|和声|词|曲|arranged|composer|lyricist|producer|vocal|guitar|bass|drum|piano|strings|mixed|mastered)\s*[:：]/i.test(text);

    const parseLrc = (text) =>
      text
        .split(/\r?\n/)
        .flatMap((line) => {
          const times = [...line.matchAll(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g)]
            .map((match) => parseLrcTime(match[1]))
            .filter((time) => time !== null);
          const lyric = line.replace(/\[[^\]]+\]/g, "").trim();
          if (!times.length || !lyric || isLyricCreditLine(lyric)) return [];
          return times.map((time) => ({ time, text: lyric }));
        })
        .sort((a, b) => a.time - b.time);

    const fetchLyricText = async (lyricSource) => {
      if (!lyricSource) return "";
      if (/^\s*\[/.test(lyricSource)) return lyricSource;
      const response = await fetch(lyricSource);
      const buffer = await response.arrayBuffer();
      return new TextDecoder("utf-8").decode(buffer);
    };

    const syncLyric = (currentTime) => {
      if (!lyricEntries.length) return;
      let nextIndex = -1;
      for (let index = lyricEntries.length - 1; index >= 0; index -= 1) {
        if (currentTime >= lyricEntries[index].time) {
          nextIndex = index;
          break;
        }
      }

      if (nextIndex === activeLyricIndex) return;
      activeLyricIndex = nextIndex;
      setLyricText(nextIndex >= 0 ? lyricEntries[nextIndex].text : "歌词准备中...");
    };

    const loadLyrics = async (track) => {
      const requestId = lyricRequestId + 1;
      lyricRequestId = requestId;
      lyricEntries = [];
      activeLyricIndex = -1;

      if (!track.lyric) {
        setLyricText("这首歌暂时没有歌词。");
        return;
      }

      setLyricText("歌词读取中...");
      try {
        const lyricText = await fetchLyricText(track.lyric);
        if (requestId !== lyricRequestId) return;
        lyricEntries = parseLrc(lyricText);
        activeLyricIndex = -2;
        if (lyricEntries.length) syncLyric(audio instanceof HTMLAudioElement ? audio.currentTime : 0);
        else setLyricText("这首歌暂时没有逐行歌词。");
      } catch {
        if (requestId !== lyricRequestId) return;
        setLyricText("歌词暂时加载失败。");
      }
    };

    const buildMetingUrl = () => {
      if (!metingConfig.api || !metingConfig.id) return "";
      return metingConfig.api
        .replace(":server", encodeURIComponent(metingConfig.server))
        .replace(":type", encodeURIComponent(metingConfig.type))
        .replace(":id", encodeURIComponent(metingConfig.id))
        .replace(":r", String(Date.now()));
    };

    const renderTrackButtons = () => {
      if (!trackList) return;
      trackList.innerHTML = "";
      tracks.forEach((track, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.musicTrack = "";
        button.dataset.src = track.src;
        button.dataset.title = track.title;
        button.dataset.artist = track.artist;
        button.dataset.cover = track.cover;
        button.dataset.lyric = track.lyric;
        button.textContent = track.title;
        button.classList.toggle("is-active", index === activeIndex);
        button.addEventListener("click", () => {
          const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
          loadTrack(index, shouldPlay, true);
        });
        trackList.append(button);
        track.node = button;
      });
    };

    const syncModeUi = () => {
      musicPlayer.dataset.musicMode = activeMode;
      if (sourceHint) sourceHint.textContent = sourceNotice || sourceHints[activeMode] || "";
      modeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.musicMode === activeMode);
      });
    };

    const syncPlayingState = () => {
      const playing = audio instanceof HTMLAudioElement && !audio.paused && !audio.ended;
      musicPlayer.classList.toggle("is-playing", playing);
      musicRoot.classList.toggle("is-music-playing", playing);
      toggles.forEach((button) => button.setAttribute("aria-label", playing ? "暂停" : "播放"));
    };

    const savePlaybackState = () => {
      if (!(audio instanceof HTMLAudioElement)) return;
      // 全站播放器会随页面切换重新挂载，这里保存最小播放现场，下一页可以接着恢复。
      window.localStorage?.setItem(
        playbackStorageKey,
        JSON.stringify({
          mode: activeMode,
          index: activeIndex,
          currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
          playing: !audio.paused && !audio.ended,
          updatedAt: Date.now(),
        }),
      );
    };

    const loadTrack = (index, shouldPlay = false, shouldLoad = true) => {
      if (!(audio instanceof HTMLAudioElement) || tracks.length === 0) return;
      activeIndex = (index + tracks.length) % tracks.length;
      const track = tracks[activeIndex];
      const src = track.src || "";

      titleNodes.forEach((node) => {
        node.textContent = track.title || "Untitled";
      });
      artistNodes.forEach((node) => {
        node.textContent = track.artist || "Aria-7th Lab";
      });
      countNodes.forEach((node) => {
        node.textContent = `${activeIndex + 1} / ${tracks.length}`;
      });
      coverNodes.forEach((node) => {
        const cover = track.cover || "";
        node.classList.toggle("has-cover", Boolean(cover));
        if (cover) node.style.setProperty("--music-cover-image", `url("${cover}")`);
        else node.style.removeProperty("--music-cover-image");
      });
      loadLyrics(track);
      tracks.forEach((item) => item.node?.classList.toggle("is-active", item === track));
      window.localStorage?.setItem(`aria-music-track:${activeMode}`, String(activeIndex));

      // 初始渲染只同步曲目信息；用户点击播放或切歌后才请求音频资源，减轻首页首屏负担。
      if (shouldLoad && audio.getAttribute("src") !== src) {
        audio.src = src;
        if (!shouldPlay) audio.load();
        if (progress instanceof HTMLInputElement) progress.value = "0";
        currentNodes.forEach((node) => {
          node.textContent = "0:00";
        });
        durationNodes.forEach((node) => {
          node.textContent = "0:00";
        });
      }

      if (shouldPlay) {
        audio.play().catch(() => {
          shouldResumePlayback = false;
          savePlaybackState();
          syncPlayingState();
        });
      }
    };

    const fetchMetingTracks = async () => {
      if (metingLoaded) {
        tracks = metingTracks;
        activeIndex = Number(window.localStorage?.getItem("aria-music-track:meting")) || 0;
        renderTrackButtons();
        loadTrack(activeIndex, false, false);
        sourceNotice = "";
        syncModeUi();
        return true;
      }
      if (metingLoading) return false;
      const url = buildMetingUrl();
      if (!url) return false;
      metingLoading = true;
      sourceNotice = "";
      musicPlayer.classList.add("is-source-loading");
      if (sourceHint) sourceHint.textContent = sourceLoadingHints.meting;
      try {
        const response = await fetch(url);
        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : [];
        const mappedTracks = list
          .map((item) => ({
            src: item.url || "",
            title: firstText(item.title, item.name, item.songname) || "Untitled",
            artist: firstText(item.author, item.artist, item.artistname) || "Aria-7th Lab",
            cover: firstText(item.pic, item.cover, item.picture),
            lyric: firstText(item.lrc, item.lyric),
            node: null,
          }))
          .filter((item) => item.src);
        if (mappedTracks.length) {
          metingTracks = mappedTracks;
          tracks = metingTracks;
          activeIndex = Number(window.localStorage?.getItem("aria-music-track:meting")) || 0;
          metingLoaded = true;
          sourceNotice = "";
          renderTrackButtons();
          loadTrack(activeIndex, false, false);
          return true;
        } else {
          sourceNotice = sourceFallbackHint;
          activeMode = "local";
          tracks = localTracks;
          renderTrackButtons();
          syncModeUi();
          loadTrack(0, false, false);
          return false;
        }
      } catch {
        sourceNotice = sourceFallbackHint;
        activeMode = "local";
        tracks = localTracks;
        renderTrackButtons();
        syncModeUi();
        loadTrack(0, false, false);
        return false;
      } finally {
        metingLoading = false;
        musicPlayer.classList.remove("is-source-loading");
        if (activeMode === "meting" && !sourceNotice && sourceHint) {
          sourceHint.textContent = sourceHints.meting;
        }
      }
    };

    const setMusicMode = async (mode) => {
      if (!(audio instanceof HTMLAudioElement)) return;
      if (mode === activeMode) return;
      audio.pause();
      audio.removeAttribute("src");
      sourceNotice = "";
      tracks = mode === "meting" ? tracks : localTracks;
      activeMode = mode;
      window.localStorage?.setItem(modeStorageKey, activeMode);

      if (activeMode === "meting") {
        const loaded = await fetchMetingTracks();
        if (!loaded) window.localStorage?.setItem(modeStorageKey, activeMode);
      } else {
        tracks = localTracks;
        activeIndex = Number(window.localStorage?.getItem("aria-music-track:local")) || 0;
        renderTrackButtons();
        loadTrack(activeIndex, false, false);
      }

      syncModeUi();
      syncPlayingState();
    };

    const updateProgress = () => {
      if (!(audio instanceof HTMLAudioElement)) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      currentNodes.forEach((node) => {
        node.textContent = formatTime(audio.currentTime);
      });
      durationNodes.forEach((node) => {
        node.textContent = formatTime(duration);
      });
      if (progress instanceof HTMLInputElement && !isSeeking) {
        progress.value = duration > 0 ? String((audio.currentTime / duration) * 100) : "0";
      }
      syncLyric(audio.currentTime);
      savePlaybackState();
    };

    toggles.forEach((button) => button.addEventListener("click", () => {
      if (!(audio instanceof HTMLAudioElement)) return;

      if (audio.paused) {
        if (!audio.getAttribute("src")) {
          loadTrack(activeIndex, true, true);
        } else {
          audio.play().catch(() => {
            syncPlayingState();
          });
        }
      } else {
        audio.pause();
      }
    }));

    prevButton?.addEventListener("click", () => {
      const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
      loadTrack(activeIndex - 1, shouldPlay);
    });

    nextButton?.addEventListener("click", () => {
      const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
      loadTrack(activeIndex + 1, shouldPlay);
    });

    sourceToggle?.addEventListener("click", () => {
      if (!sourcePanel) return;
      const isHidden = sourcePanel.hasAttribute("hidden");
      sourcePanel.toggleAttribute("hidden", !isHidden);
      sourceToggle.setAttribute("aria-expanded", String(isHidden));
    });

    const setPlaylistOpen = (open) => {
      if (!playlistToggle || !playlistPanel) return;
      window.clearTimeout(Number(playlistPanel.dataset.closeTimer || 0));
      playlistToggle.setAttribute("aria-expanded", String(open));
      window.localStorage?.setItem("aria-music-playlist-open", String(open));

      if (open) {
        playlistPanel.hidden = false;
        window.requestAnimationFrame(() => {
          playlistPanel.classList.add("is-open");
        });
        return;
      }

      playlistPanel.classList.remove("is-open");
      const closeTimer = window.setTimeout(() => {
        if (playlistToggle.getAttribute("aria-expanded") === "true") return;
        playlistPanel.hidden = true;
      }, reduceMotion ? 0 : 220);
      playlistPanel.dataset.closeTimer = String(closeTimer);
    };

    playlistToggle?.addEventListener("click", () => {
      setPlaylistOpen(playlistToggle.getAttribute("aria-expanded") !== "true");
    });

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setMusicMode(button.dataset.musicMode || "local");
      });
    });

    progress?.addEventListener("input", () => {
      isSeeking = true;
      if (!(audio instanceof HTMLAudioElement) || !(progress instanceof HTMLInputElement)) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration > 0) {
        currentNodes.forEach((node) => {
          node.textContent = formatTime((Number(progress.value) / 100) * duration);
        });
      }
    });

    progress?.addEventListener("change", () => {
      if (!(audio instanceof HTMLAudioElement) || !(progress instanceof HTMLInputElement)) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration > 0) audio.currentTime = (Number(progress.value) / 100) * duration;
      isSeeking = false;
      updateProgress();
    });

    volume?.addEventListener("input", () => {
      if (audio instanceof HTMLAudioElement && volume instanceof HTMLInputElement) {
        audio.volume = Number(volume.value);
        window.localStorage?.setItem("aria-music-volume", volume.value);
      }
    });

    audio?.addEventListener("play", syncPlayingState);
    audio?.addEventListener("play", savePlaybackState);
    audio?.addEventListener("pause", () => {
      syncPlayingState();
      savePlaybackState();
    });
    audio?.addEventListener("ended", () => loadTrack(activeIndex + 1, true));
    audio?.addEventListener("loadedmetadata", () => {
      if (audio instanceof HTMLAudioElement && pendingRestoreTime > 0) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        audio.currentTime = duration > 0 ? Math.min(pendingRestoreTime, Math.max(0, duration - 0.4)) : pendingRestoreTime;
        pendingRestoreTime = 0;
      }
      updateProgress();
    });
    audio?.addEventListener("timeupdate", updateProgress);
    window.addEventListener("pagehide", savePlaybackState);

    if (audio instanceof HTMLAudioElement && volume instanceof HTMLInputElement) {
      const storedVolume = window.localStorage?.getItem("aria-music-volume");
      if (storedVolume !== null) volume.value = storedVolume;
      audio.volume = Number(volume.value);
    }
    renderTrackButtons();
    setPlaylistOpen(window.localStorage?.getItem("aria-music-playlist-open") === "true");
    syncModeUi();
    if (activeMode === "meting") {
      fetchMetingTracks().finally(() => {
        if (tracks.length) loadTrack(activeIndex, shouldResumePlayback, shouldResumePlayback);
      });
    } else {
      loadTrack(activeIndex, shouldResumePlayback, shouldResumePlayback);
    }
    syncPlayingState();
  }

  const scrollRail = document.querySelector("[data-scroll-rail]");
  if (scrollRail) {
    // 滚动提示条只暴露一个 CSS 变量，视觉如何表现交给样式层，避免 JS 直接操作布局细节。
    const updateScrollRail = () => {
      const maxScroll = homeLayerStage
        ? homeLayerStage.parentElement?.scrollHeight - window.innerHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      scrollRail.style.setProperty("--scroll-progress", progress.toFixed(3));
    };

    updateScrollRail();
    onPage(window, "scroll", updateScrollRail, { passive: true });
    onPage(window, "resize", updateScrollRail);
  }

  const blogFilter = document.querySelector("[data-blog-filter]");
  if (blogFilter) {
    const topicToggle = blogFilter.querySelector("[data-blog-topic-toggle]");
    const topicToggleLabel = blogFilter.querySelector("[data-blog-topic-toggle-label]");
    const filterButtons = [...blogFilter.querySelectorAll("[data-blog-topic-filter]")];
    const postCards = [...document.querySelectorAll("[data-post-card]")];
    const countNode = blogFilter.querySelector("[data-blog-filter-count]");
    const topicExpandStorageKey = "aria-blog-topics-expanded";

    const setTopicsExpanded = (expanded) => {
      blogFilter.classList.toggle("is-expanded", expanded);
      topicToggle?.setAttribute("aria-expanded", String(expanded));
      if (topicToggleLabel) topicToggleLabel.textContent = expanded ? "收起" : "展开全部";
      window.localStorage?.setItem(topicExpandStorageKey, String(expanded));
    };

    const syncTopicFilter = (topic, shouldUpdateUrl = true) => {
      const selectedTopic = filterButtons.some((button) => button.dataset.blogTopicFilter === topic) ? topic : "all";
      let visibleCount = 0;

      filterButtons.forEach((button) => {
        const active = button.dataset.blogTopicFilter === selectedTopic;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });

      postCards.forEach((card) => {
        const visible = selectedTopic === "all" || card.dataset.postCategory === selectedTopic;
        card.classList.toggle("is-filter-hidden", !visible);
        if (visible) visibleCount += 1;
      });

      if (countNode) countNode.textContent = String(visibleCount);

      if (shouldUpdateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.delete("tag");
        if (selectedTopic === "all") url.searchParams.delete("topic");
        else url.searchParams.set("topic", selectedTopic);
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        syncTopicFilter(button.dataset.blogTopicFilter || "all");
      });
    });

    topicToggle?.addEventListener("click", () => {
      setTopicsExpanded(!blogFilter.classList.contains("is-expanded"));
    });

    setTopicsExpanded(window.localStorage?.getItem(topicExpandStorageKey) === "true");
    const params = new URLSearchParams(window.location.search);
    syncTopicFilter(params.get("topic") || params.get("tag") || "all", false);
  }

  const articleFrame = document.querySelector("[data-article-frame]");
  if (articleFrame) {
    const modeButtons = [...articleFrame.querySelectorAll("[data-article-mode]")];
    const opacityInput = articleFrame.querySelector("[data-article-opacity]");
    const opacityValue = articleFrame.querySelector("[data-article-opacity-value]");
    const progress = articleFrame.querySelector("[data-article-progress]");
    const progressValue = articleFrame.querySelector("[data-article-progress-value]");
    const tocLinks = [...articleFrame.querySelectorAll(".article-toc-list a[href^='#']")];
    const headingTargets = tocLinks
      .map((link) => {
        const href = link.getAttribute("href");
        if (!href || href === "#") return null;
        return {
          link,
          item: link.closest("li"),
          heading: document.getElementById(decodeURIComponent(href.slice(1))),
        };
      })
      .filter((entry) => entry?.heading);
    const modes = new Set(["acrylic", "glass"]);
    const storageKey = "aria-article-view-mode";
    const opacityStorageKey = "aria-article-acrylic-opacity";

    const applyArticleOpacity = (value) => {
      const opacity = Math.min(78, Math.max(30, Number(value) || 58));
      articleFrame.style.setProperty("--article-acrylic-opacity", (opacity / 100).toFixed(2));
      if (opacityInput instanceof HTMLInputElement) opacityInput.value = String(opacity);
      if (opacityValue) opacityValue.textContent = `${opacity}%`;
      window.localStorage?.setItem(opacityStorageKey, String(opacity));
    };

    const applyArticleMode = (mode) => {
      const nextMode = modes.has(mode) ? mode : "acrylic";
      articleFrame.classList.toggle("is-article-acrylic", nextMode === "acrylic");
      articleFrame.classList.toggle("is-article-glass", nextMode === "glass");
      articleFrame.dataset.articleActiveMode = nextMode;
      modeButtons.forEach((button) => {
        const active = button.dataset.articleMode === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      window.localStorage?.setItem(storageKey, nextMode);
    };

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyArticleMode(button.dataset.articleMode || "acrylic");
      });
    });

    opacityInput?.addEventListener("input", () => {
      if (!(opacityInput instanceof HTMLInputElement)) return;
      applyArticleOpacity(opacityInput.value);
      applyArticleMode("acrylic");
    });

    applyArticleOpacity(window.localStorage?.getItem(opacityStorageKey) || "58");
    applyArticleMode(window.localStorage?.getItem(storageKey) || "acrylic");

    if (progress) {
      const syncArticleProgress = () => {
        const start = articleFrame.offsetTop;
        const end = start + articleFrame.scrollHeight - window.innerHeight;
        const ratio = end > start ? Math.min(Math.max((window.scrollY - start) / (end - start), 0), 1) : 0;
        const percent = Math.round(ratio * 100);
        progress.style.setProperty("--article-progress", ratio.toFixed(3));
        if (progressValue) progressValue.textContent = `${percent}%`;

        if (headingTargets.length) {
          let active = headingTargets[0];
          for (const entry of headingTargets) {
            if (entry.heading.getBoundingClientRect().top <= 140) active = entry;
            else break;
          }
          headingTargets.forEach((entry) => {
            entry.item?.classList.toggle("is-active", entry === active);
          });
        }
      };

      syncArticleProgress();
      onPage(window, "scroll", syncArticleProgress, { passive: true });
      onPage(window, "resize", syncArticleProgress);
    }
  }

  const heroSection = homeLayerStage ? null : document.querySelector(".hero-section");
  if (heroSection) {
    // 首屏固定工具只服务主视觉；滚入个人标签页后收起，避免第二屏被首页元素覆盖。
    const updateHeroState = () => {
      const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
      document.body.classList.toggle("is-past-hero", window.scrollY > heroBottom - 80);
    };

    updateHeroState();
    onPage(window, "scroll", updateHeroState, { passive: true });
    onPage(window, "resize", updateHeroState);
  }

  const physicsTags = document.querySelector("[data-physics-tags]");
  if (physicsTags && !reduceMotion && window.matchMedia("(min-width: 720px)").matches) {
    const tagItems = [...physicsTags.querySelectorAll(".personal-tag")];
    let bodies = [];
    let animationId = 0;
    let lastTime = 0;
    let startedAt = 0;
    let settleSince = 0;
    let started = false;
    let resizeTimer = 0;
    const maxAngle = (7 * Math.PI) / 180;
    const tagSlots = [
      [0.12, 0.28, -9],
      [0.18, 0.72, -20],
      [0.27, 0.48, 16],
      [0.35, 0.66, 1],
      [0.43, 0.56, -7],
      [0.51, 0.76, 10],
      [0.59, 0.52, 5],
      [0.67, 0.7, -12],
      [0.75, 0.48, 8],
      [0.82, 0.64, -13],
      [0.9, 0.78, 2],
      [0.7, 0.32, 14],
      [0.31, 0.82, -7],
      [0.52, 0.36, -3],
    ];

    // 胶囊标签的物理效果是装饰层：链接仍是原来的 a 标签，物理坐标只控制视觉位置。
    const setupBodies = () => {
      const bounds = physicsTags.getBoundingClientRect();
      physicsTags.classList.add("is-physics");
      physicsTags.classList.remove("is-settled");

      bodies = tagItems.map((tag, index) => {
        const width = tag.offsetWidth;
        const height = tag.offsetHeight;
        const [slotX, slotY, slotAngle] = tagSlots[index % tagSlots.length];
        const targetX = bounds.width * slotX - width / 2;
        const targetY = bounds.height * slotY - height / 2;
        const angle = (slotAngle * Math.PI) / 180;
        const maxX = Math.max(18, bounds.width - width - 18);
        const maxY = Math.max(34, bounds.height - height - 28);

        return {
          el: tag,
          width,
          height,
          x: Math.max(18, Math.min(maxX, targetX + Math.sin(index * 2.17) * 34)),
          y: -height - index * 30,
          targetX: Math.max(18, Math.min(maxX, targetX)),
          targetY: Math.max(34, Math.min(maxY, targetY)),
          vx: Math.sin(index * 1.73) * 1.2,
          vy: 3 + index * 0.05,
          angle: angle - Math.sign(angle || 1) * 0.08,
          targetAngle: angle,
          angularVelocity: Math.sin(index * 0.91) * 0.004,
          mass: Math.max(1, width / 120),
        };
      });
    };

    const renderBodies = () => {
      bodies.forEach((body) => {
        body.el.style.transform = `translate3d(${body.x}px, ${body.y}px, 0) rotate(${body.angle}rad)`;
      });
    };

    const step = (time) => {
      const bounds = physicsTags.getBoundingClientRect();
      const dt = Math.min((time - lastTime) / 16.67 || 1, 2);
      lastTime = time;

      bodies.forEach((body) => {
        const minY = 8;
        const maxY = Math.max(minY, bounds.height - body.height - 12);
        const spring = body.y < body.targetY ? 0.018 : 0.075;
        body.vx += (body.targetX - body.x) * 0.012 * dt;
        body.vy += (body.targetY - body.y) * spring * dt;
        body.vx *= 0.86;
        body.vy *= 0.86;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angularVelocity += (body.targetAngle - body.angle) * 0.01 * dt;
        body.angularVelocity *= 0.84;
        body.angle += body.angularVelocity * dt;

        if (body.angle > maxAngle || body.angle < -maxAngle) {
          body.angle = Math.max(-maxAngle, Math.min(maxAngle, body.angle));
          body.angularVelocity *= -0.28;
        }

        if (body.x < 16) {
          body.x = 16;
          body.vx = Math.abs(body.vx) * 0.62;
          body.angularVelocity *= -0.7;
        }

        if (body.x + body.width > bounds.width - 16) {
          body.x = bounds.width - body.width - 16;
          body.vx = -Math.abs(body.vx) * 0.62;
          body.angularVelocity *= -0.7;
        }

        // 碰撞分离可能把标签挤出容器上下边界，边界回弹能避免静止后看起来突然“飞走”。
        if (body.y < minY) {
          body.y = minY;
          body.vy = Math.abs(body.vy) * 0.48;
          body.angularVelocity *= -0.48;
        }

        if (body.y > maxY) {
          body.y = maxY;
          body.vy = -Math.abs(body.vy) * 0.5;
          body.angularVelocity *= -0.52;
        }
      });

      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i];
          const b = bodies[j];
          const ax = a.x + a.width / 2;
          const ay = a.y + a.height / 2;
          const bx = b.x + b.width / 2;
          const by = b.y + b.height / 2;
          const minX = (a.width + b.width) / 2 + 8;
          const minY = (a.height + b.height) / 2 + 8;
          const dx = bx - ax;
          const dy = by - ay;

          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const overlapX = minX - Math.abs(dx);
            const overlapY = minY - Math.abs(dy);

            if (overlapX < overlapY) {
              const push = (overlapX / 2) * Math.sign(dx || 1);
              a.x -= push * 0.38;
              b.x += push * 0.38;
              const impulse = (b.vx - a.vx) * 0.16;
              a.vx += impulse;
              b.vx -= impulse;
            } else {
              const push = (overlapY / 2) * Math.sign(dy || 1);
              a.y -= push * 0.34;
              b.y += push * 0.34;
              const impulse = (b.vy - a.vy) * 0.14;
              a.vy += impulse;
              b.vy -= impulse;
            }

            [a, b].forEach((body) => {
              const maxY = Math.max(8, bounds.height - body.height - 12);
              body.y = Math.max(8, Math.min(maxY, body.y));
            });
            a.angularVelocity -= 0.0003 * Math.sign(dx || 1);
            b.angularVelocity += 0.0003 * Math.sign(dx || 1);
          }
        }
      }

      renderBodies();

      const settled = bodies.every(
        (body) =>
          Math.abs(body.targetX - body.x) < 2 &&
          Math.abs(body.targetY - body.y) < 2 &&
          Math.abs(body.vy) < 0.18 &&
          Math.abs(body.vx) < 0.18,
      );
      if (settled) {
        settleSince ||= time;
      } else {
        settleSince = 0;
      }

      if ((settleSince && time - settleSince > 900) || (startedAt && time - startedAt > 5200)) {
        freezeBodies();
        return;
      }

      animationId = window.requestAnimationFrame(step);
    };

    const startPhysics = () => {
      if (started) return;
      started = true;
      setupBodies();
      renderBodies();
      animationId = window.requestAnimationFrame((time) => {
        lastTime = time;
        startedAt = time;
        step(time);
      });
    };

    const freezeBodies = () => {
      bodies.forEach((body) => {
        // 静止收尾时冻结当前视觉位置，避免突然吸附到预设坐标造成跳变。
        body.vx = 0;
        body.vy = 0;
        body.angularVelocity = 0;
      });
      renderBodies();
      physicsTags.classList.add("is-settled");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startPhysics();
          observer.disconnect();
        }
      },
      { threshold: 0.24 },
    );

    observer.observe(physicsTags);
    addPageCleanup(() => {
      observer.disconnect();
      window.cancelAnimationFrame(animationId);
      window.clearTimeout(resizeTimer);
    });

    onPage(window, "resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!started) return;
        window.cancelAnimationFrame(animationId);
        settleSince = 0;
        setupBodies();
        renderBodies();
        animationId = window.requestAnimationFrame((time) => {
          lastTime = time;
          startedAt = time;
          step(time);
        });
      }, 180);
    });
  }

  const counter = document.querySelector("[data-click-counter]");
  if (counter) {
    const countNode = counter.querySelector("[data-click-count]");
    const button = counter.querySelector("[data-click-button]");
    let count = 0;

    button?.addEventListener("click", () => {
      count += 1;
      if (countNode) countNode.textContent = String(count);
    });
  }
})();
