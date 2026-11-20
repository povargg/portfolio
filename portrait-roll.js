import {
  Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace,
  Texture, WebGLRenderer,
} from "./vendor/three.module.min.js";

export function mountPortraitRolls() {
  const canvas = document.createElement("canvas");
  const options = { alpha: true, antialias: true, powerPreference: "low-power" };
  const context = canvas.getContext("webgl2", options);
  if (!context) return;

  const renderer = new WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const uniforms = {
    opening: { value: 0 },
    viewAspect: { value: 1 },
    glint: { value: .42 },
    scrollPhase: { value: 0 },
    pigment: { value: new Color() },
    photo: { value: null },
    photoReady: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: `
      uniform float opening;
      uniform float viewAspect;
      varying vec2 sheetUV;
      varying vec3 sheetNormal;

      void main() {
        sheetUV = uv;
        float arc = mix(3.112, .002, opening);
        float angle = (uv.x * 2.0 - 1.0) * arc;
        float radius = .985 / sin(min(arc, 1.570796));
        float y = uv.y * 2.0 - 1.0;
        // Reserve a quarter of the mesh for each hemisphere, even when the
        // closed roll is only a few pixels wide.
        float capLength = min(.19, viewAspect * .985);
        float capAngle = clamp((abs(y) - .5) * 2.0, 0.0, 1.0) * 1.570796;
        float capNormal = sin(capAngle);
        float roundedY = sign(y) * (min(abs(y) * 2.0, 1.0) * (1.0 - capLength) + capNormal * capLength);
        float taper = mix(cos(capAngle), 1.0, opening);
        float x = radius * sin(angle) * taper;
        float depth = radius * (1.0 - cos(angle) * taper) * .37;
        sheetNormal = normalize(vec3(sin(angle) * taper, sign(y) * capNormal * (1.0 - opening), cos(angle) * taper));
        gl_Position = vec4(x, mix(roundedY, y, opening), depth, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opening;
      uniform float viewAspect;
      uniform float glint;
      uniform float scrollPhase;
      uniform vec3 pigment;
      uniform sampler2D photo;
      uniform float photoReady;
      varying vec2 sheetUV;
      varying vec3 sheetNormal;

      void main() {
        vec3 normal = normalize(sheetNormal);
        vec3 lamp = normalize(vec3((glint - .54) * 1.18 - .37 + .19 * sin(scrollPhase), .43, .86));
        vec3 bounce = normalize(vec3(.92, -.32, .35));
        float facing = max(0.0, normal.z);
        float key = max(0.0, dot(normal, lamp));
        float fresnel = pow(1.0 - facing, 1.8);
        float reflectedEdge = pow(max(0.0, dot(normal, bounce)), 3.4);
        float reflection = .23 * pow(key, 8.0) + .34 * pow(key, 31.0);
        float bands = sin(sheetUV.y * 11.0 + normal.x * 2.0 + scrollPhase * .57);
        float phase = normal.x * 4.0 + sheetUV.y * 2.2 + glint * 1.55 + scrollPhase + bands * .36;
        vec3 film = .59 + .41 * cos(phase + vec3(.13, 2.1, 4.22));
        vec3 pearl = pigment * (.20 + key * .57 + facing * .19 + reflectedEdge * .19);
        pearl = mix(pearl, film, .09 + fresnel * .36 + reflectedEdge * .15);
        pearl = mix(pearl, vec3(1.0, .97, .92), reflection);

        vec3 color = pearl;
        if (photoReady > .5 && opening > .12) {
          float portraitAspect = .75;
          vec2 crop = vec2(min(1.0, viewAspect / portraitAspect), min(1.0, portraitAspect / viewAspect));
          vec2 pictureUV = sheetUV * crop + (1.0 - crop) * vec2(.5, .82);
          vec3 picture = texture2D(photo, pictureUV).rgb;
          float uncoiling = smoothstep(.12, .83, opening);
          color = mix(pearl, picture * (1.0 - (1.0 - facing) * (1.0 - opening) * .49), uncoiling);
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  scene.add(new Mesh(new PlaneGeometry(1, 1, 64, 40), material));

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine) and (width > 40rem)");
  const entries = [];
  let frame;
  let lost = false;
  let bufferSize = "";
  let pigmentDirty = true;

  function queue() {
    if (frame === undefined) frame = requestAnimationFrame(draw);
  }

  function draw(now) {
    frame = undefined;
    if (lost) return;
    if (pigmentDirty) {
      uniforms.pigment.value.set(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
      pigmentDirty = false;
    }
    uniforms.scrollPhase.value = reducedMotion.matches ? 0 : window.scrollY * .008;
    let moving = false;

    for (const entry of entries) {
      const { detail, summary, view, pixels } = entry;
      const width = summary.clientWidth;
      const height = summary.clientHeight;
      if (!width || !height) continue;
      const bounds = summary.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) continue;

      const open = Number(detail.open || (finePointer.matches && summary.matches(":hover")));
      if (entry.goal !== open) {
        entry.from = entry.opening;
        entry.goal = open;
        entry.started = now;
      }
      const elapsed = reducedMotion.matches ? 1 : Math.min(1, (now - entry.started) / 385);
      const progress = 1 - Math.pow(1 - elapsed, 3);
      entry.opening = entry.from + (entry.goal - entry.from) * progress;
      detail.classList.toggle("roll-closed", entry.opening < .13);
      moving ||= elapsed < 1;

      const resolution = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(width * resolution));
      const h = Math.max(1, Math.round(height * resolution));
      if (view.width !== w) view.width = w;
      if (view.height !== h) view.height = h;
      const size = w + "x" + h;
      if (size !== bufferSize) {
        renderer.setSize(w, h, false);
        bufferSize = size;
      }
      uniforms.opening.value = entry.opening;
      uniforms.viewAspect.value = width / height;
      uniforms.glint.value = entry.glint;
      renderer.render(scene, camera);
      pixels.clearRect(0, 0, w, h);
      pixels.drawImage(canvas, 0, 0);
      detail.classList.add("has-portrait-roll");
    }
    if (moving) queue();
  }

  const sizeObserver = new ResizeObserver(queue);
  function bindPortraits(scope) {
    for (const detail of scope.querySelectorAll(".portrait-reveal")) {
      const summary = detail.querySelector("summary");
      const view = document.createElement("canvas");
      const pixels = view.getContext("2d");
      if (!pixels) continue;
      view.className = "portrait-model";
      view.setAttribute("aria-hidden", "true");
      const entry = { detail, summary, view, pixels, opening: 0, goal: 0, from: 0, started: -385, glint: .42 };
      entries.push(entry);
      summary.append(view);
      sizeObserver.observe(summary);
      detail.addEventListener("toggle", queue);
      summary.addEventListener("pointerenter", queue);
      summary.addEventListener("pointerleave", () => {
        entry.glint = .42;
        queue();
      });
      summary.addEventListener("pointermove", (event) => {
        if (!finePointer.matches || reducedMotion.matches) return;
        const bounds = summary.getBoundingClientRect();
        entry.glint = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        queue();
      });
    }
    queue();
  }
  bindPortraits(document);
  document.addEventListener("portfolio:intro-content", ({ detail }) => bindPortraits(detail));
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    for (const { detail } of entries) detail.classList.remove("has-portrait-roll");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    queue();
  });
  function setPhoto() {
    const image = portfolioMedia.portraitImage();
    if (!image) return;
    uniforms.photo.value?.dispose();
    const texture = new Texture(image);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    uniforms.photo.value = texture;
    uniforms.photoReady.value = 1;
    queue();
  }
  setPhoto();
  document.addEventListener("portfolio:portrait", setPhoto);

  reducedMotion.addEventListener("change", queue);
  finePointer.addEventListener("change", queue);
  window.addEventListener("scroll", queue, { passive: true });
  document.addEventListener("portfolio:preferences", () => {
    pigmentDirty = true;
    queue();
  });
  document.addEventListener("portfolio:intro", queue);
  queue();
}
