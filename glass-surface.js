import {
  Color, Mesh, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial,
  SRGBColorSpace, TextureLoader, Vector2, Vector4, WebGLRenderer,
} from "./vendor/three.module.min.js";
import { glassPaintWindow } from "./glass-motion.js";

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D wallpaper;
  uniform vec4 surface;
  uniform vec4 visibleArea;
  uniform vec4 lens;
  uniform vec4 tile;
  uniform vec2 pointerPosition;
  uniform vec2 motion;
  uniform vec2 scroll;
  uniform vec2 optics;
  uniform vec3 tint;
  uniform float lightMode;

  float roundedBox(vec2 point, vec2 halfSize, float radius) {
    vec2 q = abs(point) - halfSize + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  }

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

  void main() {
    vec2 screenPosition = visibleArea.xy + vec2(vUv.x, 1.0 - vUv.y) * visibleArea.zw;
    vec2 halfSize = surface.zw * 0.5;
    vec2 p = screenPosition - surface.xy - halfSize;
    float edge = roundedBox(p, halfSize, lens.x);
    if (edge > 1.0) discard;

    vec2 slope = vec2(
      roundedBox(p + vec2(1.0, 0.0), halfSize, lens.x) - roundedBox(p - vec2(1.0, 0.0), halfSize, lens.x),
      roundedBox(p + vec2(0.0, 1.0), halfSize, lens.x) - roundedBox(p - vec2(0.0, 1.0), halfSize, lens.x)
    );
    vec2 edgeNormal = slope / max(length(slope), 0.01);
    vec2 normalized = p / halfSize;
    float bevel = 1.0 - smoothstep(0.0, lens.y, -edge);
    float edgeHeight = sqrt(max(0.065, 1.0 - bevel * bevel));
    vec2 flex = vec2(
      sin((screenPosition.y - scroll.x) * 0.013 + motion.y) * 0.093,
      cos(screenPosition.x * 0.009 - motion.y * 0.6) * 0.066
    ) * motion.x;
    vec3 normal = normalize(vec3(edgeNormal * bevel * 0.97 + normalized * 0.10 + flex, edgeHeight));
    vec3 view = normalize(vec3(pointerPosition * 0.14, -1.0));
    vec3 ray = refract(view, normal, 1.0 / 1.47);
    float depth = mix(17.0, lens.y * 1.69, bevel);
    vec3 curvature = normalize(vec3(edgeNormal * bevel * 0.97, edgeHeight));
    vec3 baseRay = refract(view, curvature, 1.0 / 1.47);
    vec2 shapeBend = baseRay.xy * depth / max(-baseRay.z, 0.24) - view.xy * 12.0;
    vec2 ripple = (ray.xy / max(-ray.z, 0.24) - baseRay.xy / max(-baseRay.z, 0.24)) * depth;
    vec2 bend = shapeBend * optics.x + ripple * optics.y;
    vec2 refracted = screenPosition + bend;

    vec2 axis = mix(vec2(0.8, 0.6), edgeNormal, bevel);
    vec2 tangent = vec2(-axis.y, axis.x);
    float cloud = 0.5 + 0.5 * sin(normalized.x * 2.3 + normalized.y * 2.8 + scroll.y * 0.005);
    float softness = mix(3.8 + cloud * 4.3 + lightMode * 3.0, 1.35, bevel);
    vec3 color = spread(refracted, tangent, axis * mix(0.94, 0.39, bevel), softness);

    // Independent indices of refraction separate the red and blue light on the curved rim.
    vec3 redRay = refract(view, normal, 1.0 / 1.424);
    vec3 blueRay = refract(view, normal, 1.0 / 1.528);
    float dispersion = smoothstep(0.2, 0.83, bevel);
    vec2 redOffset = ((redRay.xy - ray.xy) * depth * 2.5 + axis * 0.6) * dispersion * optics.x;
    vec2 blueOffset = ((blueRay.xy - ray.xy) * depth * 2.5 - axis * 0.6) * dispersion * optics.x;
    color.rb = mix(color.rb,
      vec2(backdrop(refracted + redOffset, 0.69).r, backdrop(refracted + blueOffset, 0.69).b),
      dispersion * min(1.0, optics.x) * 0.81);

    float frost = clamp(lens.z - 0.18 * bevel, 0.0, 1.0);
    color = mix(color, tint, frost);
    vec3 lamp = normalize(vec3(-0.45 + pointerPosition.x * 0.38, -0.66 + pointerPosition.y * 0.33, 0.74));
    float highlight = pow(max(0.0, dot(normal, lamp)), 11.0);
    float fresnel = 0.035 + 0.965 * pow(1.0 - normal.z, 4.6);
    float rim = exp(-abs(edge + 1.8) * 0.44);
    vec3 reflected = mix(vec3(0.45, 0.53, 0.92), vec3(0.98, 0.77, 0.91), highlight);
    color = mix(color, reflected, fresnel * (0.19 + rim * 0.29) * (1.0 - lightMode * 0.57));
    color += vec3(0.8, 0.89, 1.0) * highlight * rim * (0.32 - lightMode * 0.14);
    color *= 1.0 - bevel * 0.13 * smoothstep(-0.45, 1.0, dot(edgeNormal, vec2(0.3, 1.0)));
    gl_FragColor = vec4(color, lens.w * (1.0 - smoothstep(-0.8, 1.0, edge)));
    #include <colorspace_fragment>
  }
`;

export function createGlassSurface(invalidate) {
  const canvas = document.createElement("canvas");
  const options = { alpha: true, antialias: false, powerPreference: "low-power" };
  const context = canvas.getContext("webgl2", options);
  if (!context) return null;

  const renderer = new WebGLRenderer({ canvas, context, ...options });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  canvas.className = "glass-canvas";
  const layer = document.createElement("div");
  layer.className = "glass-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.append(canvas);
  document.body.append(layer);

  const uniforms = {
    wallpaper: { value: null },
    surface: { value: new Vector4() },
    visibleArea: { value: new Vector4() },
    lens: { value: new Vector4() },
    tile: { value: new Vector4() },
    pointerPosition: { value: new Vector2() },
    motion: { value: new Vector2() },
    scroll: { value: new Vector2() },
    optics: { value: new Vector2(1, 1) },
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

  const loader = new TextureLoader();
  const textures = new Map();
  let activeMode;
  let activeTexture;
  let contextLost = false;
  let dimensions = "";
  let paintWindow;

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    invalidate();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    invalidate();
  });

  function useWallpaper(mode) {
    if (mode === activeMode) return;
    activeMode = mode;
    activeTexture = null;
    if (!textures.has(mode)) {
      const file = mode === "light" ? "./assets/glass-meadow.jpg" : "./assets/glass-sky.jpg";
      const texture = loader.loadAsync(new URL(file, import.meta.url).href).then((image) => {
        image.wrapS = image.wrapT = RepeatWrapping;
        image.colorSpace = SRGBColorSpace;
        return image;
      });
      textures.set(mode, texture);
    }
    textures.get(mode).then((image) => {
      if (activeMode === mode) {
        activeTexture = image;
        invalidate();
      }
    }).catch(() => {
      textures.delete(mode);
      invalidate();
    });
  }

  function draw(frame, panels) {
    const {
      width, height, scrollY, tileSize, scrollOffset, light, tint, transparency,
      refraction, distortion, pointerX, pointerY, speed, time,
    } = frame;
    canvas.hidden = !activeTexture || contextLost;
    if (canvas.hidden || !width || !height) return false;

    // The compositor scrolls this canvas with the page, including between WebGL frames.
    const nextWindow = glassPaintWindow(paintWindow, scrollY, height);
    const { top: origin, height: paintHeight } = nextWindow;
    const visible = [];
    for (const element of panels) {
      const bounds = element.getBoundingClientRect();
      const y = bounds.top + scrollY - origin;
      const left = Math.max(0, Math.floor(bounds.left));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(width, Math.ceil(bounds.right));
      const bottom = Math.min(paintHeight, Math.ceil(y + bounds.height));
      if (left >= right || top >= bottom) continue;

      const style = getComputedStyle(element);
      const opacity = Number(style.opacity);
      if (opacity < 0.01 || style.visibility === "hidden") continue;

      const radius = Math.min(parseFloat(style.borderTopLeftRadius), bounds.width / 2, bounds.height / 2);
      const bevel = Math.min(43, Math.max(12, radius * 1.32), bounds.height * 0.27);
      visible.push({ bounds, y, left, top, right, bottom, radius, bevel, opacity });
    }

    if (nextWindow !== paintWindow) {
      canvas.style.top = origin + "px";
      paintWindow = nextWindow;
    }
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(1700000 / (width * height)));
    const size = width + "x" + paintHeight + "@" + pixelRatio;
    if (dimensions !== size) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, paintHeight, false);
      canvas.style.height = paintHeight + "px";
      dimensions = size;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, paintHeight);
    renderer.clear();
    uniforms.wallpaper.value = activeTexture;
    const screenOffset = scrollY - origin;
    uniforms.tile.value.set((width - tileSize) / 2, scrollOffset + screenOffset, tileSize, activeTexture.image.width);
    uniforms.scroll.value.set(screenOffset, scrollOffset);
    uniforms.lightMode.value = Number(light);
    uniforms.tint.value.set(tint);
    uniforms.pointerPosition.value.set(pointerX, pointerY);
    uniforms.motion.value.set(speed, time);
    uniforms.optics.value.set(refraction, distortion);
    const density = light ? 0.49 + (1 - transparency) * 0.5 : 0.23 + (1 - transparency) * 0.75;

    for (const { bounds, y, left, top, right, bottom, radius, bevel, opacity } of visible) {
      uniforms.surface.value.set(bounds.x, y, bounds.width, bounds.height);
      uniforms.visibleArea.value.set(left, top, right - left, bottom - top);
      uniforms.lens.value.set(radius, bevel, density, opacity);
      renderer.setViewport(left, paintHeight - bottom, right - left, bottom - top);
      renderer.render(scene, camera);
    }
    return true;
  }

  return { useWallpaper, draw };
}
