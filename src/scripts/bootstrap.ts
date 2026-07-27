import { PageScope } from "./core/page-scope";

let currentScope: PageScope | null = null;
let mountScheduled = false;
let persistentShellPromise: Promise<void> | null = null;

const mountPersistentShell = (): Promise<void> => {
  // Dock 使用 transition:persist 保留节点，必须在应用生命周期中只挂载一次。
  persistentShellPromise ??= import("./features/dock-controller").then(({ initPersistentDock }) => {
    initPersistentDock();
  });
  return persistentShellPromise;
};

const disposePage = () => {
  currentScope?.dispose();
  currentScope = null;
};

const releaseHomeSplashFallback = () => {
  // 动态模块加载失败时，首页必须退化为可正常阅读的静态页面。
  document.querySelector(".home-shell")?.removeAttribute("inert");
  document.querySelector(".home-shell")?.removeAttribute("aria-hidden");
  document.querySelectorAll("[data-skip-link], [data-side-tools], [data-command-palette]").forEach((node) => {
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
  });
  document.getElementById("aria-welcome-splash")?.remove();
  window.__ariaSplashActive = false;
};

const mountPage = async () => {
  disposePage();
  const scope = new PageScope();
  currentScope = scope;

  try {
    await mountPersistentShell();
    if (scope.disposed || currentScope !== scope) return;

    // 动态导入可能跨过 astro:before-swap；每次 await 后都校验 scope，禁止旧页面继续挂载交互。
    const { initInteractions } = await import("./interactions");
    if (scope.disposed || currentScope !== scope) return;
    initInteractions(scope);

    if (document.querySelector("[data-chess-room]")) {
      const { initChessPlayroom } = await import("./chess-playroom.js");
      if (scope.disposed || currentScope !== scope) return;
      const cleanup = initChessPlayroom();
      if (typeof cleanup === "function") scope.add(cleanup);
    }
  } catch {
    releaseHomeSplashFallback();
  }
};

const scheduleMount = () => {
  // 初次启动与 astro:page-load 可能落在同一轮事件中，用微任务合并重复挂载。
  if (mountScheduled) return;
  mountScheduled = true;
  queueMicrotask(() => {
    mountScheduled = false;
    void mountPage();
  });
};

export const startBootstrap = () => {
  if (window.__ariaBootstrapReady) return;
  window.__ariaBootstrapReady = true;
  document.addEventListener("astro:before-swap", disposePage);
  document.addEventListener("astro:page-load", scheduleMount);
  scheduleMount();
};
