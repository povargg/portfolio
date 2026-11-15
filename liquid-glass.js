import { createGlassBackdrop } from "./glass-backdrop.js";
import { createGlassSurface } from "./glass-surface.js";
import { glassScrollSpeed } from "./glass-motion.js";

export function createLiquidGlass() {
  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const panels = [...document.querySelectorAll(".hero, .page-section, .background-panel")];
  const appearance = document.querySelector(".appearance");
  const header = document.querySelector(".site-header");
  const wallpaper = document.querySelector(".glass-wallpaper");
  const backdrop = createGlassBackdrop();
  let surface;
  let enabled = false;
  let mode = "";
  let transparency = 1;
  let refraction = 1;
  let distortion = 1;
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

  try {
    surface = createGlassSurface(() => invalidate());
  } catch {
    // The native backdrop and CSS remain available if WebGL cannot initialize.
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
    if (backdrop && !introActive) {
      backdrop(speed, refraction, distortion);
      root.setAttribute("data-glass-backdrop", "");
    }
    if (surface && !introActive) {
      const ready = surface.draw({
        width, height, scrollY: y, tileSize, scrollOffset, tint, transparency, refraction, distortion,
        light: mode === "light",
        pointerX: reducedMotion.matches ? 0 : pointerX,
        pointerY: reducedMotion.matches ? 0 : pointerY,
        speed,
        time: now * .005,
      }, panels);
      root.toggleAttribute("data-glass-shader", ready);
    }
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
    if (!enabled || reducedMotion.matches || event.pointerType !== "mouse") return;
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
  header.addEventListener("transitionrun", (event) => {
    if (event.propertyName === "grid-template-rows") invalidate(360);
  });
  if ("ResizeObserver" in window) {
    const resize = new ResizeObserver(() => invalidate());
    resize.observe(header);
    for (const panel of panels) resize.observe(panel);
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
      if (enabled) {
        surface?.useWallpaper(mode);
        invalidate();
      } else {
        cancelAnimationFrame(frameId);
        frameId = undefined;
        root.removeAttribute("data-glass-backdrop");
        root.removeAttribute("data-glass-shader");
      }
    },
  };
}
