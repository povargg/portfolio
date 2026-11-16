import { createGlassSurface } from "./glass-surface.js";
import { glassScrollSpeed } from "./glass-motion.js";

export function createLiquidGlass() {
  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobileNavigation = matchMedia("(max-width: 58rem)");
  const stage = document.querySelector(".intro-stage");
  const panels = [...document.querySelector(".portfolio-content").querySelectorAll(".hero, .page-section, .background-panel")]
    .map((element) => ({ element, type: "panel" }));
  const getWelcomePanels = () => [...stage.querySelectorAll(".intro-scene-card")].map((element) => ({ element, type: "panel" }));
  let welcomePanels = getWelcomePanels();
  const appearance = document.querySelector(".appearance");
  const header = document.querySelector(".site-header");
  const navigation = header.querySelector(".site-navigation");
  const headerLens = { element: header.querySelector(".header-color"), type: "header" };
  const paletteLens = { element: appearance.querySelector(".appearance-toggle"), type: "control" };
  const menuLens = { element: appearance.querySelector(".preferences-panel"), type: "menu" };
  const navLenses = [...navigation.querySelectorAll(".nav-list a")].map((element) => ({ element, type: "control" }));
  const wallpaper = document.querySelector(".glass-wallpaper");
  let surface;
  let chrome;
  let enabled = false;
  let mode = "";
  let transparency = 1;
  let refraction = 1;
  let distortion = 1;
  let dispersion = 1;
  let edge = .3;
  let frameId;
  let redrawUntil = 0;
  let lastFrame;
  let lastScroll = window.scrollY;
  let speed = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  let lastTile;
  let lastOffset;

  function invalidate(duration = 0) {
    if (!enabled || document.hidden) return;
    if (duration > 0) redrawUntil = Math.max(redrawUntil, performance.now() + duration);
    if (frameId === undefined) frameId = requestAnimationFrame(draw);
  }

  function initializeSurface(host) {
    try {
      const renderer = createGlassSurface(() => invalidate(), host);
      renderer?.useWallpaper(mode);
      return renderer || false;
    } catch {
      // The native backdrop and CSS remain available if WebGL cannot initialize.
      return false;
    }
  }

  function draw(now) {
    frameId = undefined;
    if (!enabled) return;
    const width = root.clientWidth;
    const height = window.innerHeight;
    const y = window.scrollY;
    const elapsed = lastFrame === undefined ? 1000 / 60 : Math.max(1, now - lastFrame);
    speed = reducedMotion.matches ? 0 : glassScrollSpeed(speed, y - lastScroll, elapsed);
    const follow = 1 - Math.exp(-elapsed / 127);
    pointerX += (targetX - pointerX) * follow;
    pointerY += (targetY - pointerY) * follow;
    lastScroll = y;
    lastFrame = now;

    const style = getComputedStyle(root);
    const rem = parseFloat(style.fontSize);
    const tint = style.getPropertyValue("--surface").trim();
    const tileSize = Math.round(Math.max(45 * rem, Math.min(96 * rem, Math.max(width, height) * 1.1)));
    const scrollOffset = reducedMotion.matches ? 0 : -Math.max(0, y) * .19;

    const introActive = root.classList.contains("intro-active");
    const showPanels = !introActive || !stage.closest(".is-compact") && welcomePanels.some(({ element }) => !element.hidden);
    const showHeader = !introActive && (header.getBoundingClientRect().bottom > 0 || !menuLens.element.inert);
    const frame = {
      width, height, scrollY: y, tileSize, scrollOffset, tint, transparency, refraction, distortion, dispersion, edge,
      light: mode === "light",
      pointerX: reducedMotion.matches ? 0 : pointerX,
      pointerY: reducedMotion.matches ? 0 : pointerY,
      speed,
      time: now * .005,
    };
    if (showPanels) surface ??= initializeSurface();
    root.toggleAttribute("data-glass-shader",
      Boolean(showPanels && surface && surface.draw(frame, introActive ? welcomePanels : panels, introActive ? stage : null)));
    let chromeReady = false;
    if (showHeader) chrome ??= initializeSurface(header);
    if (showHeader && chrome) {
      const lenses = [headerLens];
      const clip = mobileNavigation.matches ? navigation.getBoundingClientRect() : null;
      for (const lens of navLenses) {
        if (lens.element.matches(':hover, :focus-visible, [aria-current="location"]')) lenses.push({ ...lens, clip });
      }
      lenses.push(paletteLens, menuLens);
      chromeReady = chrome.draw(frame, lenses);
    }
    root.toggleAttribute("data-glass-chrome", chromeReady);
    if (tileSize !== lastTile) {
      wallpaper.style.setProperty("--glass-tile", tileSize + "px");
      lastTile = tileSize;
    }
    if (scrollOffset !== lastOffset) {
      wallpaper.style.setProperty("--glass-offset", scrollOffset + "px");
      lastOffset = scrollOffset;
    }
    if (now < redrawUntil) invalidate();
  }

  window.addEventListener("scroll", () => invalidate(320), { passive: true });
  window.addEventListener("resize", () => invalidate());
  window.addEventListener("pointermove", (event) => {
    if (!enabled || reducedMotion.matches || event.pointerType !== "mouse" || root.matches(".skill-open, .image-view-open")) return;
    targetX = event.clientX / window.innerWidth * 2 - 1;
    targetY = event.clientY / window.innerHeight * 2 - 1;
    invalidate(210);
  }, { passive: true });
  reducedMotion.addEventListener("change", () => invalidate());
  document.addEventListener("visibilitychange", () => invalidate());
  document.addEventListener("animationstart", (event) => {
    if (event.animationName === "content-appear") invalidate(700);
  });
  appearance.addEventListener("transitionrun", () => invalidate(360));
  header.addEventListener("focusin", () => invalidate());
  header.addEventListener("focusout", () => invalidate());
  window.addEventListener("hashchange", () => invalidate());
  document.addEventListener("portfolio:section", () => invalidate());
  document.addEventListener("portfolio:intro", () => invalidate(650));
  document.addEventListener("portfolio:intro-content", () => { welcomePanels = getWelcomePanels(); invalidate(); });
  document.addEventListener("portfolio:scene", () => invalidate());
  header.addEventListener("transitionrun", (event) => {
    if (event.propertyName === "grid-template-rows") invalidate(360);
    if (event.propertyName === "transform" && event.target.matches(".nav-list a, .appearance-toggle")) invalidate(240);
  });
  if ("ResizeObserver" in window) {
    const resize = new ResizeObserver(() => invalidate());
    resize.observe(header);
    for (const { element } of panels) resize.observe(element);
  }

  return {
    update(preferences, colorMode) {
      if (preferences.glass && !enabled) {
        lastFrame = undefined;
        lastScroll = window.scrollY;
        speed = 0;
      }
      enabled = preferences.glass;
      mode = colorMode;
      transparency = preferences.transparency / 100;
      refraction = preferences.refraction / 100;
      distortion = preferences.distortion / 100;
      dispersion = preferences.dispersion / 100;
      edge = preferences.edge / 100;
      if (enabled) {
        if (surface) surface.useWallpaper(mode);
        if (chrome) chrome.useWallpaper(mode);
        invalidate();
      } else {
        cancelAnimationFrame(frameId);
        frameId = undefined;
        root.removeAttribute("data-glass-chrome");
        root.removeAttribute("data-glass-shader");
      }
    },
  };
}
