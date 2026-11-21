const portfolioIntroStory = (() => {
  const openingLength = 1.58;
  const sceneStart = 1.72;
  const sceneLength = .95;
  const typingTime = 3000;

  function ease(start, end, progress) {
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function cloneScene(source) {
    const clone = source.cloneNode(true);
    const elements = [clone, ...clone.querySelectorAll("*")];
    const ids = new Map(elements.filter((item) => item.id).map((item) => [item.id, "welcome-" + item.id]));
    for (const item of elements) {
      if (item.matches('.reflection-canvas, .image-preview img[aria-hidden="true"]')) {
        item.remove();
        continue;
      }
      item.classList.remove("reveal-pending", "reveal-running", "is-tilting");
      if (item.id) item.id = ids.get(item.id);
      for (const attribute of ["for", "aria-labelledby", "aria-describedby", "aria-controls"]) {
        if (item.hasAttribute(attribute)) {
          item.setAttribute(attribute, item.getAttribute(attribute).split(/\s+/).map((id) => ids.get(id) ?? id).join(" "));
        }
      }
    }
    const scene = document.createElement("div");
    scene.className = "intro-scene-card";
    scene.hidden = true;
    scene.inert = true;
    scene.append(clone);
    return scene;
  }

  function prepare(intro, content) {
    const stage = intro.querySelector(".intro-stage");
    const bio = intro.querySelector(".intro-about");
    const about = content.querySelector(".about-row");
    const copy = about.cloneNode(true);
    const portrait = copy.querySelector(".portrait-reveal");
    portrait.querySelector(".portrait-model")?.remove();
    portrait.classList.remove("has-portrait-roll", "roll-closed");
    const complete = copy.querySelector("[data-i18n=intro]");
    const typewriter = document.createElement("div");
    typewriter.className = "intro-typewriter";
    complete.className = "intro-type-measure";
    complete.before(typewriter);
    const typed = document.createElement("p");
    typed.className = "intro-typed";
    typed.setAttribute("aria-hidden", "true");
    typewriter.append(complete, typed);
    bio.append(copy);

    const scenes = ["ultimate-desktop-effects", "povardock", "linux-dotfiles", "portfolio-webseite", "skills", "erfahrung", "bildung", "kontakt"]
      .map((id) => cloneScene(document.getElementById(id)));
    stage.querySelector(".intro-scenes").append(...scenes);
    const end = sceneStart + (scenes.length + .63) * sceneLength;
    intro.style.setProperty("--intro-length", (1 + end + .16) * 100 + "svh");

    return { typed, complete, scenes, end, portrait, originalPortrait: about.querySelector(".portrait-reveal") };
  }

  function play(intro, story, reducedMotion, finish, signal) {
    const stage = intro.querySelector(".intro-stage");
    const inner = intro.querySelector(".intro-inner");
    const introOptions = intro.querySelector(".intro-options");
    const bio = intro.querySelector(".intro-about");
    const name = intro.querySelector(".intro-name");
    const next = intro.querySelector(".intro-next");
    const chapterButton = intro.querySelector(".intro-step");
    const { typed, complete, scenes, end } = story;
    let frame;
    let typingAt;
    let text = "";
    let units = 0;
    let shown = 0;
    let activeScene = 0;
    let lastIndex;
    let lastOpening;
    let catchingUp = false;
    let previousTime;

    signal.addEventListener("abort", () => cancelAnimationFrame(frame), { once: true });

    function setScenePosition(index) {
      if (index === lastIndex) return;
      lastIndex = index;
      activeScene = Math.round(index);
      inner.inert = index > .45;
      inner.style.setProperty("--story-hero-rise", (-index * 33) + "svh");
      inner.style.setProperty("--story-hero-opacity", 1 - ease(.10, .88, index));
      for (const [position, scene] of scenes.entries()) {
        const shift = position + 1 - index;
        const distance = Math.abs(shift);
        scene.hidden = distance >= .99;
        scene.inert = position + 1 !== activeScene;
        if (scene.hidden) continue;
        scene.style.setProperty("--scene-rise", shift * 33 + "svh");
        scene.style.setProperty("--scene-scale", 1 - distance * .075);
        scene.style.setProperty("--scene-opacity", 1 - ease(.11, .99, distance));
      }
      chapterButton.querySelector("[data-i18n=introAdvance]").hidden = activeScene === scenes.length;
      chapterButton.querySelector("[data-i18n=introFinish]").hidden = activeScene !== scenes.length;
      document.dispatchEvent(new Event("portfolio:scene"));
    }

    function render(now) {
      frame = undefined;
      const elapsed = Math.max(0, Math.min(50, now - (previousTime ?? now)));
      previousTime = now;
      units = Math.max(0, window.scrollY / Math.max(1, stage.clientHeight));
      const progress = Math.min(1, units / openingLength);
      const animation = reducedMotion.matches
        ? (from, to) => Number(progress >= (from + to) / 2)
        : (from, to) => ease(from, to, progress);
      const showName = animation(.035, .30);
      const nameOpacity = ease(.33, 1, showName);
      const optionsOpacity = 1 - ease(.02, .31, showName);
      const moveHeading = animation(.34, .74);
      const showBio = animation(.48, .78);
      const hint = 1 - animation(.38, .61);
      if (progress !== lastOpening) {
        lastOpening = progress;
        const style = stage.style;
        style.setProperty("--intro-heading-y", (49 - moveHeading * 35) + "%");
        style.setProperty("--intro-heading-scale", 1 - moveHeading * .39);
        style.setProperty("--intro-name-opacity", nameOpacity);
        style.setProperty("--intro-options-opacity", optionsOpacity);
        style.setProperty("--intro-name-rise", (1 - showName) * 1.4 + "rem");
        style.setProperty("--intro-bio-opacity", showBio);
        style.setProperty("--intro-bio-rise", (1 - showBio) * 1.55 + "rem");
        style.setProperty("--intro-bio-blur", (1 - showBio) * 9 + "px");
        style.setProperty("--intro-hint-opacity", hint);
        name.setAttribute("aria-hidden", String(nameOpacity === 0));
        introOptions.inert = optionsOpacity === 0;
        bio.inert = showBio < .78;
        next.classList.toggle("is-faint", hint < .07);
        chapterButton.hidden = showBio < .76;
        if (hint < .07 && !chapterButton.hidden && document.activeElement === next) {
          chapterButton.focus({ preventScroll: true });
        }
        next.inert = hint < .07 && !chapterButton.hidden;
      }

      if (showBio > .32 && typingAt === undefined) {
        typingAt = now;
        text = complete.textContent;
        document.dispatchEvent(new Event("portfolio:portrait-visible"));
      }
      const typedRatio = typingAt === undefined ? 0 : reducedMotion.matches ? 1 : Math.min(1, (now - typingAt) / typingTime);
      const visibleText = text.slice(0, Math.floor(text.length * typedRatio));
      if (typed.textContent !== visibleText) typed.textContent = visibleText;
      typed.classList.toggle("is-typing", typedRatio > 0 && typedRatio < 1);

      const track = Math.max(0, (units - sceneStart) / sceneLength);
      if (typedRatio < 1 && track > .52) catchingUp = true;
      if (typedRatio === 1) {
        shown = catchingUp && track > shown ? Math.min(track, shown + elapsed / 190) : track;
        if (shown >= track) catchingUp = false;
      } else shown = 0;
      const chapter = Math.floor(shown);
      const transition = ease(.49, .98, shown - chapter);
      const index = Math.min(scenes.length, reducedMotion.matches ? Math.round(chapter + transition) : chapter + transition);
      setScenePosition(index);

      if (units >= end && shown >= scenes.length) {
        finish(intro.contains(document.activeElement));
        return;
      }
      if ((typingAt !== undefined && typedRatio < 1) || catchingUp) queue();
    }

    function queue() {
      if (frame === undefined) frame = requestAnimationFrame(render);
    }

    function scrollToUnits(point) {
      window.scrollTo({ top: point * stage.clientHeight, behavior: reducedMotion.matches ? "instant" : "smooth" });
    }

    next.addEventListener("click", () => scrollToUnits((units < .43 ? .31 : .80) * openingLength), { signal });
    chapterButton.addEventListener("click", () => {
      if (activeScene === scenes.length) finish(true);
      else scrollToUnits(sceneStart + (activeScene + 1) * sceneLength + .02);
    }, { signal });
    window.addEventListener("scroll", queue, { passive: true, signal });
    window.addEventListener("resize", queue, { signal });
    document.addEventListener("portfolio:language", () => {
      text = complete.textContent;
      queue();
    }, { signal });
    reducedMotion.addEventListener("change", () => {
      lastOpening = undefined;
      queue();
    }, { signal });
    render(performance.now());
  }

  return { prepare, play };
})();
