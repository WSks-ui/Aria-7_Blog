import { PageScope } from "./core/page-scope";
import { createSafeStorage } from "./core/safe-storage";
import { calculateReadingProgress } from "./core/reading-progress";
import { readLimitedText, validateMetingPayload } from "./core/media-policy";
import { RuntimeStyles } from "./core/runtime-styles";
import { buildCalendarModel, formatRelativeActivity, getRuntimeDays } from "./core/time";

const FALLBACK_COMMAND_ENTRIES = [
  { id: "page:home", kind: "page", title: "Home", description: "返回 Aria-7th Lab 首页。", href: "/", group: "页面", keywords: ["home", "首页", "主页"] },
  { id: "page:blog", kind: "page", title: "Blog", description: "浏览所有技术笔记和文章。", href: "/blog/", group: "页面", keywords: ["blog", "文章", "归档"] },
  { id: "page:works", kind: "page", title: "Works", description: "查看项目和作品列表。", href: "/works/", group: "页面", keywords: ["works", "项目", "作品"] },
  { id: "page:game", kind: "page", title: "Game", description: "打开 Aria Chess。", href: "/game/", group: "页面", keywords: ["game", "chess", "游戏"] },
  { id: "page:me", kind: "page", title: "Me", description: "查看个人介绍。", href: "/me/", group: "页面", keywords: ["me", "about", "个人"] },
];
let commandIndexPromise = null;

const fetchCommandIndex = (url) => {
  if (commandIndexPromise) return commandIndexPromise;
  commandIndexPromise = fetch(url, { credentials: "same-origin" })
    .then((response) => readLimitedText(response))
    .then((text) => JSON.parse(text))
    .then((payload) => Array.isArray(payload) ? payload : Promise.reject(new Error("检索索引格式无效")))
    .catch((error) => {
      commandIndexPromise = null;
      throw error;
    });
  return commandIndexPromise;
};

export const initInteractions = (providedScope) => {
  if (document.body.dataset.ariaInteractionsReady === "true") return;
  window.__ariaInteractionsCleanup?.();
  document.body.dataset.ariaInteractionsReady = "true";

  const scope = providedScope instanceof PageScope ? providedScope : new PageScope();
  const storage = createSafeStorage();
  const runtimeStyles = new RuntimeStyles();
  const addPageCleanup = (cleanup) => scope.add(cleanup);
  const onPage = (target, type, listener, options) => {
    scope.on(target, type, listener, options);
  };

  const cleanup = () => scope.dispose();
  window.__ariaInteractionsCleanup = cleanup;
  addPageCleanup(() => runtimeStyles.dispose());
  addPageCleanup(() => {
    document.body.removeAttribute("data-aria-interactions-ready");
    if (window.__ariaInteractionsCleanup === cleanup) delete window.__ariaInteractionsCleanup;
  });
  onPage(document, "astro:before-swap", cleanup, { once: true });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCustomCursorEnabled = () => document.documentElement.classList.contains("custom-cursor-active");
  const commandPalette = document.querySelector("[data-command-palette]");
  if (commandPalette) {
    const input = commandPalette.querySelector("[data-command-input]");
    const resultsRoot = commandPalette.querySelector("[data-command-results]");
    const template = commandPalette.querySelector("[data-command-result-template]");
    const emptyState = commandPalette.querySelector("[data-command-empty]");
    const statusNode = commandPalette.querySelector("[data-command-status]");
    const indexUrl = commandPalette.dataset.commandIndexUrl || "/search-index.json";
    const clearButton = commandPalette.querySelector("[data-command-clear]");
    const clearRecentButton = commandPalette.querySelector("[data-command-clear-recent]");
    const shortcutNode = commandPalette.querySelector("[data-command-shortcut]");
    const filterButtons = [...commandPalette.querySelectorAll("[data-command-filter]")];
    const iconNodes = new Map(
      [...commandPalette.querySelectorAll("[data-command-icon]")].map((node) => [
        node.dataset.commandIcon,
        node.firstElementChild?.cloneNode(true) ?? null,
      ]),
    );
    const triggers = [...document.querySelectorAll("[data-command-trigger]")];
    const closeButtons = [...commandPalette.querySelectorAll("[data-command-close]")];
    const recentStorageKey = "aria-command-recent";
    const maxResults = 10;
    const defaultIds = ["page:blog", "page:works", "page:game", "page:me"];
    const filterLabels = new Map([
      ["all", "全部"],
      ["post", "文章"],
      ["tag", "标签"],
      ["project", "项目"],
      ["page", "页面"],
    ]);
    let entries = [];
    let indexLoaded = false;
    let activeItems = [];
    let activeFilter = "all";
    let selectedIndex = 0;
    let lastFocused = null;
    let closeTimer = 0;

    const normalizeEntries = (items) => items.map((entry) => ({
        ...entry,
        searchTitle: entry.title.normalize("NFKC").toLocaleLowerCase("zh-CN"),
        searchText: [entry.title, entry.description, entry.group, entry.meta, ...(entry.keywords || [])]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase("zh-CN"),
      }));
    entries = normalizeEntries(FALLBACK_COMMAND_ENTRIES);

    const ensureCommandIndex = async () => {
      if (indexLoaded) return;
      try {
        const loadedEntries = await fetchCommandIndex(indexUrl);
        if (scope.disposed) return;
        entries = normalizeEntries(loadedEntries);
        indexLoaded = true;
        renderResults();
      } catch {
        if (statusNode) statusNode.textContent = "完整索引读取失败，可继续使用页面入口";
      }
    };

    if (shortcutNode && /Macintosh|iPhone|iPad/.test(navigator.userAgent)) shortcutNode.textContent = "⌘ K";

    const normalizeQuery = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");

    // #、@、/ 分别是标签、项目、页面的快捷检索前缀；它只临时收窄结果，不覆盖用户点选的分类。
    const parseQuery = (value) => {
      const rawQuery = normalizeQuery(value);
      const prefixKind = rawQuery.startsWith("#")
        ? "tag"
        : rawQuery.startsWith("@")
          ? "project"
          : rawQuery.startsWith("/")
            ? "page"
            : null;
      const query = prefixKind ? rawQuery.slice(1).trim() : rawQuery;
      return {
        query,
        rawQuery,
        kind: prefixKind || activeFilter,
        terms: query.split(/\s+/).filter(Boolean),
      };
    };

    const readRecentIds = () => {
      try {
        const parsed = storage.getJSON(recentStorageKey, []);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
      } catch {
        return [];
      }
    };

    const saveRecentEntry = (entry) => {
      if (!entry) return;
      const ids = [entry.id, ...readRecentIds().filter((id) => id !== entry.id)].slice(0, 6);
      storage.setJSON(recentStorageKey, ids);
    };

    const getEntryById = (id) => entries.find((entry) => entry.id === id);

    const scoreToken = (entry, token) => {
      const title = entry.searchTitle;
      const text = entry.searchText;
      const requiresExactToken = /\d/.test(token);
      let score = 0;
      let matched = false;

      if (title === token) {
        score += 120;
        matched = true;
      }
      if (title.startsWith(token)) {
        score += 88;
        matched = true;
      }
      if (title.includes(token)) {
        score += 64;
        matched = true;
      }
      if (text.includes(token)) {
        score += 42;
        matched = true;
      }

      // 简单的顺序匹配能覆盖拼写不完整的英文项目名，也不会让中文搜索变复杂。
      let cursor = 0;
      let streak = 0;
      let matchedChars = 0;
      for (const char of token) {
        const found = text.indexOf(char, cursor);
        if (found === -1) {
          streak = 0;
          continue;
        }
        score += 8 + Math.max(0, 8 - (found - cursor));
        streak += 1;
        matchedChars += 1;
        cursor = found + 1;
      }

      if (!requiresExactToken && token.length > 1 && matchedChars === token.length) {
        score += streak * 6;
        matched = true;
      }
      return matched ? score : 0;
    };

    const scoreEntry = (entry, terms) => {
      if (!terms.length) return 0;
      const termScores = terms.map((term) => scoreToken(entry, term));
      if (termScores.some((score) => score === 0)) return 0;

      let score = termScores.reduce((total, termScore) => total + termScore, 0);
      if (entry.kind === "post") score += 8;
      if (entry.updatedTime) {
        const ageInDays = Math.max(0, (Date.now() - entry.updatedTime) / 86400000);
        score += Math.max(0, 12 - ageInDays / 45);
      }

      return score;
    };

    const getFallbackEntries = (kind) => {
      const recentEntries = readRecentIds().map(getEntryById).filter(Boolean);
      const available = kind === "all" ? entries : entries.filter((entry) => entry.kind === kind);
      const visibleRecent = recentEntries.filter((entry) => available.includes(entry));

      // 默认结果同时保留最近访问、近期文章与主要页面，首次打开也能直接作为站点导航使用。
      const recommended = kind === "all"
        ? [
            ...entries.filter((entry) => entry.kind === "post").slice(0, 4),
            ...defaultIds.map(getEntryById).filter(Boolean),
          ]
        : available;
      return [...visibleRecent, ...recommended.filter((entry) => !visibleRecent.includes(entry))].slice(0, maxResults);
    };

    const getMatches = ({ query, kind, terms }) => {
      if (!query) return getFallbackEntries(kind);

      return entries
        .filter((entry) => kind === "all" || entry.kind === kind)
        .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || (b.entry.updatedTime || 0) - (a.entry.updatedTime || 0))
        .slice(0, maxResults)
        .map(({ entry }) => entry);
    };

    const appendHighlightedText = (node, value, terms) => {
      node.replaceChildren();
      if (!terms.length) {
        node.textContent = value;
        return;
      }

      const pattern = terms
        .filter((term) => term.length > 0)
        .sort((a, b) => b.length - a.length)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      if (!pattern) {
        node.textContent = value;
        return;
      }

      const matcher = new RegExp(`(${pattern})`, "gi");
      value.split(matcher).filter(Boolean).forEach((part) => {
        if (terms.some((term) => normalizeQuery(part) === term)) {
          const mark = document.createElement("mark");
          mark.textContent = part;
          node.appendChild(mark);
        } else {
          node.appendChild(document.createTextNode(part));
        }
      });
    };

    const setSelectedIndex = (nextIndex, shouldScroll = false) => {
      if (!activeItems.length) {
        selectedIndex = 0;
        input?.removeAttribute("aria-activedescendant");
        return;
      }

      selectedIndex = (nextIndex + activeItems.length) % activeItems.length;
      activeItems.forEach((item, index) => {
        item.classList.toggle("is-active", index === selectedIndex);
        item.setAttribute("aria-selected", String(index === selectedIndex));
      });
      const activeItem = activeItems[selectedIndex];
      input?.setAttribute("aria-activedescendant", activeItem.id);
      if (shouldScroll) activeItem.scrollIntoView({ block: "nearest" });
    };

    const renderResults = () => {
      if (!resultsRoot || !template) return;
      const parsedQuery = parseQuery(input?.value || "");
      const matches = getMatches(parsedQuery);
      const recentIds = new Set(readRecentIds());
      activeItems = [];
      selectedIndex = 0;

      resultsRoot.querySelectorAll("[data-command-result]").forEach((node) => {
        runtimeStyles.clear(node);
        node.remove();
      });
      if (emptyState) {
        emptyState.hidden = matches.length > 0;
        emptyState.querySelector("strong").textContent = parsedQuery.query
          ? `没有找到“${parsedQuery.query}”`
          : "这个分类里暂时没有记录";
        emptyState.querySelector("span").textContent = parsedQuery.query
          ? "换个关键词，或切换到其他分类看看。"
          : "切换到其他分类继续浏览。";
      }

      matches.forEach((entry, index) => {
        const item = template.content.firstElementChild.cloneNode(true);
        item.id = `aria-command-option-${index}`;
        item.href = entry.href;
        item.dataset.commandId = entry.id;
        item.dataset.commandKind = entry.kind;
        item.dataset.commandExternal = String(Boolean(entry.external));
        runtimeStyles.set(item, "--command-item-index", index);
        if (entry.external) {
          item.target = "_blank";
          item.rel = "noreferrer";
          item.classList.add("is-external");
        }
        const iconRoot = item.querySelector("[data-command-result-icon]");
        const icon = iconNodes.get(entry.kind) || iconNodes.get("post");
        iconRoot?.replaceChildren(...(icon ? [icon.cloneNode(true)] : []));
        appendHighlightedText(item.querySelector("[data-command-result-title]"), entry.title, parsedQuery.terms);
        appendHighlightedText(item.querySelector("[data-command-result-description]"), entry.description, parsedQuery.terms);
        item.querySelector("[data-command-result-group]").textContent = recentIds.has(entry.id) && !parsedQuery.query
          ? `最近 · ${entry.group}`
          : entry.group;
        item.querySelector("[data-command-result-extra]").textContent = entry.meta || (entry.external ? "GitHub" : "站内");
        onPage(item, "mouseenter", () => setSelectedIndex(index));
        onPage(item, "focus", () => setSelectedIndex(index));
        onPage(item, "click", () => {
          saveRecentEntry(entry);
          closeCommandPalette();
        });
        resultsRoot.appendChild(item);
        activeItems.push(item);
      });

      clearButton.hidden = !parsedQuery.rawQuery;
      clearRecentButton.hidden = readRecentIds().length === 0;
      if (statusNode) {
        const scopeLabel = filterLabels.get(parsedQuery.kind) || "全部";
        if (!parsedQuery.query) statusNode.textContent = `${scopeLabel} · ${matches.length} 项推荐`;
        else statusNode.textContent = matches.length ? `${scopeLabel}内找到 ${matches.length} 条结果` : `${scopeLabel}内没有匹配结果`;
      }

      setSelectedIndex(0);
    };

    const setActiveFilter = (kind) => {
      activeFilter = filterLabels.has(kind) ? kind : "all";
      filterButtons.forEach((button) => {
        const active = button.dataset.commandFilter === activeFilter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderResults();
      void ensureCommandIndex();
      input?.focus({ preventScroll: true });
    };

    const openCommandPalette = () => {
      if (!commandPalette.hidden && !commandPalette.classList.contains("is-closing")) return;
      window.clearTimeout(closeTimer);
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      commandPalette.hidden = false;
      commandPalette.classList.remove("is-closing");
      document.documentElement.classList.add("command-palette-open");
      input?.setAttribute("aria-expanded", "true");
      renderResults();
      void ensureCommandIndex();
      window.setTimeout(() => input?.focus({ preventScroll: true }), reduceMotion ? 0 : 40);
    };

    const finishCloseCommandPalette = () => {
      commandPalette.hidden = true;
      commandPalette.classList.remove("is-closing");
      document.documentElement.classList.remove("command-palette-open");
      input.value = "";
      input?.setAttribute("aria-expanded", "false");
      lastFocused?.focus?.({ preventScroll: true });
      lastFocused = null;
    };

    const closeCommandPalette = () => {
      if (commandPalette.hidden || commandPalette.classList.contains("is-closing")) return;
      if (reduceMotion) {
        finishCloseCommandPalette();
        return;
      }
      // hidden 会立即切断 CSS 动画，因此先挂退场状态，等纸张与遮罩收起后再真正隐藏。
      commandPalette.classList.add("is-closing");
      closeTimer = window.setTimeout(finishCloseCommandPalette, 180);
    };

    const openSelected = () => {
      const item = activeItems[selectedIndex];
      if (!item) return;
      const entry = getEntryById(item.dataset.commandId);
      saveRecentEntry(entry);
      item.click();
      closeCommandPalette();
    };

    triggers.forEach((trigger) => {
      onPage(trigger, "click", openCommandPalette);
    });
    closeButtons.forEach((button) => {
      onPage(button, "click", closeCommandPalette);
    });
    onPage(input, "input", renderResults);
    onPage(clearButton, "click", () => {
      input.value = "";
      renderResults();
      input.focus({ preventScroll: true });
    });
    onPage(clearRecentButton, "click", () => {
      storage.remove(recentStorageKey);
      renderResults();
      input?.focus({ preventScroll: true });
    });
    filterButtons.forEach((button) => {
      onPage(button, "click", () => setActiveFilter(button.dataset.commandFilter));
    });
    onPage(document, "contextmenu", (event) => {
      if (!isCustomCursorEnabled()) return;
      const target = event.target;
      const editableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const isHomePage = document.body.classList.contains("home-page");
      const insidePalette = target?.closest?.("[data-command-palette]");

      // 首页右键作为 Spotlight 的隐藏入口；只在主页面接管，避免影响文章页代码块等原生/站内右键行为。
      // 终端阶段（HeroTerminal 展开后）有自己的右键关闭逻辑，不在此处拦截，避免覆盖终端的右键行为。
      const isTerminalOpen = document.querySelector('[data-terminal-shell].is-open, [data-terminal-shell].is-opening');
      if (!isHomePage || insidePalette || editableTarget || window.__ariaSplashActive || isTerminalOpen) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openCommandPalette();
    }, true);
    onPage(document, "keydown", (event) => {
      const target = event.target;
      const editableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (event.key === "/" && !editableTarget && commandPalette.hidden) {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (commandPalette.hidden) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeCommandPalette();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex(selectedIndex + 1, true);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(selectedIndex - 1, true);
      } else if (event.key === "Enter" && !target?.closest?.("button")) {
        event.preventDefault();
        openSelected();
      } else if (event.key === "Tab") {
        const focusable = [...commandPalette.querySelectorAll('button:not([hidden]), input, a[href]')]
          .filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    addPageCleanup(() => {
      window.clearTimeout(closeTimer);
      document.documentElement.classList.remove("command-palette-open");
    });
  }

  const initHomeSplash = () => {
    const routeSplash = document.getElementById("aria-welcome-splash");
    if (!routeSplash) {
      window.__ariaSplashActive = false;
      return;
    }

    // Astro 客户端路由返回首页时会重新插入首页 DOM，但不会刷新 window；
    // 已经看过欢迎层的同一标签页，必须直接移除新插入的 splash，避免覆盖主页。
    if (window.__ariaSplashSeen) {
      window.__ariaSplashActive = false;
      routeSplash.remove();
      return;
    }

    window.__ariaSplashSeen = true;
    window.__ariaSplashActive = true;

    let done = false;
    const startTime = Date.now();
    const minShowMs = 300;
    const maxShowMs = 2500;
    const progressBar = routeSplash.querySelector("[data-splash-progress-bar]");
    const commandText = routeSplash.querySelector("[data-splash-cmd]");

    const setProgress = (loaded, total) => {
      if (!progressBar) return;
      const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
      runtimeStyles.set(progressBar, "width", `${progress}%`);
    };

    const finish = () => {
      if (done) return;
      done = true;
      window.__ariaSplashActive = false;
      routeSplash.classList.add("is-dismissed");
      window.setTimeout(() => routeSplash.remove(), reduceMotion ? 140 : 500);
    };

    const tryFinish = (ready) => {
      if (!ready || done) return;
      const elapsed = Date.now() - startTime;
      if (elapsed >= minShowMs) finish();
      else window.setTimeout(finish, minShowMs - elapsed);
    };

    const waitForImageElement = (image) => new Promise((resolve) => {
      image.loading = "eager";
      if ("fetchPriority" in image) image.fetchPriority = "high";

      const settle = () => {
        if (typeof image.decode === "function" && image.naturalWidth > 0) {
          image.decode().then(resolve, resolve);
        } else {
          resolve();
        }
      };

      if (image.complete) {
        settle();
        return;
      }

      onPage(image, "load", settle, { once: true });
      onPage(image, "error", resolve, { once: true });
    });

    const trackHomeResources = () => {
      const homeShell = document.querySelector(".home-shell");
      const waits = [];
      let loaded = 0;

      if (homeShell) {
        homeShell.querySelectorAll("[data-splash-critical]").forEach((image) => {
          waits.push(waitForImageElement(image));
        });

      }

      const total = waits.length;
      setProgress(0, total);

      if (commandText) {
        commandText.textContent = total > 0 ? "prepare home assets" : "open home";
      }

      if (total === 0) {
        setProgress(1, 1);
        tryFinish(true);
        return;
      }

      waits.forEach((wait) => {
        wait.finally(() => {
          loaded += 1;
          setProgress(loaded, total);
        });
      });

      Promise.allSettled(waits).then(() => tryFinish(true));
    };

    const maxTimer = window.setTimeout(finish, maxShowMs);
    addPageCleanup(() => {
      window.clearTimeout(maxTimer);
      window.__ariaSplashActive = false;
    });
    onPage(routeSplash, "click", finish, { once: true });
    onPage(routeSplash, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") finish();
    });

    if (document.readyState === "loading") {
      onPage(document, "DOMContentLoaded", trackHomeResources, { once: true });
    } else {
      trackHomeResources();
    }
  };

  initHomeSplash();

  const homeLayerStage = document.querySelector("[data-home-layer-stage]");
  const labFeed = document.querySelector("#lab-feed");
  const homeNavHeader = document.querySelector(".site-header--brandless");
  if (homeLayerStage) {
    let layerFrame = 0;
    let wasPastHero = document.body.classList.contains("is-past-hero");
    let navReturnTimer = 0;
    let layerEndLockTimer = 0;
    let footerRevealTimer = 0;
    let footerRetractTimer = 0;
    let layerEndLocked = false;

    const getLayerScrollRange = () => {
      // 首页图层揭示只使用第一屏滚动距离；footer 的额外滚动空间不参与分割线进度。
      return Math.max(1, homeLayerStage.getBoundingClientRect().height || window.innerHeight);
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
      runtimeStyles.set(homeLayerStage, "--home-layer-progress", progress.toFixed(3));
      runtimeStyles.set(homeLayerStage, "--home-layer-split-y", `${split.toFixed(2)}px`);
    };

    const requestHomeLayerReveal = () => {
      if (!layerFrame) layerFrame = window.requestAnimationFrame(syncHomeLayerReveal);
    };

    const resetFooterRetractTimer = () => {
      const range = getLayerScrollRange();
      const footerRevealTop = range + 28;
      const footerRevealed = window.scrollY > footerRevealTop;
      if (!footerRevealed) {
        document.body.classList.remove("is-home-footer-visible");
        window.clearTimeout(footerRevealTimer);
        window.clearTimeout(footerRetractTimer);
        return;
      }

      // Footer 只在稳定滑出后淡入，避免触控板/滚轮惯性轻微越界时闪一下又被边界保护拉回。
      if (!document.body.classList.contains("is-home-footer-visible")) {
        window.clearTimeout(footerRevealTimer);
        footerRevealTimer = window.setTimeout(() => {
          if (window.scrollY <= footerRevealTop) return;
          document.body.classList.add("is-home-footer-visible");
          resetFooterRetractTimer();
        }, reduceMotion ? 0 : 220);
        return;
      }

      window.clearTimeout(footerRetractTimer);
      footerRetractTimer = window.setTimeout(() => {
        if (window.scrollY <= footerRevealTop) return;
        document.body.classList.remove("is-home-footer-visible");
        window.scrollTo({
          top: range,
          left: 0,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }, 3000);
    };

    const holdLayerEnd = () => {
      layerEndLocked = true;
      document.body.classList.add("is-layer-end-hold");
      window.clearTimeout(layerEndLockTimer);
      layerEndLockTimer = window.setTimeout(() => {
        layerEndLocked = false;
        document.body.classList.remove("is-layer-end-hold");
      }, reduceMotion ? 0 : 420);
    };

    const guardLayerEndScroll = (event) => {
      if (event.defaultPrevented || event.deltaY <= 0) return;
      const range = getLayerScrollRange();
      const scrollY = window.scrollY;
      if (layerEndLocked && scrollY >= range - 2) {
        event.preventDefault();
        window.scrollTo({ top: range, left: 0, behavior: "auto" });
        return;
      }
      // 大惯性滚动跨过 feed 完整展示点时，先固定在边界；下一次滚动再进入 footer 区域。
      if (scrollY < range - 2 && scrollY + event.deltaY >= range) {
        event.preventDefault();
        window.scrollTo({ top: range, left: 0, behavior: "auto" });
        holdLayerEnd();
        syncHomeLayerReveal();
      }
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
    onPage(window, "wheel", guardLayerEndScroll, { passive: false });
    onPage(window, "scroll", () => {
      requestHomeLayerReveal();
      resetFooterRetractTimer();
    }, { passive: true });
    onPage(window, "resize", syncHomeLayerReveal);
    addPageCleanup(() => {
      window.cancelAnimationFrame(layerFrame);
      window.clearTimeout(navReturnTimer);
      window.clearTimeout(layerEndLockTimer);
      window.clearTimeout(footerRevealTimer);
      window.clearTimeout(footerRetractTimer);
      layerEndLocked = false;
      document.body.classList.remove("is-layer-end-hold", "is-home-footer-visible");
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
      runtimeStyles.set(labFeed, "--feed-pointer-x", "0");
      runtimeStyles.set(labFeed, "--feed-pointer-y", "0");
      runtimeStyles.set(labFeed, "--feed-spot-x", "50%");
      runtimeStyles.set(labFeed, "--feed-spot-y", "44%");
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
      runtimeStyles.set(labFeed, "--feed-pointer-x", ((x - 0.5) * 2).toFixed(3));
      runtimeStyles.set(labFeed, "--feed-pointer-y", ((y - 0.5) * 2).toFixed(3));
      runtimeStyles.set(labFeed, "--feed-spot-x", `${Math.round(x * 100)}%`);
      runtimeStyles.set(labFeed, "--feed-spot-y", `${Math.round(y * 100)}%`);
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
      const commandTrigger = navPill.querySelector(".nav-command-trigger");
      const gap = Math.min(26, Math.max(12, window.innerWidth * 0.0115));
      const itemCount = links.length + (commandTrigger ? 1 : 0);
      const linkWidth = links.length * 132 + (commandTrigger ? 118 : 0);
      const width = Math.min(window.innerWidth - 128, Math.ceil(linkWidth + gap * Math.max(0, itemCount - 1) + 68));
      runtimeStyles.set(navPill, "--home-nav-open-width", `${Math.max(width, 320)}px`);
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
      if (scope.disposed || !output || reduceMotion || commands.length === 0) return;

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
        if (scope.disposed || !isTerminalOpen) return;

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

    onPage(terminal, "click", openTerminalWindow);
    onPage(terminal, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTerminalWindow();
    });

    onPage(document, "keydown", (event) => {
      if (event.key === "Escape") closeTerminalWindow();
    });

    onPage(document, "contextmenu", (event) => {
      if (!isTerminalOpen || !isCustomCursorEnabled()) return;
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

    onPage(terminalAvatar, "click", () => {
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
  onPage(openButton, "click", () => {
    if (dialog instanceof HTMLDialogElement) dialog.showModal();
  });

  const runtimeNode = document.querySelector("[data-site-runtime]");
  if (runtimeNode && !runtimeNode.dataset.ariaRuntimeReady) {
    runtimeNode.dataset.ariaRuntimeReady = "true";
    const runtimeStart = new Date(runtimeNode.dataset.runtimeStart || "2026-05-21T00:00:00+08:00");

    const syncRuntime = () => {
      const days = getRuntimeDays(runtimeStart);
      runtimeNode.textContent = `${days} 天`;
    };

    syncRuntime();
    const runtimeTimer = window.setInterval(syncRuntime, 1000 * 60 * 60);
    addPageCleanup(() => {
      window.clearInterval(runtimeTimer);
      runtimeNode.removeAttribute("data-aria-runtime-ready");
    });
  }

  document.querySelectorAll("[data-runtime-days]").forEach((node) => {
    const start = new Date(node.dataset.runtimeStart || "2026-05-21T00:00:00+08:00");
    node.textContent = `${getRuntimeDays(start).toLocaleString("zh-CN")} 天`;
  });
  document.querySelectorAll("[data-latest-activity][data-activity-date]").forEach((node) => {
    const activityDate = new Date(node.dataset.activityDate || "");
    if (!Number.isNaN(activityDate.valueOf())) node.textContent = formatRelativeActivity(activityDate);
  });
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
    }).format(new Date());
  });

  const calendarRoot = document.querySelector("[data-blog-calendar]");
  if (calendarRoot) {
    const title = calendarRoot.querySelector("[data-calendar-title]");
    const grid = calendarRoot.querySelector("[data-calendar-grid]");
    let postDates = [];
    try {
      const values = JSON.parse(calendarRoot.dataset.postDates || "[]");
      if (Array.isArray(values)) postDates = values.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.valueOf()));
    } catch {
      postDates = [];
    }
    const calendar = buildCalendarModel(postDates);
    if (title) title.textContent = calendar.title;
    if (grid) {
      grid.replaceChildren(...calendar.cells.map((cell) => {
        if (!cell.day) {
          const blank = document.createElement("span");
          blank.className = "blog-calendar__blank";
          blank.setAttribute("aria-hidden", "true");
          return blank;
        }
        const day = document.createElement("time");
        day.className = "blog-calendar__day";
        if (cell.isToday) day.classList.add("is-today");
        if (cell.hasPost) day.classList.add("has-post");
        day.dateTime = cell.key || "";
        day.textContent = String(cell.day);
        return day;
      }));
    }
  }

  const giscusRoot = document.querySelector("[data-giscus-root]");
  if (giscusRoot && !giscusRoot.dataset.giscusLoaded) {
    const loadGiscus = () => {
      if (giscusRoot.dataset.giscusLoaded) return;
      giscusRoot.dataset.giscusLoaded = "true";

      const script = document.createElement("script");
      // 更换脚本来源时必须同步 vercel.json 与 public/_headers 的 CSP script-src 白名单。
      script.src = "https://giscus.app/client.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      [
        "repo",
        "repoId",
        "category",
        "categoryId",
        "mapping",
        "strict",
        "reactionsEnabled",
        "emitMetadata",
        "inputPosition",
        "theme",
        "lang",
        "loading",
      ].forEach((key) => {
        const value = giscusRoot.dataset[key];
        if (value !== undefined) script.dataset[key] = value;
      });
      giscusRoot.appendChild(script);
    };

    // 评论区接近视口时才下载第三方脚本，避免它与文章首屏资源竞争带宽和主线程。
    const giscusObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        giscusObserver.disconnect();
        loadGiscus();
      },
      { rootMargin: "600px 0px" },
    );
    giscusObserver.observe(giscusRoot);
    addPageCleanup(() => giscusObserver.disconnect());
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
      storage.set("aria-console-pinned", String(open));
    };

    const togglePinnedConsole = () => {
      setPinnedConsole(!sideTools.classList.contains("is-pinned"));
    };

    let pointerHandled = false;
    onPage(consoleTrigger, "pointerdown", (event) => {
      if (event.button !== 0) return;
      // 收起态按钮获得焦点会让抽屉先位移，改用 pointerdown 提前处理，避免 click 落空。
      event.preventDefault();
      pointerHandled = true;
      togglePinnedConsole();
      window.setTimeout(() => {
        pointerHandled = false;
      }, 360);
    });

    onPage(consoleTrigger, "click", (event) => {
      if (pointerHandled) {
        event.preventDefault();
        pointerHandled = false;
        return;
      }

      togglePinnedConsole();
    });

    onPage(document, "keydown", (event) => {
      if (event.key !== "Escape") return;
      if (sideTools.classList.contains("is-pinned")) setPinnedConsole(false);
    });

    onPage(document, "pointerdown", (event) => {
      if (!sideTools.classList.contains("is-pinned")) return;
      if (sideTools.contains(event.target)) return;
      setPinnedConsole(false);
    });

    // Dock 节点会被 ClientRouter 持久化，但监听器属于当前 PageScope；切页前清除哨兵，下一页才能重新绑定。
    addPageCleanup(() => {
      sideTools.removeAttribute("data-aria-console-ready");
    });

    setPinnedConsole(storage.get("aria-console-pinned") === "true");
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
    let activeMode = storage.get(modeStorageKey) || defaultMode;
    if (!allowedModes.has(activeMode)) activeMode = "local";
    const storedPlayback = (() => {
      try {
        const payload = storage.getJSON(playbackStorageKey, {});
        return payload && typeof payload === "object" ? payload : {};
      } catch {
        return {};
      }
    })();
    if (allowedModes.has(storedPlayback.mode)) activeMode = storedPlayback.mode;
    const storedTrack = Number(storage.get(`aria-music-track:${activeMode}`));
    const storedPlaybackIndex = Number(storedPlayback.index);
    const initialTrack = Number.isInteger(storedPlaybackIndex)
      ? storedPlaybackIndex
      : Number.isInteger(storedTrack)
        ? storedTrack
        : 0;
    let activeIndex = Math.max(0, initialTrack);
    let isSeeking = false;
    let metingLoaded = false;
    let metingTracks = [];
    let metingGeneration = 0;
    let metingController = null;
    let sourceNotice = "";
    let lyricEntries = [];
    let activeLyricIndex = -1;
    let lyricRequestId = 0;
    let detailsTrack = null;
    let lastPlaybackSaveAt = 0;
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
      const timeoutController = new AbortController();
      const timeout = window.setTimeout(() => timeoutController.abort(), 8000);
      try {
        const response = await fetch(lyricSource, {
          signal: AbortSignal.any([scope.signal, timeoutController.signal]),
          credentials: "omit",
        });
        return await readLimitedText(response);
      } finally {
        window.clearTimeout(timeout);
      }
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
      trackList.replaceChildren();
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
        onPage(button, "click", () => {
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

    const savePlaybackState = (force = false) => {
      if (!(audio instanceof HTMLAudioElement)) return;
      const now = Date.now();
      if (!force && now - lastPlaybackSaveAt < 5000) return;
      lastPlaybackSaveAt = now;
      // 全站播放器会随页面切换重新挂载，这里保存最小播放现场，下一页可以接着恢复。
      storage.setJSON(
        playbackStorageKey,
        {
          mode: activeMode,
          index: activeIndex,
          currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
          playing: !audio.paused && !audio.ended,
          updatedAt: now,
        },
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
      // 封面和歌词不参与首屏渲染；首次播放或切歌时再请求，避免隐藏 Dock 抢占带宽。
      if (shouldLoad && detailsTrack !== track) {
        detailsTrack = track;
        coverNodes.forEach((node) => {
          const cover = track.cover || "";
          node.classList.toggle("has-cover", Boolean(cover));
          if (cover) runtimeStyles.set(node, "--music-cover-image", `url("${cover}")`);
          else runtimeStyles.remove(node, "--music-cover-image");
        });
        loadLyrics(track);
      }
      tracks.forEach((item) => item.node?.classList.toggle("is-active", item === track));
      storage.set(`aria-music-track:${activeMode}`, String(activeIndex));

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

    const cancelMetingRequest = () => {
      metingGeneration += 1;
      metingController?.abort();
      metingController = null;
      // 旧请求的 finally 会因代次失效而跳过清理，主动取消时必须立即恢复非加载态。
      musicPlayer.classList.remove("is-source-loading");
    };

    const fallbackToLocal = () => {
      sourceNotice = sourceFallbackHint;
      activeMode = "local";
      tracks = localTracks;
      storage.set(modeStorageKey, activeMode);
      renderTrackButtons();
      syncModeUi();
      loadTrack(0, false, false);
    };

    // 代次是请求竞态的唯一写入令牌：只有最新请求能更新界面、触发回退或清除加载态。
    const fetchMetingTracks = async () => {
      if (metingLoaded) {
        tracks = metingTracks;
        activeIndex = Number(storage.get("aria-music-track:meting")) || 0;
        renderTrackButtons();
        loadTrack(activeIndex, false, false);
        sourceNotice = "";
        syncModeUi();
        return true;
      }
      const url = buildMetingUrl();
      if (!url) return false;
      const generation = metingGeneration + 1;
      metingGeneration = generation;
      metingController?.abort();
      const controller = new AbortController();
      metingController = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);
      sourceNotice = "";
      musicPlayer.classList.add("is-source-loading");
      if (sourceHint) sourceHint.textContent = sourceLoadingHints.meting;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([scope.signal, controller.signal]),
          credentials: "omit",
        });
        const payload = JSON.parse(await readLimitedText(response));
        const mappedTracks = validateMetingPayload(payload, window.location.href).map((track) => ({
          ...track,
          node: null,
        }));
        if (scope.disposed || generation !== metingGeneration || activeMode !== "meting") return false;
        if (mappedTracks.length) {
          metingTracks = mappedTracks;
          tracks = metingTracks;
          activeIndex = Number(storage.get("aria-music-track:meting")) || 0;
          metingLoaded = true;
          sourceNotice = "";
          renderTrackButtons();
          loadTrack(activeIndex, false, false);
          return true;
        } else {
          fallbackToLocal();
          return false;
        }
      } catch (error) {
        if (scope.disposed || generation !== metingGeneration || (!timedOut && error?.name === "AbortError")) {
          return false;
        }
        fallbackToLocal();
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (generation === metingGeneration) {
          if (metingController === controller) metingController = null;
          musicPlayer.classList.remove("is-source-loading");
          if (activeMode === "meting" && !sourceNotice && sourceHint) {
            sourceHint.textContent = sourceHints.meting;
          }
        }
      }
    };

    const setMusicMode = async (mode) => {
      if (!(audio instanceof HTMLAudioElement)) return;
      if (mode === activeMode) return;
      cancelMetingRequest();
      audio.pause();
      audio.removeAttribute("src");
      sourceNotice = "";
      tracks = mode === "meting" ? tracks : localTracks;
      activeMode = mode;
      storage.set(modeStorageKey, activeMode);

      if (activeMode === "meting") {
        const loaded = await fetchMetingTracks();
        if (!loaded) storage.set(modeStorageKey, activeMode);
      } else {
        tracks = localTracks;
        activeIndex = Number(storage.get("aria-music-track:local")) || 0;
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

    toggles.forEach((button) => onPage(button, "click", () => {
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

    onPage(prevButton, "click", () => {
      const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
      loadTrack(activeIndex - 1, shouldPlay);
    });

    onPage(nextButton, "click", () => {
      const shouldPlay = audio instanceof HTMLAudioElement && !audio.paused;
      loadTrack(activeIndex + 1, shouldPlay);
    });

    onPage(sourceToggle, "click", () => {
      if (!sourcePanel) return;
      const isHidden = sourcePanel.hasAttribute("hidden");
      sourcePanel.toggleAttribute("hidden", !isHidden);
      sourceToggle.setAttribute("aria-expanded", String(isHidden));
    });

    const setPlaylistOpen = (open) => {
      if (!playlistToggle || !playlistPanel) return;
      window.clearTimeout(Number(playlistPanel.dataset.closeTimer || 0));
      playlistToggle.setAttribute("aria-expanded", String(open));
      storage.set("aria-music-playlist-open", String(open));

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

    onPage(playlistToggle, "click", () => {
      setPlaylistOpen(playlistToggle.getAttribute("aria-expanded") !== "true");
    });

    modeButtons.forEach((button) => {
      onPage(button, "click", () => {
        setMusicMode(button.dataset.musicMode || "local");
      });
    });

    onPage(progress, "input", () => {
      isSeeking = true;
      if (!(audio instanceof HTMLAudioElement) || !(progress instanceof HTMLInputElement)) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration > 0) {
        currentNodes.forEach((node) => {
          node.textContent = formatTime((Number(progress.value) / 100) * duration);
        });
      }
    });

    onPage(progress, "change", () => {
      if (!(audio instanceof HTMLAudioElement) || !(progress instanceof HTMLInputElement)) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration > 0) audio.currentTime = (Number(progress.value) / 100) * duration;
      isSeeking = false;
      updateProgress();
    });

    onPage(volume, "input", () => {
      if (audio instanceof HTMLAudioElement && volume instanceof HTMLInputElement) {
        audio.volume = Number(volume.value);
        storage.set("aria-music-volume", volume.value);
      }
    });

    onPage(audio, "play", syncPlayingState);
    onPage(audio, "play", () => savePlaybackState(true));
    onPage(audio, "pause", () => {
      syncPlayingState();
      savePlaybackState(true);
    });
    onPage(audio, "ended", () => loadTrack(activeIndex + 1, true));
    onPage(audio, "loadedmetadata", () => {
      if (audio instanceof HTMLAudioElement && pendingRestoreTime > 0) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        audio.currentTime = duration > 0 ? Math.min(pendingRestoreTime, Math.max(0, duration - 0.4)) : pendingRestoreTime;
        pendingRestoreTime = 0;
      }
      updateProgress();
    });
    onPage(audio, "timeupdate", updateProgress);
    onPage(window, "pagehide", () => savePlaybackState(true));

    addPageCleanup(() => {
      cancelMetingRequest();
      savePlaybackState(true);
      musicRoot.removeAttribute("data-aria-music-ready");
    });

    if (audio instanceof HTMLAudioElement && volume instanceof HTMLInputElement) {
      const storedVolume = storage.get("aria-music-volume");
      if (storedVolume !== null) volume.value = storedVolume;
      audio.volume = Number(volume.value);
    }
    renderTrackButtons();
    setPlaylistOpen(storage.get("aria-music-playlist-open") === "true");
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
      runtimeStyles.set(scrollRail, "--scroll-progress", progress.toFixed(3));
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
      storage.set(topicExpandStorageKey, String(expanded));
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
      onPage(button, "click", () => {
        syncTopicFilter(button.dataset.blogTopicFilter || "all");
      });
    });

    onPage(topicToggle, "click", () => {
      setTopicsExpanded(!blogFilter.classList.contains("is-expanded"));
    });

    setTopicsExpanded(storage.get(topicExpandStorageKey) === "true");
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
      runtimeStyles.set(articleFrame, "--article-acrylic-opacity", (opacity / 100).toFixed(2));
      if (opacityInput instanceof HTMLInputElement) opacityInput.value = String(opacity);
      if (opacityValue) opacityValue.textContent = `${opacity}%`;
      storage.set(opacityStorageKey, String(opacity));
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
      storage.set(storageKey, nextMode);
    };

    modeButtons.forEach((button) => {
      onPage(button, "click", () => {
        applyArticleMode(button.dataset.articleMode || "acrylic");
      });
    });

    onPage(opacityInput, "input", () => {
      if (!(opacityInput instanceof HTMLInputElement)) return;
      applyArticleOpacity(opacityInput.value);
      applyArticleMode("acrylic");
    });

    applyArticleOpacity(storage.get(opacityStorageKey) || "58");
    applyArticleMode(storage.get(storageKey) || "acrylic");

    if (progress) {
      let articleTop = 0;
      let articleHeight = 0;
      let viewportHeight = 0;
      let progressFrame = 0;

      const renderArticleProgress = () => {
        progressFrame = 0;
        const ratio = calculateReadingProgress(window.scrollY, articleTop, articleHeight, viewportHeight);
        const percent = Math.round(ratio * 100);
        runtimeStyles.set(progress, "--article-progress", ratio.toFixed(3));
        if (progressValue) progressValue.textContent = `${percent}%`;
      };

      const queueArticleProgress = () => {
        if (progressFrame) return;
        progressFrame = window.requestAnimationFrame(renderArticleProgress);
      };

      const measureArticle = () => {
        articleTop = articleFrame.offsetTop;
        articleHeight = articleFrame.scrollHeight;
        viewportHeight = window.innerHeight;
        queueArticleProgress();
      };

      const setActiveHeading = (activeIndex) => {
        headingTargets.forEach((entry, index) => {
          entry.item?.classList.toggle("is-active", index === activeIndex);
        });
      };

      if (headingTargets.length && "IntersectionObserver" in window) {
        let activeIndex = 0;
        setActiveHeading(activeIndex);
        const headingObserver = new IntersectionObserver((entries) => {
          for (const observed of entries) {
            const index = headingTargets.findIndex((entry) => entry.heading === observed.target);
            if (index < 0) continue;
            if (observed.isIntersecting || observed.boundingClientRect.top < 140) activeIndex = index;
          }
          setActiveHeading(activeIndex);
        }, { rootMargin: "-120px 0px -68%", threshold: [0, 1] });
        headingTargets.forEach((entry) => headingObserver.observe(entry.heading));
        addPageCleanup(() => headingObserver.disconnect());
      }

      if ("ResizeObserver" in window) {
        const resizeObserver = new ResizeObserver(measureArticle);
        resizeObserver.observe(articleFrame);
        addPageCleanup(() => resizeObserver.disconnect());
      }

      measureArticle();
      onPage(window, "scroll", queueArticleProgress, { passive: true });
      onPage(window, "resize", measureArticle);
      addPageCleanup(() => window.cancelAnimationFrame(progressFrame));
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
    let startTimer = 0;
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
      const placedTargets = [];

      const overlapsPlacedTarget = (candidate, padding = 12) =>
        placedTargets.some(
          (placed) =>
            Math.abs(candidate.x + candidate.width / 2 - (placed.x + placed.width / 2)) <
              (candidate.width + placed.width) / 2 + padding &&
            Math.abs(candidate.y + candidate.height / 2 - (placed.y + placed.height / 2)) <
              (candidate.height + placed.height) / 2 + padding,
        );

      bodies = tagItems.map((tag, index) => {
        const width = tag.offsetWidth;
        const height = tag.offsetHeight;
        const [slotX, slotY, slotAngle] = tagSlots[index % tagSlots.length];
        const angle = (slotAngle * Math.PI) / 180;
        const maxX = Math.max(18, bounds.width - width - 18);
        const maxY = Math.max(34, bounds.height - height - 28);
        const baseTargetX = Math.max(18, Math.min(maxX, bounds.width * slotX - width / 2));
        const baseTargetY = Math.max(34, Math.min(maxY, bounds.height * slotY - height / 2));
        let targetX = baseTargetX;
        let targetY = baseTargetY;

        for (let attempt = 0; attempt < 14; attempt += 1) {
          const candidate = { x: targetX, y: targetY, width, height };
          if (!overlapsPlacedTarget(candidate)) break;

          const direction = attempt % 2 === 0 ? 1 : -1;
          const radius = 18 + Math.floor(attempt / 2) * 18;
          targetX = Math.max(18, Math.min(maxX, baseTargetX + Math.cos(index * 1.7 + attempt) * radius));
          targetY = Math.max(34, Math.min(maxY, baseTargetY + direction * radius));
        }

        placedTargets.push({ x: targetX, y: targetY, width, height });

        return {
          el: tag,
          width,
          height,
          x: Math.max(18, Math.min(maxX, targetX + Math.sin(index * 2.17) * 34)),
          y: -height - index * 30,
          targetX,
          targetY,
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
        runtimeStyles.set(
          body.el,
          "transform",
          `translate3d(${body.x}px, ${body.y}px, 0) rotate(${body.angle}rad)`,
        );
      });
    };

    const freezeBodies = (snapToTarget = false) => {
      bodies.forEach((body) => {
        // 静止收尾时清掉速度；滚动期间直接贴近目标位，避免碰撞动画和页面滚动叠加造成视觉抖动。
        body.vx = 0;
        body.vy = 0;
        body.angularVelocity = 0;
        if (snapToTarget) {
          body.x = body.targetX;
          body.y = body.targetY;
          body.angle = body.targetAngle;
        }
      });
      renderBodies();
      physicsTags.classList.add("is-settled");
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

    const schedulePhysics = () => {
      if (started) return;
      window.clearTimeout(startTimer);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const revealPoint = maxScroll * 0.48;
      if (window.scrollY < revealPoint) return;

      // 标签层被 clip-path 隐藏时 IntersectionObserver 仍可能判定可见；
      // 改为等第二屏真正揭示且滚动停止后再启动，避免首屏阶段执行隐藏动画。
      startTimer = window.setTimeout(startPhysics, reduceMotion ? 0 : 180);
    };

    schedulePhysics();
    addPageCleanup(() => {
      window.cancelAnimationFrame(animationId);
      window.clearTimeout(startTimer);
      window.clearTimeout(resizeTimer);
    });

    onPage(window, "scroll", () => {
      if (!started) {
        schedulePhysics();
        return;
      }
      if (!physicsTags.classList.contains("is-settled")) {
        window.cancelAnimationFrame(animationId);
        freezeBodies(true);
      }
    }, { passive: true });

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

    onPage(button, "click", () => {
      count += 1;
      if (countNode) countNode.textContent = String(count);
    });
  }

  return cleanup;
};
