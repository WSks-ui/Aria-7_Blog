import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageScope } from "../../src/scripts/core/page-scope";

interface WindowStub {
  setTimeout: ReturnType<typeof vi.fn>;
  clearTimeout: ReturnType<typeof vi.fn>;
  requestAnimationFrame: ReturnType<typeof vi.fn>;
  cancelAnimationFrame: ReturnType<typeof vi.fn>;
}

let timeoutCallback: (() => void) | undefined;
let frameCallback: FrameRequestCallback | undefined;
let windowStub: WindowStub;

beforeEach(() => {
  timeoutCallback = undefined;
  frameCallback = undefined;
  windowStub = {
    setTimeout: vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return 11;
    }),
    clearTimeout: vi.fn(),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 22;
    }),
    cancelAnimationFrame: vi.fn(),
  };
  vi.stubGlobal("window", windowStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PageScope 生命周期", () => {
  it("dispose 会中止 signal、移除事件并且保持幂等", () => {
    const scope = new PageScope();
    const target = new EventTarget();
    const listener = vi.fn();
    scope.on(target, "change", listener);

    target.dispatchEvent(new Event("change"));
    scope.dispose();
    scope.dispose();
    target.dispatchEvent(new Event("change"));

    expect(listener).toHaveBeenCalledOnce();
    expect(scope.disposed).toBe(true);
    expect(scope.signal.aborted).toBe(true);
  });

  it("忽略空目标和已销毁 scope 的事件绑定", () => {
    const scope = new PageScope();
    const target = { addEventListener: vi.fn() } as unknown as EventTarget;
    const listener: EventListener = () => undefined;
    scope.on(null, "click", listener);
    scope.on(undefined, "click", listener);
    scope.dispose();
    scope.on(target, "click", listener);
    expect(target.addEventListener).not.toHaveBeenCalled();
  });

  it("保留事件选项并注入 scope 的 AbortSignal", () => {
    const scope = new PageScope();
    const addEventListener = vi.fn();
    const target = { addEventListener } as unknown as EventTarget;
    const listener = vi.fn();
    scope.on(target, "scroll", listener, { capture: true, passive: true });

    expect(addEventListener).toHaveBeenCalledWith(
      "scroll",
      listener,
      expect.objectContaining({ capture: true, passive: true, signal: scope.signal }),
    );
  });

  it("按后进先出执行清理，并隔离单个清理异常", () => {
    const scope = new PageScope();
    const calls: string[] = [];
    const error = new Error("cleanup failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const first = () => calls.push("first");

    expect(scope.add(first)).toBe(first);
    scope.add(() => {
      calls.push("throw");
      throw error;
    });
    scope.add(() => calls.push("last"));
    scope.dispose();

    expect(calls).toEqual(["last", "throw", "first"]);
    expect(consoleError).toHaveBeenCalledWith("页面清理函数执行失败", error);
  });

  it("已销毁时立即执行后来添加的清理函数", () => {
    const scope = new PageScope();
    const cleanup = vi.fn();
    scope.dispose();
    expect(scope.add(cleanup)).toBe(cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("管理定时器回调和取消操作", () => {
    const activeScope = new PageScope();
    const activeCallback = vi.fn();
    expect(activeScope.timeout(activeCallback, 250)).toBe(11);
    expect(windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
    timeoutCallback?.();
    expect(activeCallback).toHaveBeenCalledOnce();
    activeScope.dispose();
    expect(windowStub.clearTimeout).toHaveBeenCalledWith(11);

    const disposedScope = new PageScope();
    const disposedCallback = vi.fn();
    disposedScope.timeout(disposedCallback, 10);
    disposedScope.dispose();
    timeoutCallback?.();
    expect(disposedCallback).not.toHaveBeenCalled();
  });

  it("管理动画帧并在销毁后抑制回调", () => {
    const scope = new PageScope();
    const callback = vi.fn();
    expect(scope.animationFrame(callback)).toBe(22);
    expect(windowStub.requestAnimationFrame).toHaveBeenCalledOnce();
    frameCallback?.(123);
    expect(callback).toHaveBeenCalledWith(123);

    const disposedScope = new PageScope();
    const disposedCallback = vi.fn();
    disposedScope.animationFrame(disposedCallback);
    disposedScope.dispose();
    frameCallback?.(456);
    expect(disposedCallback).not.toHaveBeenCalled();
    expect(windowStub.cancelAnimationFrame).toHaveBeenCalledWith(22);
  });

  it("销毁时断开 Observer，已销毁时立即断开", () => {
    const scope = new PageScope();
    const first = { disconnect: vi.fn() };
    scope.observe(first);
    scope.dispose();
    expect(first.disconnect).toHaveBeenCalledOnce();

    const second = { disconnect: vi.fn() };
    scope.observe(second);
    expect(second.disconnect).toHaveBeenCalledOnce();
  });
});
