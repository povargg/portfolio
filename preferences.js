const portfolioPreferences = (() => {
  const key = "portfolio-preferences";
  const palettes = [
    "gruvbox", "tokyo-night", "everforest", "nord", "catppuccin",
    "dracula", "one-dark", "solarized", "rose-pine",
  ];
  const languages = ["de", "en", "ru"];
  const browserLanguage = navigator.languages
    .map((locale) => locale.split("-")[0].toLowerCase())
    .find((language) => languages.includes(language)) ?? "de";
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;

  function percent(value, maximum) {
    return Number.isFinite(value) ? Math.round(Math.min(maximum, Math.max(0, value))) : 100;
  }

  function normalize(values) {
    return {
      palette: palettes.includes(values?.palette) ? values.palette : "gruvbox",
      mode: ["system", "light", "dark"].includes(values?.mode) ? values.mode : "light",
      language: languages.includes(values?.language) ? values.language : browserLanguage,
      glass: values?.glass !== false,
      transparency: percent(values?.transparency, 100),
      refraction: percent(values?.refraction, 200),
      distortion: percent(values?.distortion, 200),
    };
  }

  function restore() {
    try {
      return normalize(JSON.parse(window.localStorage.getItem(key)));
    } catch {
      return normalize(null);
    }
  }

  let values = restore();

  function apply() {
    const systemMode = systemDark.matches ? "dark" : "light";
    root.dataset.theme = values.glass ? "liquid-glass" : values.palette;
    root.dataset.mode = values.mode === "system" ? systemMode : values.mode;
    root.dataset.glass = values.glass ? "on" : "off";
    root.style.setProperty("--glass-opacity", `${100 - values.transparency}%`);
  }

  function notify() {
    apply();
    document.dispatchEvent(new Event("portfolio:preferences"));
  }

  apply();
  systemDark.addEventListener("change", () => {
    if (values.mode === "system") notify();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      values = restore();
      notify();
    }
  });

  return {
    read() {
      return { ...values };
    },
    update(changes) {
      values = normalize({ ...values, ...changes });
      try {
        window.localStorage.setItem(key, JSON.stringify(values));
      } catch {
        // The current tab can still use the selection when storage is blocked.
      }
      notify();
    },
  };
})();
