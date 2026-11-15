import {
  Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer,
} from "./vendor/three.module.min.js";

export function createSkillReflection() {
  const canvas = document.createElement("canvas");
  const options = { alpha: true, antialias: false, powerPreference: "low-power" };
  const context = canvas.getContext("webgl2", options);
  if (!context) return null;

  canvas.className = "reflection-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new WebGLRenderer({ canvas, context, ...options });
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;

  const material = new ShaderMaterial({
    uniforms: {
      pointer: { value: new Vector2(.5, .5) },
      aspect: { value: 1 },
    },
    vertexShader: `
      varying vec2 cardPoint;

      void main() {
        cardPoint = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 cardPoint;
      uniform vec2 pointer;
      uniform float aspect;

      void main() {
        vec2 relative = (cardPoint - pointer) * vec2(aspect, 1.0);
        float wave = relative.x * 0.67 + relative.y * 0.48;
        wave += 0.18 * sin(relative.y * 5.4 - relative.x * 3.6);
        float distanceToLight = length(relative);
        float phase = wave * 1.25 + 0.68 * distanceToLight;
        vec3 spectrum = 0.55 + 0.45 * cos(6.28318 * (phase + vec3(0.0, 0.32, 0.65)));
        float falloff = 1.0 - smoothstep(0.10, 1.1, distanceToLight);
        float glint = exp(-34.0 * wave * wave) * falloff;
        vec3 colour = mix(spectrum, vec3(1.0, 0.98, 0.93), glint * 0.48);
        gl_FragColor = vec4(colour, falloff * 0.18 + glint * 0.19);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new Mesh(new PlaneGeometry(2, 2), material));

  let canvasWidth = 0;
  let canvasHeight = 0;
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    canvas.remove();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
  });

  return {
    paint(surface, x, y, width, height) {
      if (contextLost) return;
      const scale = Math.min(window.devicePixelRatio, 1.5, 560 / width, 360 / height);
      const newWidth = Math.max(1, Math.floor(width * scale));
      const newHeight = Math.max(1, Math.floor(height * scale));
      if (canvasWidth !== newWidth || canvasHeight !== newHeight) {
        canvasWidth = newWidth;
        canvasHeight = newHeight;
        renderer.setSize(canvasWidth, canvasHeight, false);
      }
      if (canvas.parentElement !== surface) surface.append(canvas);
      material.uniforms.aspect.value = width / height;
      material.uniforms.pointer.value.set(x, 1 - y);
      renderer.render(scene, camera);
    },
    hide() {
      canvas.remove();
    },
  };
}
