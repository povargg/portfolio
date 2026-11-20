const portfolioMotion = (() => {
  const introKey = "portfolio-intro-seen";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactScreen = matchMedia("(max-width: 42rem), (max-height: 34rem) and (pointer: coarse)");
  const intro = document.querySelector(".welcome-intro");
  const stage = intro.querySelector(".intro-stage");
  const inner = intro.querySelector(".intro-inner");
  const introOptions = intro.querySelector(".intro-options");
  const bio = intro.querySelector(".intro-about");
  const content = document.querySelector(".portfolio-content");
  let contentObserved = false;
  let introRunning = false;
  let hideTimer;
  let story;
  let leaveIntro;

  function readFlag(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function writeFlag(key) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // The current page still remembers the interaction.
    }
  }

  function revealContent(content) {
    if (contentObserved || !("IntersectionObserver" in window) || reducedMotion.matches) return;
    contentObserved = true;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        entry.target.classList.remove("reveal-pending");
        entry.target.classList.add("reveal-running");
        entry.target.addEventListener("animationend", () => {
          entry.target.classList.remove("reveal-running");
        }, { once: true });
      }
    }, { rootMargin: "0px 0px -24px" });

    for (const block of content.querySelectorAll(".hero, .page-section, .background-panel, .feature, .site-footer")) {
      block.classList.add("reveal-pending");
      observer.observe(block);
    }
  }

  function start(replay = false) {
    if (introRunning) return;
    if (!replay && (location.hash || readFlag(introKey))) {
      revealContent(content);
      return;
    }
    const compact = compactScreen.matches;
    let activeStory;

    const root = document.documentElement;
    const name = intro.querySelector(".intro-name");
    const next = intro.querySelector(".intro-next");
    const chapterButton = intro.querySelector(".intro-step");
    const skip = document.querySelector(".skip-link");
    const main = content.querySelector("main");
    const scrollRestoration = history.scrollRestoration;
    const controller = new AbortController();
    const { signal } = controller;
    let finished = false;

    if (replay && location.hash) history.replaceState(history.state, "", location.pathname + location.search);
    introRunning = true;
    clearTimeout(hideTimer);
    intro.classList.remove("is-leaving");
    intro.classList.toggle("is-compact", compact);
    intro.inert = false;
    intro.hidden = false;
    stage.removeAttribute("style");
    inner.removeAttribute("style");
    chapterButton.hidden = true;
    inner.inert = false;
    introOptions.inert = false;
    next.inert = false;
    next.classList.remove("is-faint");
    name.setAttribute("aria-hidden", "true");
    bio.inert = true;
    content.inert = true;
    history.scrollRestoration = "manual";
    root.classList.add("intro-active");

    function finish(focus = false) {
      if (finished) return;
      finished = true;
      writeFlag(introKey);
      controller.abort();
      introRunning = false;
      leaveIntro = undefined;
      history.scrollRestoration = scrollRestoration;
      if (activeStory?.portrait.open) activeStory.originalPortrait.open = true;
      content.inert = false;
      intro.inert = true;
      intro.classList.add("is-leaving");
      root.classList.remove("intro-active");
      const anchor = location.hash && document.getElementById(location.hash.slice(1));
      if (anchor) anchor.scrollIntoView({ behavior: "instant", block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
      if (focus) main.focus({ preventScroll: true });
      revealContent(content);
      document.dispatchEvent(new Event("portfolio:intro"));
      if (reducedMotion.matches) intro.hidden = true;
      else hideTimer = window.setTimeout(() => { intro.hidden = true; }, 650);
    }

    leaveIntro = finish;
    skip.addEventListener("click", (event) => {
      event.preventDefault();
      finish(true);
    }, { signal });
    window.addEventListener("hashchange", () => finish(), { signal });
    window.scrollTo({ top: 0, behavior: "instant" });
    if (replay) next.focus({ preventScroll: true });

    function startCompact() {
      intro.classList.add("is-compact");
      next.disabled = false;
      next.addEventListener("click", () => finish(true), { signal });
      const onScroll = () => {
        if (window.scrollY >= Math.min(40, stage.clientHeight * .1)) {
          finish(intro.contains(document.activeElement));
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true, signal });
      onScroll();
    }

    if (compact) {
      startCompact();
    } else {
      next.disabled = true;
      Promise.all([
        portfolioMedia.loadScript("intro-story.js"),
        portfolioMedia.loadStylesheet("intro-story.css"),
      ]).then(() => {
        if (finished) return;
        if (compactScreen.matches) {
          startCompact();
          return;
        }
        next.disabled = false;
        if (replay && document.activeElement === document.body) next.focus({ preventScroll: true });
        if (!story) {
          story = portfolioIntroStory.prepare(intro, content);
          document.dispatchEvent(new CustomEvent("portfolio:intro-content", { detail: intro }));
        }
        activeStory = story;
        story.portrait.open = false;
        story.typed.textContent = "";
        portfolioIntroStory.play(intro, story, reducedMotion, finish, signal);
      }).catch(() => { if (!finished) startCompact(); });
    }
    document.dispatchEvent(new Event("portfolio:intro"));
  }

  return { start, readFlag, writeFlag, exit: () => leaveIntro?.() };
})();
