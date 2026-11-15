const portfolioMotion = (() => {
  const introKey = "portfolio-intro-seen";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

  function revealContent() {
    if (!("IntersectionObserver" in window) || reducedMotion.matches) return;

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
    }, { threshold: 0, rootMargin: "0px 0px -24px" });

    for (const block of document.querySelectorAll(".hero, .page-section, .background-panel, .feature, .site-footer")) {
      block.classList.add("reveal-pending");
      observer.observe(block);
    }
  }

  function ease(start, end, progress) {
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function start() {
    if (location.hash || readFlag(introKey)) {
      revealContent();
      return;
    }

    const intro = document.querySelector(".welcome-intro");
    const stage = intro.querySelector(".intro-stage");
    const name = intro.querySelector(".intro-name");
    const content = document.querySelector(".portfolio-content");
    const main = content.querySelector("main");
    const next = intro.querySelector(".intro-next");
    const skip = document.querySelector(".skip-link");
    const bio = intro.querySelector(".intro-about");
    const about = content.querySelector(".about-row");
    const originalPortrait = about.querySelector(".portrait-reveal");
    const introAbout = about.cloneNode(true);
    const portrait = introAbout.querySelector(".portrait-reveal");
    const portraitToggle = portrait.querySelector("summary");
    const root = document.documentElement;
    const scrollRestoration = history.scrollRestoration;
    let scrollFrame;
    let photoTimer;
    let finished = false;
    let photoShown = false;
    let progress = 0;

    bio.append(introAbout);
    intro.hidden = false;
    bio.inert = true;
    content.inert = true;
    history.scrollRestoration = "manual";
    root.classList.add("intro-active");

    function finish({ showPortrait = false, focus = false } = {}) {
      if (finished) return;
      finished = true;
      writeFlag(introKey);
      clearTimeout(photoTimer);
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", queueFrame);
      window.removeEventListener("resize", queueFrame);
      window.removeEventListener("hashchange", finishFromAnchor);
      skip.removeEventListener("click", finishFromSkip);
      history.scrollRestoration = scrollRestoration;

      originalPortrait.open = showPortrait;
      content.inert = false;
      intro.inert = true;
      intro.classList.add("is-leaving");
      root.classList.remove("intro-active");
      const anchor = location.hash && document.getElementById(location.hash.slice(1));
      if (anchor) anchor.scrollIntoView({ behavior: "instant", block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
      if (focus) main.focus({ preventScroll: true });
      revealContent();

      if (reducedMotion.matches) intro.hidden = true;
      else {
        stage.addEventListener("transitionend", (event) => {
          if (event.target === stage && event.propertyName === "opacity") intro.hidden = true;
        });
        window.setTimeout(() => { intro.hidden = true; }, 800);
      }
    }

    function finishFromAnchor() {
      finish();
    }

    function finishFromSkip(event) {
      event.preventDefault();
      finish({ focus: true });
    }

    function render() {
      scrollFrame = undefined;
      const distance = Math.max(1, intro.offsetHeight - stage.offsetHeight);
      progress = Math.max(0, Math.min(1, window.scrollY / distance));
      if (progress >= .985) {
        finish({ showPortrait: photoShown, focus: intro.contains(document.activeElement) });
        return;
      }

      const animation = reducedMotion.matches
        ? (start, end) => Number(progress >= (start + end) / 2)
        : (start, end) => ease(start, end, progress);
      const showName = animation(.035, .30);
      const moveHeading = animation(.34, .74);
      const showBio = animation(.48, .78);
      const hint = 1 - animation(.38, .61);
      const style = stage.style;
      style.setProperty("--intro-heading-y", (49 - moveHeading * 35) + "%");
      style.setProperty("--intro-heading-scale", 1 - moveHeading * .39);
      style.setProperty("--intro-name-opacity", showName);
      style.setProperty("--intro-name-rise", (1 - showName) * 1.4 + "rem");
      style.setProperty("--intro-bio-opacity", showBio);
      style.setProperty("--intro-bio-rise", (1 - showBio) * 1.55 + "rem");
      style.setProperty("--intro-bio-blur", (1 - showBio) * 9 + "px");
      style.setProperty("--intro-hint-opacity", hint);
      name.setAttribute("aria-hidden", String(showName === 0));
      bio.inert = showBio < .82;
      next.classList.toggle("is-faint", hint < .07);
      if (hint < .07 && document.activeElement === next && !bio.inert) {
        portraitToggle.focus({ preventScroll: true });
      }
      next.inert = hint < .07 && !bio.inert;
    }

    function queueFrame() {
      if (scrollFrame === undefined) scrollFrame = requestAnimationFrame(render);
    }

    function finishAfterPortrait(focus) {
      photoShown = true;
      clearTimeout(photoTimer);
      photoTimer = window.setTimeout(() => finish({ showPortrait: true, focus }), reducedMotion.matches ? 400 : 1150);
    }

    next.addEventListener("click", () => {
      const distance = intro.offsetHeight - stage.offsetHeight;
      const target = progress < .27 ? .31 : .80;
      window.scrollTo({ top: distance * target, behavior: reducedMotion.matches ? "instant" : "smooth" });
    });
    portraitToggle.addEventListener("pointerenter", (event) => {
      if (!bio.inert && event.pointerType === "mouse" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
        finishAfterPortrait(false);
      }
    });
    portraitToggle.addEventListener("pointerleave", () => {
      if (!portrait.open) clearTimeout(photoTimer);
    });
    portrait.addEventListener("toggle", () => {
      if (portrait.open && !bio.inert) finishAfterPortrait(portraitToggle === document.activeElement);
      else clearTimeout(photoTimer);
    });
    skip.addEventListener("click", finishFromSkip);
    window.addEventListener("hashchange", finishFromAnchor);
    window.addEventListener("scroll", queueFrame, { passive: true });
    window.addEventListener("resize", queueFrame);
    window.scrollTo({ top: 0, behavior: "instant" });
    render();
  }

  return { start, readFlag, writeFlag };
})();
