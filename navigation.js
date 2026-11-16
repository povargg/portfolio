function createPortfolioNavigation(navigation, header, { closeMenu, mobileNavigation, reducedMotion }) {
  const links = [...navigation.querySelectorAll("a")];
  const sections = new Map(links.map((link) => [document.getElementById(link.hash.slice(1)), link]));
  const root = document.documentElement;
  const background = document.querySelector(".background-grid");
  let current;
  let preferred;
  let frame;

  function containingSection(anchor) {
    return [...sections.keys()].find((section) => section.contains(anchor));
  }

  function preferHash() {
    const anchor = document.getElementById(location.hash.slice(1));
    preferred = containingSection(anchor);
    queue();
  }

  function setActive(section) {
    if (section === current) return;
    sections.get(current)?.removeAttribute("aria-current");
    sections.get(section)?.setAttribute("aria-current", "location");
    current = section;
    document.dispatchEvent(new Event("portfolio:section"));
  }

  function navigate(hash, focus = false) {
    const target = document.getElementById(hash.slice(1));
    if (!target) return false;

    portfolioMotion.exit();
    preferred = containingSection(target);
    // The mobile menu can still be collapsing when the destination is calculated.
    const collapse = mobileNavigation.matches ? navigation.getBoundingClientRect().height : 0;
    const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - collapse - padding);
    closeMenu();
    if (location.hash !== hash) history.pushState(history.state, "", hash);
    if (focus) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    window.scrollTo({ top, behavior: reducedMotion.matches ? "instant" : "smooth" });
    queue();
    return true;
  }

  function update() {
    frame = undefined;
    if (root.classList.contains("intro-active") || root.dataset.sectionIndicator !== "on") {
      setActive(undefined);
      return;
    }
    const height = window.innerHeight;
    const top = root.dataset.stickyNavigation === "on" ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const line = top + Math.min(190, (height - top) * .29);
    const locations = [...sections.keys()].map((section) => ({ section, rect: section.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > top && rect.top < height);
    if (!locations.length) return;

    const pastLine = locations.filter(({ rect }) => rect.top <= line);
    const atEnd = window.scrollY > 0 && root.scrollHeight - (window.scrollY + height) < 4;
    const closestToAnchor = atEnd && locations.find(({ section, rect }) =>
      section === preferred && Math.min(height, rect.bottom) - Math.max(top, rect.top) >= 72);
    if (closestToAnchor) {
      setActive(closestToAnchor.section);
      return;
    }
    const targetTop = atEnd || pastLine.length
      ? Math.max(...(atEnd ? locations : pastLine).map(({ rect }) => rect.top))
      : Math.min(...locations.map(({ rect }) => rect.top));
    // The last two panels can share the same vertical position on wide screens.
    const sharedRow = locations.filter(({ rect }) => Math.abs(rect.top - targetTop) < 2);
    const active = sharedRow.find(({ section }) => section === preferred)?.section ?? sharedRow[0].section;
    setActive(active);
  }

  function queue() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (navigate(link.hash, event.detail === 0)) event.preventDefault();
  });
  function preferPanel(event) {
    preferred = event.target.closest(".background-panel");
    queue();
  }
  background.addEventListener("focusin", preferPanel);
  background.addEventListener("pointerdown", preferPanel, { passive: true });
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  window.addEventListener("hashchange", preferHash);
  document.addEventListener("portfolio:intro", preferHash);
  document.addEventListener("portfolio:preferences", queue);
  if ("ResizeObserver" in window) {
    const resize = new ResizeObserver(queue);
    resize.observe(header);
    for (const section of sections.keys()) resize.observe(section);
  }
  preferHash();
  return navigate;
}
