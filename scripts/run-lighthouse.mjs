import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const configuredChromePath = process.env.CHROME_PATH;
const playwrightChromePath = chromium.executablePath();
const chromePath = configuredChromePath || playwrightChromePath;

if (!existsSync(chromePath)) {
  console.error(
    "找不到 Chromium。请先运行 `npx playwright install chromium`，或通过 CHROME_PATH 指定浏览器可执行文件。",
  );
  process.exitCode = 1;
} else {
  // 统一由 Playwright 管理本地和 CI 的 Chromium，避免 LHCI 在不同系统上猜测 Chrome 安装路径。
  const cliPath = resolve("node_modules", "@lhci", "cli", "src", "cli.js");
  const child = spawn(process.execPath, [cliPath, "autorun", "--config=.lighthouserc.cjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      CHROME_PATH: chromePath,
    },
  });

  child.on("error", (error) => {
    console.error(`无法启动 Lighthouse CI：${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Lighthouse CI 被信号 ${signal} 中断。`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}
