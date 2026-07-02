(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const labFeed = document.querySelector("#lab-feed");
  if (labFeed && window.location.hash === "#lab-feed") {
    // 直达锚点时浏览器可能先按未完成的初始布局定位；等样式和首帧布局稳定后再校准一次。
    const syncInitialHash = () => {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo({ top: labFeed.offsetTop, left: 0, behavior: "auto" });
      document.documentElement.style.scrollBehavior = previousBehavior;
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncInitialHash);
    });
    window.addEventListener("load", syncInitialHash, { once: true });
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

    labFeed.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      feedPointerEvent = event;
      if (!feedPointerFrame) feedPointerFrame = window.requestAnimationFrame(syncFeedPointer);
    });
    labFeed.addEventListener("pointerleave", resetFeedPointer);
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
      if (!output || reduceMotion || commands.length === 0) return;

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
        if (!isTerminalOpen) return;

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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeTerminalWindow();
    });

    document.addEventListener("contextmenu", (event) => {
      if (!isTerminalOpen) return;
      event.preventDefault();
      event.stopPropagation();
      closeTerminalWindow();
      showCursorToast("右键偷偷溜回首页啦", event.clientX, event.clientY);
    }, true);

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

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-tool");

      if (tool === "theme") {
        document.documentElement.toggleAttribute("data-candy");
      }

      if (tool === "quiet") {
        document.documentElement.toggleAttribute("data-quiet");
      }

      if (tool === "search") {
        window.location.href = "/blog/";
      }
    });
  });

  const sideTools = document.querySelector("[data-side-tools]");
  const consoleTrigger = document.querySelector("[data-console-trigger]");
  if (sideTools && consoleTrigger) {
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
  if (musicRoot && musicPlayer) {
    const audio = musicPlayer.querySelector("[data-music-audio]");
    const toggles = [...musicRoot.querySelectorAll("[data-music-toggle]")];
    const prevButton = musicPlayer.querySelector("[data-music-prev]");
    const nextButton = musicPlayer.querySelector("[data-music-next]");
    const titleNodes = [...musicRoot.querySelectorAll("[data-music-title]")];
    const artistNodes = [...musicRoot.querySelectorAll("[data-music-artist]")];
    const countNodes = [...musicRoot.querySelectorAll("[data-music-count]")];
    const coverNodes = [...musicRoot.querySelectorAll("[data-music-cover]")];
    const currentNodes = [...musicRoot.querySelectorAll("[data-music-current]")];
    const durationNodes = [...musicRoot.querySelectorAll("[data-music-duration]")];
    const progress = musicPlayer.querySelector("[data-music-progress]");
    const volume = musicPlayer.querySelector("[data-music-volume]");
    const tracks = [...musicPlayer.querySelectorAll("[data-music-track]")];
    const storedTrack = Number(window.localStorage?.getItem("aria-music-track"));
    const initialTrack = Number.isInteger(storedTrack) ? storedTrack : tracks.findIndex((track) => track.classList.contains("is-active"));
    let activeIndex = Math.max(0, initialTrack);
    let isSeeking = false;

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds)) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const rest = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
      return `${minutes}:${rest}`;
    };

    const syncPlayingState = () => {
      const playing = audio instanceof HTMLAudioElement && !audio.paused && !audio.ended;
      musicPlayer.classList.toggle("is-playing", playing);
      musicRoot.classList.toggle("is-music-playing", playing);
      toggles.forEach((button) => button.setAttribute("aria-label", playing ? "暂停" : "播放"));
    };

    const loadTrack = (index, shouldPlay = false, shouldLoad = true) => {
      if (!(audio instanceof HTMLAudioElement) || tracks.length === 0) return;
      activeIndex = (index + tracks.length) % tracks.length;
      const track = tracks[activeIndex];
      const src = track.dataset.src || "";

      tracks.forEach((item) => item.classList.toggle("is-active", item === track));
      titleNodes.forEach((node) => {
        node.textContent = track.dataset.title || track.textContent?.trim() || "Untitled";
      });
      artistNodes.forEach((node) => {
        node.textContent = track.dataset.artist || "Aria-7th Lab";
      });
      countNodes.forEach((node) => {
        node.textContent = `${activeIndex + 1} / ${tracks.length}`;
      });
      coverNodes.forEach((node) => {
        const cover = track.dataset.cover || "";
        node.classList.toggle("has-cover", Boolean(cover));
        if (cover) node.style.setProperty("--music-cover-image", `url("${cover}")`);
        else node.style.removeProperty("--music-cover-image");
      });
      window.localStorage?.setItem("aria-music-track", String(activeIndex));

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
          syncPlayingState();
        });
      }
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

    tracks.forEach((track, index) => {
      track.addEventListener("click", () => {
        const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
        loadTrack(index, shouldPlay, true);
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
    audio?.addEventListener("pause", syncPlayingState);
    audio?.addEventListener("ended", () => loadTrack(activeIndex + 1, true));
    audio?.addEventListener("loadedmetadata", updateProgress);
    audio?.addEventListener("timeupdate", updateProgress);

    if (audio instanceof HTMLAudioElement && volume instanceof HTMLInputElement) {
      const storedVolume = window.localStorage?.getItem("aria-music-volume");
      if (storedVolume !== null) volume.value = storedVolume;
      audio.volume = Number(volume.value);
    }
    loadTrack(activeIndex, false, false);
    syncPlayingState();
  }

  const scrollRail = document.querySelector("[data-scroll-rail]");
  if (scrollRail) {
    // 滚动提示条只暴露一个 CSS 变量，视觉如何表现交给样式层，避免 JS 直接操作布局细节。
    const updateScrollRail = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      scrollRail.style.setProperty("--scroll-progress", progress.toFixed(3));
    };

    updateScrollRail();
    window.addEventListener("scroll", updateScrollRail, { passive: true });
    window.addEventListener("resize", updateScrollRail);
  }

  const heroSection = document.querySelector(".hero-section");
  if (heroSection) {
    // 首屏固定工具只服务主视觉；滚入个人标签页后收起，避免第二屏被首页元素覆盖。
    const updateHeroState = () => {
      const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
      document.body.classList.toggle("is-past-hero", window.scrollY > heroBottom - 80);
    };

    updateHeroState();
    window.addEventListener("scroll", updateHeroState, { passive: true });
    window.addEventListener("resize", updateHeroState);
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

    window.addEventListener("resize", () => {
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
