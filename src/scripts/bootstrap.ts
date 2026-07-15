import { PageScope } from "./core/page-scope";

let currentScope: PageScope | null = null;
let mountScheduled = false;

const disposePage = () => {
  currentScope?.dispose();
  currentScope = null;
};

const mountPage = async () => {
  disposePage();
  const scope = new PageScope();
  currentScope = scope;

  // 动态导入可能跨过 astro:before-swap；每次 await 后都校验 scope，禁止旧页面继续挂载交互。
  const { initInteractions } = await import("./interactions.js");
  if (scope.disposed || currentScope !== scope) return;
  initInteractions(scope);

  if (document.querySelector("[data-chess-room]")) {
    const { initChessPlayroom } = await import("./chess-playroom.js");
    if (scope.disposed || currentScope !== scope) return;
    const cleanup = initChessPlayroom();
    if (typeof cleanup === "function") scope.add(cleanup);
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
