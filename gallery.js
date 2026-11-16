const portfolioGallery = {
  mount(scope) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const galleries = [...scope.querySelectorAll(".effect-gallery")].map((gallery) => {
      const preview = gallery.querySelector(".image-preview");
      let image = preview.querySelector('img:not([aria-hidden="true"])');
      const slider = gallery.querySelector("input");
      const rail = slider.closest(".effect-range");
      const options = [...gallery.querySelectorAll("[data-effect]")];
      const caption = gallery.querySelector(".effect-caption");
      const captionLabel = gallery.querySelector("[data-i18n=desktopPreview]");
      const asset = (option) => "assets/desktop-" + option.dataset.effect + ".webp";
      let displayed = Math.max(0, options.findIndex((option) => asset(option) === image.getAttribute("src")));
      let requested = displayed;
      let request = 0;

      function updateText() {
        const effect = options[displayed].textContent.trim();
        caption.textContent = effect;
        image.alt = captionLabel.textContent.trim() + " · " + effect;
        slider.setAttribute("aria-valuetext", options[requested].textContent.trim());
      }

      function updateControls(index) {
        requested = index;
        slider.value = index;
        rail.style.setProperty("--effect-position", (index * 100 / (options.length - 1)) + "%");
        options.forEach((option, position) => option.setAttribute("aria-pressed", String(position === index)));
        updateText();
      }

      function show(next, index) {
        const previous = [...preview.querySelectorAll("img")];
        for (const old of previous) old.setAttribute("aria-hidden", "true");
        next.width = next.naturalWidth;
        next.height = next.naturalHeight;
        image = next;
        const direction = index > displayed ? 1 : -1;
        displayed = index;
        preview.append(next);
        updateText();

        const removePrevious = () => previous.forEach((old) => old.remove());
        if (reduced.matches || !next.animate) {
          removePrevious();
          return;
        }
        const fade = next.animate([
          { opacity: 0, transform: "translateX(" + direction * 1.25 + "%) scale(1.03)" },
          { opacity: 1, transform: "translateX(0) scale(1)" },
        ], { duration: 370, easing: "cubic-bezier(.22, .69, .25, 1)" });
        fade.finished.then(removePrevious, removePrevious);
      }

      async function select(index) {
        const version = ++request;
        updateControls(index);
        if (index === displayed) {
          preview.disabled = false;
          preview.removeAttribute("aria-busy");
          return;
        }
        preview.disabled = true;
        preview.setAttribute("aria-busy", "true");
        const next = new Image();
        next.src = asset(options[index]);
        try {
          await next.decode();
          if (version === request) show(next, index);
        } catch {
          if (version === request) updateControls(displayed);
        } finally {
          if (version === request) {
            preview.disabled = false;
            preview.removeAttribute("aria-busy");
          }
        }
      }

      slider.addEventListener("input", () => select(slider.valueAsNumber));
      slider.addEventListener("pointerdown", () => rail.classList.add("is-scrubbing"));
      for (const event of ["change", "pointerup", "pointercancel", "blur"]) {
        slider.addEventListener(event, () => rail.classList.remove("is-scrubbing"));
      }
      options.forEach((option, index) => option.addEventListener("click", () => select(index)));
      preview.disabled = false;
      preview.removeAttribute("aria-busy");
      updateControls(displayed);
      return updateText;
    });
    return () => galleries.forEach((updateText) => updateText());
  },

  mountImageViewer(reducedMotion) {
    const dialog = document.querySelector(".image-dialog");
    if (!dialog.showModal) return;
    const view = dialog.querySelector(".image-view");
    const caption = dialog.querySelector("figcaption");
    const image = new Image();
    image.decoding = "async";
    view.prepend(image);
    let source;
    let animation;
    let closing = false;

    function thumbnail() {
      return source?.querySelector('img:not([aria-hidden="true"])');
    }

    function updateCaption() {
      if (!source) return;
      caption.textContent = image.alt = thumbnail().alt;
    }

    function zoom() {
      const from = thumbnail().getBoundingClientRect();
      const to = image.getBoundingClientRect();
      const scale = Math.min(from.width / to.width, from.height / to.height);
      if (reducedMotion.matches || !view.animate || !Number.isFinite(scale) || scale <= 0) {
        if (closing) dialog.close();
        return;
      }
      const dx = from.left + from.width / 2 - to.left - to.width / 2;
      const dy = from.top + from.height / 2 - to.top - to.height / 2;
      animation = view.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .8 },
        { transform: "none", opacity: 1 },
      ], {
        duration: 400, direction: closing ? "reverse" : "normal",
        easing: "cubic-bezier(.25, .72, .25, 1)", fill: "both",
      });
      animation.onfinish = () => {
        animation.cancel();
        animation = undefined;
        if (closing) dialog.close();
      };
    }

    async function open(preview) {
      if (source) return;
      source = preview;
      const shot = thumbnail();
      image.width = shot.naturalWidth || shot.width;
      image.height = shot.naturalHeight || shot.height;
      image.src = shot.currentSrc || shot.src;
      updateCaption();
      try {
        await image.decode();
      } catch {
        source = undefined;
        return;
      }
      closing = false;
      document.documentElement.classList.add("image-view-open");
      dialog.showModal();
      zoom();
      requestAnimationFrame(() => {
        if (dialog.open && !closing) dialog.classList.add("is-shaded");
      });
    }

    function close() {
      if (!dialog.open || closing) return;
      closing = true;
      dialog.classList.remove("is-shaded");
      if (animation && !reducedMotion.matches) animation.reverse();
      else zoom();
    }

    document.addEventListener("click", (event) => {
      const preview = event.target.closest(".image-preview");
      if (preview && !preview.disabled) open(preview);
    });
    document.addEventListener("portfolio:language", updateCaption);
    dialog.querySelector(".image-close").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("close", () => {
      animation?.cancel();
      animation = undefined;
      dialog.classList.remove("is-shaded");
      document.documentElement.classList.remove("image-view-open");
      source?.focus({ preventScroll: true });
      source = undefined;
    });
  },
};
