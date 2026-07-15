import { describe, expect, it } from "vitest";
import { isNavItemActive, normalizePath } from "../../src/scripts/core/navigation";

describe("导航路径", () => {
  it.each([
    ["", "/"],
    ["/", "/"],
    ["blog", "/blog"],
    ["/blog/", "/blog"],
    ["//blog///welcome//", "/blog/welcome"],
    ["https://example.test/blog/?tag=Astro#top", "/blog"],
  ])("将 %s 规范化为 %s", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("首页只精确匹配，栏目匹配自身和子路由", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/blog", "/blog/")).toBe(true);
    expect(isNavItemActive("/blog/welcome/", "/blog")).toBe(true);
    expect(isNavItemActive("/blogger", "/blog")).toBe(false);
    expect(isNavItemActive("/game", "/")).toBe(false);
    expect(isNavItemActive("/blog", "https://example.com/blog")).toBe(false);
  });
});
