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
  const languageSelect = document.querySelector("#language-select");
  const modeOptions = [...document.querySelectorAll('[name="color-mode"]')];
  const glassToggle = document.querySelector("#glass-toggle");
  const glassControls = document.querySelector(".glass-controls");
  const glassRanges = [...glassControls.querySelectorAll('input[type="range"]')].map((input) => ({
    input,
    output: input.parentElement.querySelector("output"),
  }));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let liquidGlass;
  let liquidGlassModule;
  portfolioMotion.start();

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
    "data-i18n-href": "href",
  };
  const bindings = Object.entries(translationAttributes).flatMap(([dataAttribute, attribute]) =>
    [...document.querySelectorAll(`[${dataAttribute}]`)].map((element) => ({
      element,
      attribute,
      key: element.getAttribute(dataAttribute),
      original: attribute ? element.getAttribute(attribute) : element.textContent,
    }))
  );
  let displayedLanguage = "de";

  function renderPreferences() {
    const preferences = portfolioPreferences.read();
    const { palette, mode, language, glass } = preferences;
    paletteSelect.value = palette;
    paletteSelect.disabled = glass;
    languageSelect.value = language;
    glassToggle.checked = glass;
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
    const translation = portfolioTranslations[language];
    for (const { element, attribute, key, original } of bindings) {
      const value = translation?.[key] ?? original;
      if (attribute) element.setAttribute(attribute, value);
      else element.textContent = value;
    }
    displayedLanguage = language;
    root.lang = language;
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

  menuToggle.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") === "true";
    setAppearance(false);
    setMenu(!open);
  });
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
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
  languageSelect.addEventListener("change", () => {
    portfolioPreferences.update({ language: languageSelect.value });
  });
  glassToggle.addEventListener("change", () => {
    portfolioPreferences.update({ glass: glassToggle.checked });
  });
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
  const tiltProperties = ["--tilt-x", "--tilt-y", "--light-x", "--light-y", "--light-angle"];
  let pointer;
  let frame;
  let reflection;
  let reflectionModule;
  const skills = document.querySelector("#skills");
  const skillFlipKey = "portfolio-skill-flip-seen";
  if (portfolioMotion.readFlag(skillFlipKey)) skills.classList.add("flip-learned");
  window.addEventListener("storage", (event) => {
    if (event.key === skillFlipKey && event.newValue === "1") skills.classList.add("flip-learned");
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

    if (target.classList.contains("is-flipped")) reflection?.hide();
    else reflection?.paint(pointer.surface, x, y, bounds.width, bounds.height);
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
    const surface = target.querySelector(".skill-reflection");
    target.addEventListener("pointermove", (event) => {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType === "touch") return;
      if (glassOnly && root.dataset.glass !== "on") return;
      if (pointer?.target !== target) untrackPointer();
      pointer = { target, surface, clientX: event.clientX, clientY: event.clientY };
      queueTilt();
      loadReflection();
    });
    target.addEventListener("pointerleave", () => {
      if (pointer?.target === target) untrackPointer();
    });
  }

  for (const card of document.querySelectorAll(".skill-card")) {
    const front = card.querySelector(".skill-front");
    const back = card.querySelector(".skill-back");
    const button = card.querySelector(".skill-flip");

    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;

      const flipped = card.classList.toggle("is-flipped");
      if (!skills.classList.contains("flip-learned")) {
        skills.classList.add("flip-learned");
        portfolioMotion.writeFlag(skillFlipKey);
      }
      if (flipped && front.contains(document.activeElement)) button.focus({ preventScroll: true });
      button.setAttribute("aria-pressed", String(flipped));
      front.inert = flipped;
      front.setAttribute("aria-hidden", String(flipped));
      back.inert = !flipped;
      back.setAttribute("aria-hidden", String(!flipped));
      if (pointer?.target === card) queueTilt();
    });
    watchTilt(card);
  }
  for (const item of document.querySelectorAll(".social-item")) watchTilt(item, true);
})();
