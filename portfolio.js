(() => {
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-navigation");
  const menuIcon = menuToggle.querySelector(".material-symbol");
  const mobileNavigation = window.matchMedia("(max-width: 58rem)");
  const appearance = document.querySelector(".appearance");
  const appearanceToggle = appearance.querySelector(".appearance-toggle");
  const appearancePanel = appearance.querySelector(".preferences-panel");
  const paletteSelect = document.querySelector("#palette-select");
  const languageSelects = document.querySelectorAll('select[name="language"]');
  const modeOptions = [...document.querySelectorAll('[name="color-mode"]')];
  const switches = document.querySelectorAll('input[role="switch"]');
  const stickyNavControl = document.querySelector(".sticky-nav-control");
  const replayIntro = document.querySelector(".replay-intro");
  const glassControls = document.querySelector(".glass-controls");
  const glassRanges = [...glassControls.querySelectorAll('input[type="range"]')].map((input) => ({
    input,
    output: input.parentElement.querySelector("output"),
  }));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const skillDialog = document.querySelector(".skill-dialog");
  const skillDialogTitle = skillDialog.querySelector("h2");
  let currentSkill;
  let liquidGlass;
  let liquidGlassModule;
  let portraitModule;
  const translateGalleries = [portfolioGallery.mount(document)];

  function loadPortrait() {
    if (portraitModule || location.protocol === "file:"
        || root.classList.contains("intro-active") && document.querySelector(".welcome-intro.is-compact")) return;
    portraitModule = import("./portrait-roll.js").then(({ mountPortraitRolls }) => mountPortraitRolls()).catch(() => {});
  }
  document.addEventListener("portfolio:intro", loadPortrait);

  function updateGlass() {
    const preferences = portfolioPreferences.read();
    liquidGlass?.update(preferences, root.dataset.mode);
    if (!preferences.glass || liquidGlassModule || location.protocol === "file:") return;

    liquidGlassModule = import("./liquid-glass.js")
      .then(({ createLiquidGlass }) => {
        liquidGlass = createLiquidGlass();
        updateGlass();
      })
      .catch(() => {
        // The static wallpaper and CSS backdrop stay active if the module cannot load.
      });
  }

  const translationAttributes = {
    "data-i18n": null,
    "data-i18n-label": "aria-label",
    "data-i18n-title": "title",
    "data-i18n-alt": "alt",
    "data-i18n-content": "content",
  };
  const originalTranslations = new Map();
  const bindings = [];
  let displayedLanguage = "de";

  function bindTranslations(scope) {
    const added = [];
    for (const [dataAttribute, attribute] of Object.entries(translationAttributes)) {
      for (const element of scope.querySelectorAll(`[${dataAttribute}]`)) {
        const key = element.getAttribute(dataAttribute);
        const originalKey = dataAttribute + ":" + key;
        if (!originalTranslations.has(originalKey)) {
          originalTranslations.set(originalKey, attribute ? element.getAttribute(attribute) : element.textContent);
        }
        added.push({ element, attribute, key, original: originalTranslations.get(originalKey) });
      }
    }
    bindings.push(...added);
    return added;
  }

  function applyLanguage(language, elements) {
    const translation = portfolioTranslations[language];
    for (const { element, attribute, key, original } of elements) {
      const value = translation?.[key] ?? original;
      if (attribute) element.setAttribute(attribute, value);
      else element.textContent = value;
    }
  }
  bindTranslations(document);

  function renderPreferences() {
    const preferences = portfolioPreferences.read();
    const { palette, mode, language, glass } = preferences;
    paletteSelect.value = palette;
    paletteSelect.disabled = glass;
    for (const select of languageSelects) select.value = language;
    for (const input of switches) input.checked = preferences[input.name];
    stickyNavControl.hidden = !glass;
    glassControls.hidden = !glass;
    const formatPercent = new Intl.NumberFormat(language, { style: "percent" });
    for (const { input, output } of glassRanges) {
      const value = preferences[input.name];
      input.value = value;
      output.value = formatPercent.format(value / 100);
      input.setAttribute("aria-valuetext", output.value);
    }
    for (const option of modeOptions) option.checked = option.value === mode;
    themeColor.content = getComputedStyle(root).getPropertyValue("--surface").trim();
    updateGlass();

    if (language === displayedLanguage) return;
    applyLanguage(language, bindings);
    displayedLanguage = language;
    root.lang = language;
    for (const translate of translateGalleries) translate();
    document.dispatchEvent(new Event("portfolio:language"));
    if (currentSkill) skillDialogTitle.textContent = currentSkill.querySelector("h3").textContent;
  }

  function setMenu(open) {
    navigation.classList.toggle("is-open", open);
    navigation.inert = mobileNavigation.matches && !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuIcon.textContent = open ? "close" : "menu";
  }

  function setAppearance(open) {
    appearance.classList.toggle("is-open", open);
    appearancePanel.inert = !open;
    appearanceToggle.setAttribute("aria-expanded", String(open));
  }

  replayIntro.addEventListener("click", () => {
    setAppearance(false);
    setMenu(false);
    portfolioMotion.start(true);
  });
  menuToggle.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") === "true";
    setAppearance(false);
    setMenu(!open);
  });
  mobileNavigation.addEventListener("change", () => setMenu(false));
  appearanceToggle.addEventListener("click", () => {
    const open = appearanceToggle.getAttribute("aria-expanded") === "true";
    if (!open) setMenu(false);
    setAppearance(!open);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!appearance.contains(event.target)) setAppearance(false);
    if (!header.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (appearance.classList.contains("is-open")) {
      setAppearance(false);
      appearanceToggle.focus();
    } else if (navigation.classList.contains("is-open")) {
      setMenu(false);
      menuToggle.focus();
    }
  });

  paletteSelect.addEventListener("change", () => {
    portfolioPreferences.update({ palette: paletteSelect.value });
  });
  for (const select of languageSelects) {
    select.addEventListener("change", () => portfolioPreferences.update({ language: select.value }));
  }
  for (const input of switches) {
    input.addEventListener("change", () => portfolioPreferences.update({ [input.name]: input.checked }));
  }
  for (const { input } of glassRanges) {
    input.addEventListener("input", () => {
      portfolioPreferences.update({ [input.name]: input.valueAsNumber });
    });
  }
  for (const option of modeOptions) {
    option.addEventListener("change", () => {
      if (option.checked) portfolioPreferences.update({ mode: option.value });
    });
  }
  document.addEventListener("portfolio:preferences", renderPreferences);
  setMenu(false);
  root.classList.add("js");
  renderPreferences();

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const navigate = createPortfolioNavigation(navigation, header, { closeMenu: () => setMenu(false), mobileNavigation, reducedMotion });
  portfolioGallery.mountImageViewer(reducedMotion);
  const tiltProperties = ["--tilt-x", "--tilt-y", "--light-x", "--light-y", "--light-angle"];
  let pointer;
  let frame;
  let reflection;
  let reflectionModule;
  const skillDetailsKey = "portfolio-skill-details-seen";
  let detailsLearned = portfolioMotion.readFlag(skillDetailsKey);
  function markSkillDetailsLearned(scope = document) {
    for (const section of scope.querySelectorAll(".skills-panel")) section.classList.add("details-learned");
  }
  window.addEventListener("storage", (event) => {
    if (event.key === skillDetailsKey && event.newValue === "1") {
      detailsLearned = true;
      markSkillDetailsLearned();
    }
  });

  function untrackPointer() {
    if (!pointer) return;
    const { target } = pointer;
    target.classList.remove("is-tilting");
    for (const property of tiltProperties) target.style.removeProperty(property);
    cancelAnimationFrame(frame);
    frame = undefined;
    pointer = undefined;
    reflection?.hide();
  }

  function drawTilt() {
    frame = undefined;
    if (!pointer) return;
    const { target, clientX, clientY } = pointer;
    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const x = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height));

    target.classList.add("is-tilting");
    target.style.setProperty("--tilt-x", `${(y - .5) * 20}deg`);
    target.style.setProperty("--tilt-y", `${(.5 - x) * 22}deg`);
    target.style.setProperty("--light-x", `${x * 100}%`);
    target.style.setProperty("--light-y", `${y * 100}%`);
    target.style.setProperty("--light-angle", `${x * 160 + y * 60}deg`);

    const flipped = target.classList.contains("is-flipped");
    reflection?.paint(flipped ? pointer.back : pointer.front, x, y, bounds.width, bounds.height, flipped);
  }

  function queueTilt() {
    if (frame === undefined) frame = requestAnimationFrame(drawTilt);
  }

  function loadReflection() {
    if (reflectionModule || location.protocol === "file:") return;
    reflectionModule = import("./skill-reflection.js")
      .then(({ createSkillReflection }) => {
        reflection = createSkillReflection();
        if (pointer) queueTilt();
      })
      .catch(() => {
        // The card already has a CSS reflection on browsers without WebGL.
      });
  }

  finePointer.addEventListener("change", untrackPointer);
  reducedMotion.addEventListener("change", untrackPointer);
  document.addEventListener("portfolio:preferences", () => {
    if (root.dataset.glass === "off" && pointer?.target.matches(".social-item")) untrackPointer();
  });

  function watchTilt(target, glassOnly = false) {
    const front = target.querySelector(".skill-reflection");
    const back = target.querySelector(".skill-back .skill-reflection");
    target.addEventListener("pointermove", (event) => {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType === "touch") return;
      if (glassOnly && root.dataset.glass !== "on") return;
      if (target === expandedSkill && skillDialog.classList.contains("is-flying")) return;
      if (pointer?.target !== target) untrackPointer();
      pointer = { target, front, back, clientX: event.clientX, clientY: event.clientY };
      queueTilt();
      loadReflection();
    });
    target.addEventListener("pointerleave", () => {
      if (pointer?.target === target) untrackPointer();
    });
  }

  const expandedSkill = skillDialog.querySelector(".skill-expanded");
  const skillFlight = skillDialog.querySelector(".skill-flight");
  const flightSource = skillFlight.querySelector(".skill-flight-source");
  const skillEmblem = expandedSkill.querySelector(".skill-emblem");
  const skillNotes = skillDialog.querySelectorAll("[data-skill-details]");
  let returnFocus;
  let flight;
  let leavingSkill = false;
  let pendingSkillLink;

  function clearFlight() {
    for (const animation of flight ?? []) animation.cancel();
    flight = undefined;
    flightSource.replaceChildren();
    skillDialog.classList.remove("is-flying");
  }

  function flySkill(from, reverse = false) {
    if (reducedMotion.matches || !skillFlight.animate || !from.width || !from.height) {
      if (reverse) skillDialog.close();
      return;
    }
    const to = skillFlight.getBoundingClientRect();
    const dx = from.left + from.width / 2 - to.left - to.width / 2;
    const dy = from.top + from.height / 2 - to.top - to.height / 2;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const face = currentSkill.querySelector(currentSkill.classList.contains("is-flipped") ? ".skill-back" : ".skill-front");
    const preview = face.cloneNode(true);
    preview.removeAttribute("inert");
    for (const element of preview.querySelectorAll("[id]")) element.removeAttribute("id");
    preview.style.width = face.offsetWidth + "px";
    preview.style.height = face.offsetHeight + "px";
    preview.style.transform = `scale(${to.width / face.offsetWidth}, ${to.height / face.offsetHeight})`;
    flightSource.replaceChildren(preview);

    const lift = Math.min(68, window.innerHeight * .075, 24 + Math.hypot(dx, dy) * .15);
    const path = Array.from({ length: 25 }, (_, index) => {
      const travel = index / 24;
      const rest = 1 - travel;
      const rise = lift * Math.sin(Math.PI * travel) ** 2;
      return {
        transform: `translate3d(${dx * rest}px, ${dy * rest - rise}px, 0) scale(${sx * rest + travel}, ${sy * rest + travel})`,
      };
    });
    skillDialog.classList.add("is-flying");
    const timing = {
      duration: 1040,
      direction: reverse ? "reverse" : "normal",
      easing: "cubic-bezier(.38, 0, .24, 1)",
      fill: "both",
    };
    const travel = skillFlight.animate(path, timing);
    function turnFace(element, startAngle, endAngle, startOpacity) {
      const middle = (startAngle + endAngle) / 2;
      const pose = (angle, opacity, offset) => ({ transform: `rotate3d(.24, 1, 0, ${angle}deg)`, opacity, offset });
      return element.animate([
        pose(startAngle, startOpacity, 0),
        pose(middle, startOpacity, .5),
        pose(middle, 1 - startOpacity, .5),
        pose(endAngle, 1 - startOpacity, 1),
      ], timing);
    }
    // Switch faces edge-on so only one plane is painted, including in Firefox.
    flight = [travel, turnFace(flightSource, 0, 180, 1), turnFace(expandedSkill, -180, 0, 0)];
    const start = document.timeline.currentTime;
    if (start !== null) {
      for (const animation of flight) animation.startTime = start;
    }
    travel.onfinish = () => {
      if (leavingSkill) skillDialog.close();
      clearFlight();
    };
  }

  function openSkill(card) {
    if (currentSkill || skillDialog.open) return;
    const from = card.querySelector(".skill-shell").getBoundingClientRect();
    untrackPointer();
    if (!detailsLearned) {
      detailsLearned = true;
      markSkillDetailsLearned();
      portfolioMotion.writeFlag(skillDetailsKey);
    }
    currentSkill = card;
    leavingSkill = false;
    pendingSkillLink = undefined;
    returnFocus = card.contains(document.activeElement) ? document.activeElement : card.querySelector(".skill-enlarge");
    skillDialogTitle.textContent = card.querySelector("h3").textContent;
    skillFlight.style.setProperty("--card-accent", getComputedStyle(card).getPropertyValue("--card-accent"));
    for (const note of skillNotes) {
      note.hidden = note.dataset.skillDetails !== card.dataset.skill;
      if (!note.hidden) skillEmblem.textContent = note.dataset.emblem;
    }
    root.classList.add("skill-open");
    card.classList.add("is-zoom-source");
    skillDialog.showModal();
    requestAnimationFrame(() => {
      if (skillDialog.open && !leavingSkill) skillDialog.classList.add("is-shaded");
    });
    flySkill(from);
  }

  function closeSkill() {
    if (!skillDialog.open || leavingSkill) return;
    leavingSkill = true;
    untrackPointer();
    skillDialog.classList.remove("is-shaded");
    if (flight && !reducedMotion.matches) {
      for (const animation of flight) animation.reverse();
    } else flySkill(currentSkill.getBoundingClientRect(), true);
  }

  skillDialog.querySelector(".skill-close").addEventListener("click", closeSkill);
  skillDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSkill();
  });
  skillDialog.addEventListener("click", (event) => {
    if (event.target === skillDialog) closeSkill();
    const link = event.target.closest('a[href^="#"]');
    if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      returnFocus = null;
      pendingSkillLink = link.hash;
      closeSkill();
    }
  });
  skillDialog.addEventListener("close", () => {
    if (pointer?.target === expandedSkill) untrackPointer();
    clearFlight();
    skillDialog.classList.remove("is-shaded");
    currentSkill?.classList.remove("is-zoom-source");
    root.classList.remove("skill-open");
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
    currentSkill = undefined;
    if (pendingSkillLink) {
      navigate(pendingSkillLink, true);
      pendingSkillLink = undefined;
    }
  });
  watchTilt(expandedSkill);

  function bindCards(scope) {
    if (detailsLearned) markSkillDetailsLearned(scope);
    for (const card of scope.querySelectorAll(".skill-card")) {
      const front = card.querySelector(".skill-front");
      const button = card.querySelector(".skill-enlarge");
      card.addEventListener("click", (event) => {
        if (event.button === 0 && !event.target.closest("a")) openSkill(card);
      });
      card.addEventListener("contextmenu", (event) => {
        if (!finePointer.matches || event.button !== 2 || event.pointerType === "touch" || event.target.closest("a")) return;
        event.preventDefault();
        const flipped = card.classList.toggle("is-flipped");
        if (flipped && front.contains(document.activeElement)) button.focus({ preventScroll: true });
        front.inert = flipped;
        front.setAttribute("aria-hidden", String(flipped));
        if (pointer?.target === card) queueTilt();
      });
      watchTilt(card);
    }
    for (const item of scope.querySelectorAll(".social-item")) watchTilt(item, true);
  }
  bindCards(document);
  document.addEventListener("portfolio:intro-content", ({ detail: intro }) => {
    const scenes = intro.querySelector(".intro-scenes");
    applyLanguage(displayedLanguage, bindTranslations(intro.querySelector(".intro-about")));
    applyLanguage(displayedLanguage, bindTranslations(scenes));
    translateGalleries.push(portfolioGallery.mount(scenes));
    bindCards(scenes);
  });
  portfolioMotion.start();
  loadPortrait();
})();
