import { createSafeStorage } from "../core/safe-storage";
import { initMusicController, type MusicController } from "./music-controller";

export interface DockController {
  readonly music: MusicController;
  mount(root?: HTMLElement | null): boolean;
  destroy(): void;
}

class PersistentDockController implements DockController {
  readonly #storage = createSafeStorage();
  readonly #lifetime = new AbortController();

  #root: HTMLElement | null = null;
  #trigger: HTMLButtonElement | null = null;
  #console: HTMLElement | null = null;
  #pointerHandled = false;
  #pointerResetTimer = 0;
  #music: MusicController | null = null;

  get music(): MusicController {
    this.#music ??= initMusicController();
    return this.#music;
  }

  mount(root = document.querySelector<HTMLElement>("[data-side-tools]")): boolean {
    if (!root) return false;
    if (this.#root === root && root.dataset.ariaDockControllerReady === "true") {
      this.#syncConsoleState();
      this.music.mount(root);
      return true;
    }
    if (this.#root && this.#root !== root) return false;

    const trigger = root.querySelector<HTMLButtonElement>("[data-console-trigger]");
    const consoleNode = root.querySelector<HTMLElement>("[data-side-console]");
    if (!trigger || !consoleNode) return false;

    this.#root = root;
    this.#trigger = trigger;
    this.#console = consoleNode;
    root.dataset.ariaDockControllerReady = "true";
    // 保留原有哨兵，阻止 interactions 的页面级实现重复注册事件。
    root.dataset.ariaConsoleReady = "true";

    const signal = this.#lifetime.signal;
    trigger.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      // 收起态按钮获得焦点时抽屉会先位移；在 pointerdown 阶段处理可避免后续 click 落到空处。
      event.preventDefault();
      this.#pointerHandled = true;
      this.#togglePinnedConsole();
      window.clearTimeout(this.#pointerResetTimer);
      this.#pointerResetTimer = window.setTimeout(() => {
        this.#pointerHandled = false;
      }, 360);
    }, { signal });

    trigger.addEventListener("click", (event) => {
      if (this.#pointerHandled) {
        event.preventDefault();
        this.#pointerHandled = false;
        return;
      }
      this.#togglePinnedConsole();
    }, { signal });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.classList.contains("is-pinned")) {
        this.#setPinnedConsole(false);
      }
    }, { signal });

    document.addEventListener("pointerdown", (event) => {
      if (!root.classList.contains("is-pinned")) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      this.#setPinnedConsole(false);
    }, { signal });

    document.addEventListener("astro:page-load", () => {
      // SideTools 使用 transition:persist；每次换页只同步可访问状态，不重新绑定监听器。
      this.#syncConsoleState();
      this.music.mount(root);
    }, { signal });

    this.#setPinnedConsole(this.#storage.get("aria-console-pinned") === "true");
    this.#syncConsoleState();
    this.music.mount(root);
    return true;
  }

  destroy(): void {
    window.clearTimeout(this.#pointerResetTimer);
    this.#lifetime.abort();
    this.#music?.destroy();
    this.#root?.removeAttribute("data-aria-dock-controller-ready");
    this.#root?.removeAttribute("data-aria-console-ready");
  }

  #setPinnedConsole(open: boolean): void {
    if (!this.#root) return;
    // 完整控制台始终由明确点击打开，保持现有视觉和交互节奏。
    this.#root.classList.toggle("is-pinned", open);
    this.#syncConsoleState();
    this.#storage.set("aria-console-pinned", String(open));
  }

  #togglePinnedConsole(): void {
    this.#setPinnedConsole(!this.#root?.classList.contains("is-pinned"));
  }

  #syncConsoleState(): void {
    if (!this.#root || !this.#trigger || !this.#console) return;
    const pinned = this.#root.classList.contains("is-pinned");
    this.#trigger.setAttribute("aria-expanded", String(pinned));
    this.#console.setAttribute("aria-hidden", String(!pinned));
    this.#console.inert = !pinned;
  }
}

let controller: PersistentDockController | null = null;

export const initPersistentDock = (): DockController => {
  controller ??= new PersistentDockController();
  if (!controller.mount()) {
    controller.destroy();
    controller = new PersistentDockController();
    controller.mount();
  }
  return controller;
};
