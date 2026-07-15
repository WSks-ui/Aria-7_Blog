const LOCAL_BASE = "https://aria.local";

export const normalizePath = (value: string): string => {
  let pathname = value || "/";
  if (/^https?:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch {
      pathname = value || "/";
    }
  } else {
    pathname = pathname.split(/[?#]/, 1)[0];
  }

  const normalized = `/${pathname}`.replace(/\/{2,}/g, "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
};

export const isNavItemActive = (currentPath: string, itemHref: string): boolean => {
  try {
    const target = new URL(itemHref, LOCAL_BASE);
    if (target.origin !== LOCAL_BASE) return false;
  } catch {
    return false;
  }

  const current = normalizePath(currentPath);
  const target = normalizePath(itemHref);
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
};
