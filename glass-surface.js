import {
  Color, Mesh, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial,
  SRGBColorSpace, Texture, Vector2, Vector3, Vector4, WebGLRenderer,
} from "./vendor/three.module.min.js";
import { glassPaintWindow } from "./glass-motion.js";
import { edgeThickness, prismBands } from "./glass-spectrum.js";

const bandTrace = prismBands.map(([offset, ...weights]) =>
  "backdrop(at + prism * " + offset.toFixed(3) + ", blur) * vec3(" +
  weights.map((weight) => weight.toFixed(3)).join(", ") + ")"
).join(" +\n    ");

const lensFinishes = {
  panel: { boost: 1, highlight: 1, bodyAlpha: 1, rimAlpha: 1 },
  header: { boost: 1.30, highlight: .32, bodyAlpha: .23, rimAlpha: .78 },
  control: { boost: 1.72, highlight: .66, bodyAlpha: .29, rimAlpha: .94 },
  menu: { boost: 1.44, highlight: .68, bodyAlpha: .74, rimAlpha: .96 },
};

export function createWallpaperTexture(image) {
  const texture = new Texture(image);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D wallpaper;
  uniform vec4 surface;
  uniform vec4 visibleArea;
  uniform vec4 lens;
  uniform vec4 tile;
  uniform vec2 pointerPosition;
  uniform vec2 motion;
  uniform vec3 scroll;
  uniform vec3 optics;
  uniform vec3 finish;
  uniform float clarity;
  uniform vec3 tint;
  uniform float lightMode;

  vec3 backdrop(vec2 screenPosition, float blur) {
    vec2 uv = (screenPosition - tile.xy) / tile.z;
    float mipBias = log2(1.0 + blur * tile.w / tile.z);
    return texture2D(wallpaper, vec2(uv.x, 1.0 - uv.y), mipBias).rgb;
  }

  vec3 spread(vec2 at, vec2 tangent, vec2 across, float width) {
    // Light spreads further in the thicker body, and mostly along the bevel near the edge.
    float diffusion = width * 1.12;
    return backdrop(at, diffusion) * 0.32
      + (backdrop(at + tangent * width * 0.53, diffusion)
        + backdrop(at - tangent * width * 0.53, diffusion)) * 0.21
      + (backdrop(at + across * width * 0.47, diffusion)
        + backdrop(at - across * width * 0.47, diffusion)) * 0.13;
  }

  vec3 refractSpectrum(vec2 at, vec2 prism, float blur) {
    return ${bandTrace};
  }

  void main() {
    vec2 screenPosition = visibleArea.xy + vec2(vUv.x, 1.0 - vUv.y) * visibleArea.zw;
    float viewportY = screenPosition.y - scroll.x;
    bool overscan = viewportY < -96.0 || viewportY > scroll.z + 96.0;
    vec2 halfSize = surface.zw * 0.5;
    vec2 p = screenPosition - surface.xy - halfSize;
    vec2 q = abs(p) - halfSize + lens.x;
    vec2 corner = max(q, 0.0);
    float cornerDistance = length(corner);
    float edge = cornerDistance + min(max(q.x, q.y), 0.0) - lens.x;
    if (edge > 1.0) discard;
    // Use the rounded rectangle's analytic normal instead of sampling the distance four more times.
    float horizontal = smoothstep(-.85, .85, q.x - q.y);
    vec2 flatNormal = vec2(horizontal, 1.0 - horizontal);
    vec2 edgeNormal = sign(p) * (cornerDistance > .0001 ? corner / cornerDistance : normalize(flatNormal));
    vec2 normalized = p / halfSize;
    float bevel = lens.y > 0.0 ? 1.0 - smoothstep(0.0, lens.y, -edge) : 0.0;
    float edgeHeight = sqrt(max(0.065, 1.0 - bevel * bevel));
    vec2 flex = vec2(
      sin(viewportY * 0.013 + motion.y) * 0.093,
      cos(screenPosition.x * 0.009 - motion.y * 0.6) * 0.066
    ) * motion.x;
    vec3 normal = normalize(vec3(edgeNormal * bevel * 0.97 + normalized * 0.10 + flex, edgeHeight));
    vec3 view = normalize(vec3(pointerPosition * 0.14, -1.0));
    vec3 ray = refract(view, normal, 1.0 / 1.47);
    float depth = mix(17.0, min(98.0, lens.y * 1.69), bevel);
    vec2 bend = (ray.xy * depth / max(-ray.z, .24) - view.xy * 12.0) * optics.y;
    if (abs(optics.x - optics.y) > .001) {
      vec3 curvature = normalize(vec3(edgeNormal * bevel * .97, edgeHeight));
      vec3 baseRay = refract(view, curvature, 1.0 / 1.47);
      vec2 shapeBend = baseRay.xy * depth / max(-baseRay.z, .24) - view.xy * 12.0;
      bend += shapeBend * (optics.x - optics.y);
    }
    vec2 refracted = screenPosition + bend;

    vec2 axis = mix(vec2(0.8, 0.6), edgeNormal, bevel);
    vec2 tangent = vec2(-axis.y, axis.x);
    float cloud = 0.5 + 0.5 * sin(normalized.x * 2.3 + normalized.y * 2.8 + scroll.y * 0.005);
    float softness = mix(mix(3.8 + cloud * 4.3 + lightMode * 3.0, 1.35, bevel), .28, clarity);
    vec3 color = clarity >= .97 || overscan ? backdrop(refracted, softness * 1.12)
      : spread(refracted, tangent, axis * mix(.94, .39, bevel), softness);

    // The curved rim sends wavelength bands along different paths. The flat face needs no extra texture reads.
    float prismWeight = smoothstep(mix(.23, .06, max(0.0, optics.z - 1.0)), .82, bevel);
    if (prismWeight > .005 && optics.z * optics.x > .001) {
      float separation = 4.8 * min(1.0, optics.z) + 27.0 * pow(max(0.0, optics.z - 1.0), 1.4);
      vec2 prism = -edgeNormal * separation * prismWeight * min(1.45, optics.x);
      float spectralBlur = mix(.72, .26, clarity);
      // Keep the guard area painted for asynchronous scrolling. The viewport gets all seven bands.
      vec3 spectrum = overscan
        ? vec3(backdrop(refracted - prism * .72, spectralBlur).r, color.g,
            backdrop(refracted + prism * .76, spectralBlur).b)
        : refractSpectrum(refracted, prism, spectralBlur);
      color = mix(color, spectrum, prismWeight * min(.97, optics.z * .76) * min(1.0, optics.x));
    }

    float frost = clamp(lens.z - 0.18 * bevel, 0.0, 1.0);
    color = mix(color, tint, frost);
    vec3 lamp = normalize(vec3(-0.45 + pointerPosition.x * 0.38, -0.66 + pointerPosition.y * 0.33, 0.74));
    float highlight = pow(max(0.0, dot(normal, lamp)), 11.0);
    float fresnel = 0.035 + 0.965 * pow(1.0 - normal.z, 4.6);
    float rim = exp(-abs(edge + 1.8) * 0.44);
    vec3 reflected = mix(vec3(0.45, 0.53, 0.92), vec3(0.98, 0.77, 0.91), highlight);
    color = mix(color, reflected, fresnel * (0.19 + rim * 0.29) * (1.0 - lightMode * 0.57));
    color += vec3(0.8, 0.89, 1.0) * highlight * rim * (0.32 - lightMode * 0.14) * finish.x;
    color *= 1.0 - bevel * 0.13 * smoothstep(-0.45, 1.0, dot(edgeNormal, vec2(0.3, 1.0)));
    float opacity = lens.w * mix(finish.y, finish.z, bevel);
    gl_FragColor = vec4(color, opacity * (1.0 - smoothstep(-0.8, 1.0, edge)));
    #include <colorspace_fragment>
  }
`;

export function createGlassSurface(invalidate, chromeHost = null) {
  const canvas = document.createElement("canvas");
  const options = { alpha: true, antialias: false, powerPreference: "low-power" };
  const context = canvas.getContext("webgl2", options);
  if (!context) return null;

  const renderer = new WebGLRenderer({ canvas, context, ...options });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  canvas.className = "glass-canvas";
  const layer = document.createElement("div");
  layer.className = chromeHost ? "glass-chrome-layer" : "glass-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.append(canvas);
  (chromeHost ?? document.body).prepend(layer);

  const uniforms = {
    wallpaper: { value: null },
    surface: { value: new Vector4() },
    visibleArea: { value: new Vector4() },
    lens: { value: new Vector4() },
    tile: { value: new Vector4() },
    pointerPosition: { value: new Vector2() },
    motion: { value: new Vector2() },
    scroll: { value: new Vector3() },
    optics: { value: new Vector3(1, 1, 1) },
    finish: { value: new Vector3(1, 1, 1) },
    clarity: { value: 0 },
    tint: { value: new Color() },
    lightMode: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader,
  });
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  let contextLost = false;
  let shaderFailed = false;
  let dimensions = "";
  let paintWindow;
  let canvasLeft;
  let canvasTop;

  renderer.debug.onShaderError = () => { shaderFailed = true; };

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    invalidate();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    shaderFailed = false;
    invalidate();
  });

  function draw(frame, panels, stage) {
    const {
      width, height, scrollY, tileSize, scrollOffset, light, tint, transparency, texture,
      refraction, distortion, dispersion, edge, pointerX, pointerY, speed, time,
    } = frame;
    if (!texture || contextLost || shaderFailed || !width || !height) return false;

    const host = chromeHost || stage || document.body;
    if (layer.parentElement !== host) host.prepend(layer);
    // The main canvas scrolls with the page. The chrome canvas moves with its sticky header.
    const relativeScroll = stage || chromeHost ? 0 : scrollY;
    const nextWindow = stage || chromeHost ? { top: 0, height } : glassPaintWindow(paintWindow, scrollY, height);
    const { top: origin, height: paintHeight } = nextWindow;
    const visible = [];
    for (const { element, type, clip } of panels) {
      const bounds = element.getBoundingClientRect();
      const y = bounds.top + relativeScroll - origin;
      const left = Math.max(0, Math.floor(Math.max(bounds.left, clip?.left ?? 0)));
      const top = Math.max(0, Math.floor(Math.max(y, clip?.top ?? 0)));
      const right = Math.min(width, Math.ceil(Math.min(bounds.right, clip?.right ?? width)));
      const bottom = Math.min(paintHeight, Math.ceil(Math.min(y + bounds.height, clip?.bottom ?? paintHeight)));
      if (left >= right || top >= bottom) continue;

      const style = getComputedStyle(element);
      const opacity = Number(style.opacity);
      if (opacity < 0.01 || style.visibility === "hidden") continue;

      const radius = Math.min(parseFloat(style.borderTopLeftRadius), bounds.width / 2, bounds.height / 2);
      const baseline = chromeHost
        ? Math.min(28, Math.max(10, radius * 1.26), bounds.height * .37)
        : Math.min(43, Math.max(12, radius * 1.32), bounds.height * .27);
      const bevel = edgeThickness(bounds.width, bounds.height, baseline, edge);
      visible.push({ bounds, y, left, top, right, bottom, radius, bevel, opacity, type });
    }

    if (chromeHost && !visible.length) return false;
    let drawLeft = 0;
    let drawTop = 0;
    let drawWidth = width;
    let drawHeight = paintHeight;
    let offsetLeft = 0;
    let offsetTop = origin;
    if (chromeHost) {
      const hostBounds = chromeHost.getBoundingClientRect();
      // Keep the render buffer steady while the settings menu slides into view.
      const blockSize = 64;
      drawLeft = Math.floor(Math.min(...visible.map(({ left }) => left)) / blockSize) * blockSize;
      drawTop = Math.floor(Math.min(...visible.map(({ top }) => top)) / blockSize) * blockSize;
      const right = Math.ceil(Math.max(...visible.map(({ right }) => right)) / blockSize) * blockSize;
      const bottom = Math.ceil(Math.max(...visible.map(({ bottom }) => bottom)) / blockSize) * blockSize;
      drawWidth = Math.min(width, right) - drawLeft;
      drawHeight = Math.min(height, bottom) - drawTop;
      offsetLeft = drawLeft - hostBounds.left;
      offsetTop = drawTop - hostBounds.top;
    }
    if (canvasLeft !== offsetLeft) {
      canvas.style.left = offsetLeft + "px";
      canvasLeft = offsetLeft;
    }
    if (canvasTop !== offsetTop) {
      canvas.style.top = offsetTop + "px";
      canvasTop = offsetTop;
    }
    paintWindow = nextWindow;
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(1700000 / (width * height)));
    const size = drawWidth + "x" + drawHeight + "@" + pixelRatio;
    if (dimensions !== size) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(drawWidth, drawHeight, false);
      canvas.style.width = drawWidth + "px";
      canvas.style.height = drawHeight + "px";
      dimensions = size;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, drawWidth, drawHeight);
    renderer.clear();
    uniforms.wallpaper.value = texture;
    const screenOffset = relativeScroll - origin;
    uniforms.tile.value.set((width - tileSize) / 2, scrollOffset + screenOffset, tileSize, texture.image.naturalWidth);
    uniforms.scroll.value.set(screenOffset, scrollOffset, height);
    uniforms.lightMode.value = Number(light);
    uniforms.tint.value.set(tint);
    uniforms.pointerPosition.value.set(pointerX, pointerY);
    uniforms.motion.value.set(speed, time);
    const clarity = Math.max(0, transparency - 1);
    uniforms.clarity.value = clarity;
    const frost = light ? 0.49 + (1 - Math.min(transparency, 1)) * .5
      : 0.23 + (1 - Math.min(transparency, 1)) * .75;
    const density = frost * (1 - clarity) + .014 * clarity;

    for (const { bounds, y, left, top, right, bottom, radius, bevel, opacity, type } of visible) {
      const finish = lensFinishes[type];
      uniforms.surface.value.set(bounds.x, y, bounds.width, bounds.height);
      uniforms.visibleArea.value.set(left, top, right - left, bottom - top);
      uniforms.lens.value.set(radius, bevel, density, opacity);
      uniforms.optics.value.set(refraction * finish.boost, distortion * finish.boost, dispersion);
      uniforms.finish.value.set(finish.highlight, finish.bodyAlpha, finish.rimAlpha);
      renderer.setViewport(left - drawLeft, drawHeight - bottom + drawTop, right - left, bottom - top);
      renderer.render(scene, camera);
      if (shaderFailed) return false;
    }
    return true;
  }

  return { draw };
}
