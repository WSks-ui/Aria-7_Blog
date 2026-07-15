export type Dispose = () => void;

export class PageScope {
  readonly #controller = new AbortController();
  readonly #cleanups: Dispose[] = [];

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  get disposed(): boolean {
    return this.signal.aborted;
  }

  on(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options: AddEventListenerOptions = {},
  ): void {
    if (!target || this.disposed) return;
    target.addEventListener(type, listener, { ...options, signal: this.signal });
  }

  add(cleanup: Dispose): Dispose {
    if (this.disposed) {
      cleanup();
      return cleanup;
    }
    this.#cleanups.push(cleanup);
    return cleanup;
  }

  timeout(callback: () => void, delay: number): number {
    const id = window.setTimeout(() => {
      if (!this.disposed) callback();
    }, delay);
    this.add(() => window.clearTimeout(id));
    return id;
  }

  animationFrame(callback: FrameRequestCallback): number {
    const id = window.requestAnimationFrame((time) => {
      if (!this.disposed) callback(time);
    });
    this.add(() => window.cancelAnimationFrame(id));
    return id;
  }

  observe(observer: { disconnect: () => void }): void {
    this.add(() => observer.disconnect());
  }

  dispose(): void {
    if (this.disposed) return;
    // 先中止共享 signal，让自动绑定的监听器和异步任务立即失效；再按注册逆序释放有依赖关系的资源。
    this.#controller.abort();
    while (this.#cleanups.length) {
      try {
        this.#cleanups.pop()?.();
      } catch (error) {
        console.error("页面清理函数执行失败", error);
      }
    }
  }
}
