import { expect, test as base, type Page } from "@playwright/test";

interface CspViolation {
  blockedURI: string;
  effectiveDirective: string;
  sourceFile: string;
}

interface RuntimeIssues {
  consoleErrors: string[];
  cspViolations: CspViolation[];
  pageErrors: string[];
  unexpectedExternalRequests: string[];
}

interface Fixtures {
  runtimeIssues: RuntimeIssues;
}

const metingPayload = [
  {
    name: "Mock Meting Track",
    artist: "Aria Test",
    url: "https://api.i-meto.com/test/audio.mp3",
    pic: "https://api.i-meto.com/test/cover.webp",
    lrc: "https://api.i-meto.com/test/track.lrc",
  },
];

const installNetworkSandbox = async (page: Page, issues: RuntimeIssues) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }

    if (url.hostname === "giscus.app") {
      if (url.pathname === "/client.js") {
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: `(() => {
            const root = document.currentScript?.parentElement;
            const marker = document.createElement("div");
            marker.className = "giscus-mock";
            marker.setAttribute("role", "status");
            marker.textContent = "Giscus mock loaded";
            root?.append(marker);
          })();`,
        });
      } else {
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Giscus mock</title>" });
      }
      return;
    }

    if (url.hostname === "api.i-meto.com") {
      const commonHeaders = { "access-control-allow-origin": "*", "cache-control": "no-store" };
      if (url.pathname.endsWith(".lrc")) {
        await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: commonHeaders, body: "[00:00.00]Mock lyric" });
      } else if (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".webp")) {
        await route.fulfill({ status: 204, headers: commonHeaders, body: "" });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", headers: commonHeaders, body: JSON.stringify(metingPayload) });
      }
      return;
    }

    if (url.hostname.endsWith(".music.126.net")) {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
      return;
    }

    issues.unexpectedExternalRequests.push(request.url());
    await route.abort("blockedbyclient");
  });
};

export const test = base.extend<Fixtures>({
  runtimeIssues: [async ({ page }, use) => {
    const issues: RuntimeIssues = {
      consoleErrors: [],
      cspViolations: [],
      pageErrors: [],
      unexpectedExternalRequests: [],
    };

    // pageerror 只覆盖未捕获异常；显式 console.error 同样代表生产页面的运行时故障。
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1})`
        : "";
      issues.consoleErrors.push(`${message.text()}${source}`);
    });
    page.on("pageerror", (error) => issues.pageErrors.push(error.message));
    await page.addInitScript(() => {
      const violations: CspViolation[] = [];
      Object.defineProperty(window, "__ariaTestCspViolations", {
        configurable: true,
        value: violations,
      });
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
          sourceFile: event.sourceFile,
        });
      });
    });
    await installNetworkSandbox(page, issues);

    await use(issues);

    const browserViolations = await page.evaluate(() =>
      ((window as typeof window & { __ariaTestCspViolations?: CspViolation[] }).__ariaTestCspViolations ?? []),
    ).catch(() => []);
    issues.cspViolations.push(...browserViolations);
    expect.soft(issues.consoleErrors, "页面不应输出 console.error").toEqual([]);
    expect.soft(issues.pageErrors, "页面不应产生未捕获异常").toEqual([]);
    expect.soft(issues.cspViolations, "页面不应触发 CSP 违规").toEqual([]);
    expect.soft(issues.unexpectedExternalRequests, "E2E 不应访问未 mock 的公网资源").toEqual([]);
  }, { auto: true }],
});

export { expect };
