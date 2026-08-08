/* Aria-7th Lab 主题初始化（防 FOUC）
 * 必须同步加载（<script src> 无 defer/async）：在首次绘制前把 data-theme 写到 <html>，
 * 否则暗色用户会先看到一帧亮色。CSP script-src 'self' 禁止内联脚本，故为外部文件。
 * localStorage 在隐私模式可能抛异常，全部 try/catch 兜底为跟随系统。 */
(function () {
  var STORAGE_KEY = "aria-theme";
  var MODES = { light: 1, dark: 1, system: 1 };
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function readStored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value && MODES[value] ? value : "system";
    } catch (error) {
      return "system";
    }
  }

  function apply(mode) {
    var resolved = mode === "system" ? (media.matches ? "dark" : "light") : mode;
    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-mode", mode);
    root.style.colorScheme = resolved;
  }

  apply(readStored());

  /* 系统主题变化：仅跟随系统模式下实时响应 */
  media.addEventListener("change", function () {
    if (readStored() === "system") apply("system");
  });

  /* ClientRouter 换页不重跑本脚本；<html> 属性理论保留，防御性重应用一次 */
  document.addEventListener("astro:after-swap", function () {
    apply(readStored());
  });

  /* 切换面板调用的全局接口（interactions.ts 挂载） */
  window.__ariaSetTheme = function (mode) {
    if (!MODES[mode]) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      /* 存储不可用时仅当次会话生效 */
    }
    apply(mode);
  };
})();
