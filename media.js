const portfolioMedia = (() => {
  const root = document.documentElement;
  const wallpaper = document.querySelector(".glass-wallpaper");
  const wallpapers = { light: "glass-meadow.jpg", dark: "glass-sky.jpg" };
  // Bump this name when replacing an original or its compact image.
  const cacheName = "portfolio-media-v1";
  const assetRequests = new Map();
  const documentRequests = new Map();
  const pendingPreviews = new Set();
  const hoverPortrait = matchMedia("(hover: hover) and (pointer: fine) and (width > 40rem)");
  let cachePromise;
  let wallpaperMode;
  let wallpaperImage;
  let portraitImage;
  let portraitRequest;
  let wallpaperRequest = 0;

  function loadResource(path, tag) {
    if (documentRequests.has(path)) return documentRequests.get(path);
    const element = document.createElement(tag);
    if (tag === "link") {
      element.rel = "stylesheet";
      element.href = path;
    } else element.src = path;
    const request = new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => {
        element.remove();
        documentRequests.delete(path);
        reject(new Error("Could not load " + path));
      };
      document.head.append(element);
    });
    documentRequests.set(path, request);
    return request;
  }

  async function openCache() {
    try {
      if (!window.caches) return undefined;
      const cache = await caches.open(cacheName);
      for (const name of await caches.keys()) {
        if (name.startsWith("portfolio-media-") && name !== cacheName) await caches.delete(name);
      }
      return cache;
    } catch {
      return undefined;
    }
  }

  async function findCached(cache, key) {
    try {
      return await cache?.match(key);
    } catch {
      return undefined;
    }
  }

  async function storeAsset(cache, key, response) {
    const put = async () => {
      // A late thumbnail must never replace an original, even in another tab.
      if (response.url !== key && (await findCached(cache, key))?.url === key) return;
      await cache.put(key, response);
    };
    try {
      if (navigator.locks) await navigator.locks.request(cacheName + ":" + key, put);
      else await put();
    } catch {
      // Cache storage can be blocked or evicted independently of image loading.
    }
  }

  async function fetchAsset(file, quality) {
    const full = quality === "full";
    const original = new URL("assets/" + file, document.baseURI).href;
    const compact = new URL("assets/compact/" + file.replace(/\.[^.]+$/, ".webp"), document.baseURI).href;
    const requested = full ? original : compact;
    if (location.protocol === "file:") return { url: requested, full };

    cachePromise ??= openCache();
    const cache = await cachePromise;
    const cached = await findCached(cache, original);
    if (cached && (cached.url === requested || quality === "progressive" && cached.url === original)) {
      return { url: URL.createObjectURL(await cached.blob()), full: cached.url === original };
    }

    const response = await fetch(requested, { cache: cache ? "no-store" : "default" });
    if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) {
      throw new Error("Could not load " + requested);
    }
    const copy = cache ? response.clone() : null;
    const blob = await response.blob();
    if (copy) void storeAsset(cache, original, copy);
    return { url: URL.createObjectURL(blob), full };
  }

  async function image(file, quality = "preview") {
    const key = file + ":" + quality;
    if (!assetRequests.has(key)) {
      assetRequests.set(key, fetchAsset(file, quality).catch((error) => {
        assetRequests.delete(key);
        throw error;
      }));
    }
    const { url, full } = await assetRequests.get(key);
    const element = new Image();
    element.decoding = "async";
    element.src = url;
    await element.decode();
    return { element, full };
  }

  function preview(file) {
    const request = image(file).then(({ element }) => element);
    pendingPreviews.add(request);
    const done = () => pendingPreviews.delete(request);
    request.then(done, done);
    return request;
  }

  function prefersCompact() {
    const connection = navigator.connection;
    const downlink = connection?.downlink;
    if (connection?.saveData || /2g|3g/.test(connection?.effectiveType || "")) return true;
    if (downlink >= 40) return false; // The Network Information API reports megabits per second.
    // Browsers without a useful estimate can reuse a recent same-origin transfer.
    const sample = performance.getEntriesByType("resource").findLast((entry) =>
      entry.name.startsWith(location.origin + "/") && entry.transferSize >= 64000
      && entry.responseEnd - entry.responseStart >= 3 && performance.now() - entry.responseEnd < 30000);
    if (downlink > 0 && downlink !== 10) return true;
    return !sample || sample.transferSize / (sample.responseEnd - sample.responseStart) < 5000;
  }

  async function afterPreviews() {
    if (document.readyState !== "complete") {
      await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
    }
    // Allow the current viewport's intersection callbacks to enqueue its thumbnails.
    if (!document.hidden) await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    while (pendingPreviews.size) await Promise.allSettled([...pendingPreviews]);
  }

  async function progressive(file, show, relevant = () => true) {
    if (!prefersCompact()) {
      try {
        const { element } = await image(file, "full");
        if (relevant()) show(element);
        return;
      } catch {
        const { element } = await image(file, "progressive");
        if (relevant()) show(element);
        return;
      }
    }
    const first = await image(file, "progressive");
    if (!relevant()) return;
    show(first.element);
    if (first.full) return;
    await afterPreviews();
    if (!relevant()) return;
    const { element } = await image(file, "full");
    if (relevant()) show(element);
  }

  function setWallpaper(mode) {
    if (mode === wallpaperMode) return;
    wallpaperMode = mode;
    wallpaperImage = undefined;
    wallpaper.style.removeProperty("--glass-wallpaper");
    const version = ++wallpaperRequest;
    if (!mode) return;
    const current = () => version === wallpaperRequest;
    progressive(wallpapers[mode], (element) => {
      wallpaperImage = element;
      wallpaper.style.setProperty("--glass-wallpaper", `url("${element.src}")`);
      document.dispatchEvent(new Event("portfolio:wallpaper"));
    }, current).catch(() => {});
  }

  function revealPortrait() {
    if (portraitRequest) return;
    portraitRequest = progressive("taras-portrait.jpg", (element) => {
      portraitImage = element;
      for (const photo of document.querySelectorAll(".portrait-reveal img")) photo.src = element.src;
      document.dispatchEvent(new Event("portfolio:portrait"));
    }).catch(() => {
      if (!portraitImage) portraitRequest = undefined;
    });
  }

  function watchPortrait(scope) {
    for (const detail of scope.querySelectorAll(".portrait-reveal")) {
      const summary = detail.querySelector("summary");
      if (portraitImage) detail.querySelector("img").src = portraitImage.src;
      summary.addEventListener("pointerenter", (event) => {
        if (hoverPortrait.matches && event.pointerType !== "touch") revealPortrait();
      });
      detail.addEventListener("toggle", () => {
        if (detail.open) revealPortrait();
      });
    }
  }

  function showPreview(target) {
    if (target.hasAttribute("src")) return;
    preview(target.dataset.image).then((image) => { target.src = image.src; }).catch(() => {});
  }

  const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting || root.classList.contains("intro-active") && target.closest(".portfolio-content")) continue;
      observer.unobserve(target);
      showPreview(target);
    }
  }, { rootMargin: "230px 0px" }) : null;

  function watchPreviews(scope = document) {
    for (const target of scope.querySelectorAll(".image-preview img[data-image]:not([src])")) {
      if (observer) {
        observer.unobserve(target);
        observer.observe(target);
      } else if (!target.closest("[hidden]")) showPreview(target);
    }
  }

  return {
    preview, image, afterPreviews, setWallpaper, watchPortrait, watchPreviews,
    loadScript: (path) => loadResource(path, "script"),
    loadStylesheet: (path) => loadResource(path, "link"),
    wallpaperImage: () => wallpaperImage, portraitImage: () => portraitImage,
  };
})();
