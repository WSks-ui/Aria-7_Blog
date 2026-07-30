import { PageScope } from "../core/page-scope";
import { RuntimeStyles } from "../core/runtime-styles";
import {
  deriveHomeScrollSnapshot,
  mapHomeRevealProgress,
  type HomeScrollSnapshot,
} from "../core/home-scroll-state";

interface HomeLayerControllerOptions {
  scope: PageScope;
  runtimeStyles: RuntimeStyles;
  reduceMotion: boolean;
}

interface RevealTarget extends HTMLElement {
  dataset: DOMStringMap & {
    homeRevealStart?: string;
    homeRevealEnd?: string;
  };
}

const parseRevealBoundary = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const initHomeLayerController = ({
  scope,
  runtimeStyles,
  reduceMotion,
}: HomeLayerControllerOptions): boolean => {
  const stage = document.querySelector<HTMLElement>("[data-home-layer-stage]");
  const feedVisual = document.querySelector<HTMLElement>("[data-home-feed-visual]");
  const dataLayer = document.querySelector<HTMLElement>("[data-home-data-layer]");
  if (!stage || !feedVisual || !dataLayer) return false;

  const homeNavHeader = document.querySelector<HTMLElement>(".site-header--brandless");
  const feedSpot = feedVisual.querySelector<HTMLElement>("[data-feed-spot]");
  const mobileQuery = window.matchMedia("(max-width: 900px)");
  const revealTargets = [...dataLayer.querySelectorAll<RevealTarget>("[data-home-reveal]")];
  const activatableButtons = [...dataLayer.querySelectorAll<HTMLButtonElement>("[data-home-activatable]")];

  let frame = 0;
  let pointerFrame = 0;
  let pointerEvent: PointerEvent | null = null;
  let navReturnTimer = 0;
  let layerEndLockTimer = 0;
  let footerRevealTimer = 0;
  let footerRetractTimer = 0;
  let layerEndLocked = false;
  let wasPastHero = document.body.classList.contains("is-past-hero");
  let wasInteractive: boolean | null = null;
  let lastSnapshot: HomeScrollSnapshot | null = null;

  const readSnapshot = (): HomeScrollSnapshot => {
    const stageBounds = stage.getBoundingClientRect();
    const dataBounds = dataLayer.getBoundingClientRect();
    return deriveHomeScrollSnapshot({
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      stageHeight: stageBounds.height,
      dataTop: dataBounds.top,
      dataHeight: dataBounds.height,
      mobile: mobileQuery.matches,
      reduceMotion,
    });
  };

  const setPastHeroState = (pastHero: boolean) => {
    if (pastHero === wasPastHero) return;
    wasPastHero = pastHero;
    document.body.classList.toggle("is-past-hero", pastHero);

    if (!pastHero && homeNavHeader) {
      window.clearTimeout(navReturnTimer);
      homeNavHeader.classList.remove("is-nav-open");
      homeNavHeader.classList.add("is-nav-returning");
      navReturnTimer = window.setTimeout(() => {
        homeNavHeader.classList.remove("is-nav-returning");
      }, reduceMotion ? 0 : 680);
      return;
    }
    homeNavHeader?.classList.remove("is-nav-returning", "is-nav-open");
  };

  const setContentInteractive = (interactive: boolean) => {
    if (interactive === wasInteractive) return;
    wasInteractive = interactive;
    dataLayer.inert = !interactive;
    dataLayer.setAttribute("aria-hidden", String(!interactive));
    document.body.classList.toggle("is-home-data-interactive", interactive);
  };

  const applyRevealProgress = (dataProgress: number) => {
    for (const target of revealTargets) {
      const start = parseRevealBoundary(target.dataset.homeRevealStart, 0);
      const end = parseRevealBoundary(target.dataset.homeRevealEnd, 1);
      const reveal = mapHomeRevealProgress(dataProgress, start, end);
      const revealed = reveal > 0;
      if (!revealed && target.contains(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
      target.inert = !revealed;
      target.setAttribute("aria-hidden", String(!revealed));
      runtimeStyles.set(target, "--home-reveal-opacity", reveal.toFixed(3));
      runtimeStyles.set(target, "--home-reveal-y", `${((1 - reveal) * 18).toFixed(2)}px`);
    }
  };

  const clearFooterTimers = () => {
    window.clearTimeout(footerRevealTimer);
    window.clearTimeout(footerRetractTimer);
    footerRevealTimer = 0;
    footerRetractTimer = 0;
  };

  const scheduleFooterRetract = () => {
    window.clearTimeout(footerRetractTimer);
    footerRetractTimer = window.setTimeout(() => {
      footerRetractTimer = 0;
      const current = readSnapshot();
      if (!current.footerEligible) return;
      document.body.classList.remove("is-home-footer-visible");
      window.scrollTo({
        top: current.scrollRange,
        left: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }, 3000);
  };

  const syncFooterState = (snapshot: HomeScrollSnapshot) => {
    if (snapshot.mobile || !snapshot.footerEligible) {
      clearFooterTimers();
      document.body.classList.remove("is-home-footer-visible");
      return;
    }

    if (document.body.classList.contains("is-home-footer-visible")) {
      scheduleFooterRetract();
      return;
    }
    if (footerRevealTimer) return;

    footerRevealTimer = window.setTimeout(() => {
      footerRevealTimer = 0;
      if (!readSnapshot().footerEligible) return;
      document.body.classList.add("is-home-footer-visible");
      scheduleFooterRetract();
    }, reduceMotion ? 0 : 220);
  };

  const applySnapshot = (snapshot: HomeScrollSnapshot, syncFooter = false) => {
    lastSnapshot = snapshot;
    setPastHeroState(snapshot.pastHero);
    setContentInteractive(snapshot.contentInteractive);
    runtimeStyles.set(stage, "--home-layer-progress", snapshot.progress.toFixed(3));
    runtimeStyles.set(stage, "--home-layer-split-y", `${snapshot.splitY.toFixed(2)}px`);
    runtimeStyles.set(dataLayer, "--home-data-progress", snapshot.dataProgress.toFixed(3));
    applyRevealProgress(snapshot.dataProgress);
    if (syncFooter) syncFooterState(snapshot);
  };

  const sync = (syncFooter = false) => {
    frame = 0;
    applySnapshot(readSnapshot(), syncFooter);
  };

  const requestSync = (syncFooter = false) => {
    if (frame) {
      if (syncFooter) syncFooterState(lastSnapshot ?? readSnapshot());
      return;
    }
    frame = window.requestAnimationFrame(() => sync(syncFooter));
  };

  const holdLayerEnd = () => {
    layerEndLocked = true;
    document.body.classList.add("is-layer-end-hold");
    window.clearTimeout(layerEndLockTimer);
    layerEndLockTimer = window.setTimeout(() => {
      layerEndLocked = false;
      document.body.classList.remove("is-layer-end-hold");
    }, reduceMotion ? 0 : 420);
  };

  const guardLayerEndScroll = (event: WheelEvent) => {
    if (event.defaultPrevented || event.deltaY <= 0 || mobileQuery.matches) return;
    const snapshot = readSnapshot();
    const scrollY = window.scrollY;
    if (layerEndLocked && snapshot.layerEndReached) {
      event.preventDefault();
      window.scrollTo({ top: snapshot.scrollRange, left: 0, behavior: "auto" });
      return;
    }
    if (scrollY < snapshot.scrollRange - 2 && scrollY + event.deltaY >= snapshot.scrollRange) {
      event.preventDefault();
      window.scrollTo({ top: snapshot.scrollRange, left: 0, behavior: "auto" });
      holdLayerEnd();
      applySnapshot(readSnapshot());
    }
  };

  const scrollToLayerEnd = (event: Event) => {
    event.preventDefault();
    const snapshot = readSnapshot();
    const mobileTarget = window.scrollY + dataLayer.getBoundingClientRect().top;
    window.scrollTo({
      top: snapshot.mobile ? mobileTarget : snapshot.scrollRange,
      left: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    window.history.replaceState({}, "", "#lab-feed");
  };

  const resetPointer = () => {
    pointerEvent = null;
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    feedVisual.classList.remove("is-pointer-active");
  };

  const syncPointer = () => {
    pointerFrame = 0;
    if (!pointerEvent || !feedSpot) return;
    const bounds = feedVisual.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = pointerEvent.clientX - bounds.left;
    const y = pointerEvent.clientY - bounds.top;
    feedVisual.classList.add("is-pointer-active");
    runtimeStyles.set(
      feedSpot,
      "transform",
      `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`,
    );
  };

  const clearActiveCards = (except?: HTMLButtonElement) => {
    for (const button of activatableButtons) {
      if (button === except) continue;
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    }
  };

  for (const button of activatableButtons) {
    scope.on(button, "click", () => {
      const active = !button.classList.contains("is-active");
      clearActiveCards(button);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  document.querySelectorAll<HTMLAnchorElement>('a[href="#lab-feed"]').forEach((link) => {
    scope.on(link, "click", scrollToLayerEnd);
  });
  scope.on(document, "keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape") clearActiveCards();
  });
  scope.on(window, "wheel", (event) => guardLayerEndScroll(event as WheelEvent), { passive: false });
  scope.on(window, "scroll", () => requestSync(true), { passive: true });
  scope.on(window, "resize", () => sync());
  scope.on(mobileQuery, "change", () => sync(true));

  if (!reduceMotion) {
    scope.on(feedVisual, "pointermove", (event) => {
      const current = event as PointerEvent;
      if (current.pointerType === "touch") return;
      pointerEvent = current;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(syncPointer);
    });
    scope.on(feedVisual, "pointerleave", resetPointer);
  }

  if (window.location.hash === "#lab-feed") {
    scope.animationFrame(() => {
      const snapshot = readSnapshot();
      const mobileTarget = window.scrollY + dataLayer.getBoundingClientRect().top;
      window.scrollTo({ top: snapshot.mobile ? mobileTarget : snapshot.scrollRange, left: 0, behavior: "auto" });
      sync();
    });
  } else {
    sync();
  }

  scope.add(() => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(navReturnTimer);
    window.clearTimeout(layerEndLockTimer);
    clearFooterTimers();
    resetPointer();
    clearActiveCards();
    revealTargets.forEach((target) => {
      target.inert = false;
      target.removeAttribute("aria-hidden");
    });
    dataLayer.inert = false;
    dataLayer.removeAttribute("aria-hidden");
    document.body.classList.remove(
      "is-layer-end-hold",
      "is-home-footer-visible",
      "is-home-data-interactive",
    );
  });
  return true;
};
