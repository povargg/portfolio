// Use the browser's backdrop as the input so images and type are refracted as they pass underneath.
const svgNamespace = "http://www.w3.org/2000/svg";

function svgElement(parent, tag, attributes) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

function faceMap(canvas, width, height, radius, refraction, distortion) {
  const scale = Math.min(1, 320 / Math.max(width, height));
  canvas.width = Math.max(4, Math.round(width * scale));
  canvas.height = Math.max(4, Math.round(height * scale));
  const context = canvas.getContext("2d");
  const map = context.createImageData(canvas.width, canvas.height);
  const bevelWidth = Math.min(29, height * .31, Math.max(13, radius));

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const px = (x + .5) / canvas.width * width - width / 2;
      const py = (y + .5) / canvas.height * height - height / 2;
      const qx = Math.abs(px) - width / 2 + radius;
      const qy = Math.abs(py) - height / 2 + radius;
      const corner = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const depth = Math.max(0, radius - corner - Math.min(Math.max(qx, qy), 0));
      const xNormal = Math.sign(px) * (corner > 0 ? Math.max(qx, 0) / corner : Number(qx >= qy));
      const yNormal = Math.sign(py) * (corner > 0 ? Math.max(qy, 0) / corner : Number(qy > qx));
      const t = Math.min(1, depth / bevelWidth);
      const curve = 1 - t * t * (3 - 2 * t);
      const heightAtBevel = Math.sqrt(Math.max(.075, 1 - curve * curve));
      const sideways = .68 * curve / (heightAtBevel + .45) * refraction;
      const ripple = (1 - curve) * Math.sin(py * .04 + px * .018) * .033 * distortion;
      const i = (y * canvas.width + x) * 4;
      map.data[i] = 128 - 112 * (xNormal * sideways + ripple);
      map.data[i + 1] = 128 - 112 * (yNormal * sideways - ripple * .55);
      map.data[i + 2] = 255 * (.11 + .89 * curve);
      map.data[i + 3] = 255;
    }
  }
  context.putImageData(map, 0, 0);
  return canvas.toDataURL("image/png");
}

function addLens(definitions, id, element, baseScale, blur) {
  const filter = svgElement(definitions, "filter", {
    id, x: "-15%", y: "-46%", width: "130%", height: "192%",
    "color-interpolation-filters": "sRGB",
  });
  const map = svgElement(filter, "feImage", { x: 0, y: 0, preserveAspectRatio: "none", result: "face" });
  const haze = svgElement(filter, "feGaussianBlur", { in: "SourceGraphic", stdDeviation: blur, result: "soft" });
  svgElement(filter, "feGaussianBlur", { in: "SourceGraphic", stdDeviation: ".75", result: "sharp" });
  svgElement(filter, "feColorMatrix", {
    in: "face", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0", result: "rim",
  });
  svgElement(filter, "feComposite", { in: "sharp", in2: "rim", operator: "in", result: "bevel" });
  svgElement(filter, "feComposite", { in: "soft", in2: "rim", operator: "out", result: "body" });
  svgElement(filter, "feComposite", {
    in: "bevel", in2: "body", operator: "arithmetic", k2: 1, k3: 1, result: "diffused",
  });

  const channels = ["red", "green", "blue"];
  const waves = channels.map((channel, index) => {
    const wave = svgElement(filter, "feDisplacementMap", {
      in: "diffused", in2: "face", scale: baseScale, xChannelSelector: "R", yChannelSelector: "G",
      result: channel + "Bent",
    });
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    matrix[index * 6] = 1;
    svgElement(filter, "feColorMatrix", {
      in: channel + "Bent", type: "matrix", values: matrix.join(" "), result: channel,
    });
    return wave;
  });
  svgElement(filter, "feBlend", { in: "red", in2: "green", mode: "screen", result: "redGreen" });
  svgElement(filter, "feBlend", { in: "redGreen", in2: "blue", mode: "screen" });

  const canvas = document.createElement("canvas");
  let dimensions = "";
  let lastScale;

  return function update(speed, refraction, distortion) {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (width < 2 || height < 2) return;
    const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius), width / 2, height / 2);
    const roundedHeight = Math.max(2, Math.round(height / 6) * 6);
    const size = [width, roundedHeight, radius, refraction, distortion].join(":");
    if (dimensions !== size) {
      map.setAttribute("width", width);
      map.setAttribute("height", height);
      map.setAttribute("href", faceMap(canvas, width, height, radius, refraction, distortion));
      dimensions = size;
    } else if (Number(map.getAttribute("height")) !== height) {
      map.setAttribute("height", height);
    }

    const motion = Math.round(Math.abs(speed) * 16) / 16;
    const scale = [motion, refraction, distortion].join(":");
    if (scale === lastScale) return;
    const ior = [1 - .14 * refraction, 1, 1 + .15 * refraction];
    waves.forEach((wave, index) => {
      wave.setAttribute("scale", (baseScale * ior[index] * (1 + motion * .49 * distortion)).toFixed(2));
    });
    haze.setAttribute("stdDeviation", (blur + motion * 2.1).toFixed(2));
    lastScale = scale;
  };
}

export function createGlassBackdrop() {
  // WebKit and Gecko currently support the CSS blur fallback but cannot apply this SVG to the backdrop.
  if (!/\b(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent)
      || !CSS.supports("backdrop-filter", 'url("#glass-header-lens")')) return null;

  const svg = svgElement(document.body, "svg", {
    class: "glass-definitions", width: 0, height: 0, "aria-hidden": "true", focusable: "false",
  });
  const definitions = svgElement(svg, "defs", {});
  const header = document.querySelector(".header-color");
  const menu = document.querySelector(".preferences-panel");
  const updateHeader = addLens(definitions, "glass-header-lens", header, 37, 4.25);
  const updateMenu = addLens(definitions, "glass-menu-lens", menu, 41, 6.25);
  return (speed, refraction, distortion) => {
    updateHeader(speed, refraction, distortion);
    if (!menu.inert) updateMenu(speed, refraction, distortion);
  };
}
