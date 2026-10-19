// The DARING hero, built after the poster's key visual: a thick, knotted chrome form made of deep stacked
// plates (like a slinky), with smooth polished stretches, a hole through its middle, and thin spikes.
// Procedural Three.js; it answers the light. Edit, then rebuild with `npm run build-hero` (writes assets/hero.js).
import {
  WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Mesh, MeshPhysicalMaterial, Group,
  PointLight, Vector3, Curve, CatmullRomCurve3, PMREMGenerator, ACESFilmicToneMapping, SRGBColorSpace, DoubleSide,
  MathUtils, CanvasTexture, EquirectangularReflectionMapping,
} from 'three';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ── The knot: a trefoil, so the form crosses itself into three lobes around an open middle ──
class Trefoil extends Curve {
  getPoint(t, out = new Vector3()) {
    const a = TAU * t;
    return out.set(Math.sin(a) + 2 * Math.sin(2 * a), Math.cos(a) - 2 * Math.cos(2 * a), -1.1 * Math.sin(3 * a)).multiplyScalar(0.95);
  }
}

/**
 * Sweeps a cross-section along a curve. profile(u) → { r, flat, plates, angle, pleat }:
 *   r      radius; flat: 1 = round tube, 0.1 = thin sheet; plates: depth of the stacked plates (0 = smooth chrome)
 *   angle  which way the flattened section faces; pleat: ripples across a flattened sheet
 */
function sweep(curve, along, around, closed, profile, plateCount) {
  const frames = curve.computeFrenetFrames(along, closed);
  const rows = closed ? along : along + 1;
  const pos = new Float32Array(rows * (around + 1) * 3);
  const p = new Vector3(), c = new Vector3(), n = new Vector3(), b = new Vector3();
  for (let i = 0; i < rows; i++) {
    const u = i / along;
    curve.getPointAt(u, c);
    const f = profile(u);
    // deep, narrow grooves between wide plates: most of the surface sits at full radius
    const wave = 0.5 + 0.5 * Math.cos(TAU * plateCount * u);
    const groove = f.plates * smooth(0.3, 0.92, 1 - wave);
    const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
    n.copy(frames.normals[i]).multiplyScalar(ca).addScaledVector(frames.binormals[i], sa);
    b.copy(frames.binormals[i]).multiplyScalar(ca).addScaledVector(frames.normals[i], -sa);
    for (let j = 0; j <= around; j++) {
      const th = (j / around) * TAU;
      const r = f.r * (1 - groove) * (1 + f.pleat * Math.sin(3 * th));
      p.copy(c).addScaledVector(n, Math.cos(th) * r).addScaledVector(b, Math.sin(th) * r * f.flat);
      const k = (i * (around + 1) + j) * 3;
      pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
    }
  }
  const index = [];
  const last = closed ? rows : rows - 1;
  for (let i = 0; i < last; i++) {
    const i2 = (i + 1) % rows;
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j, d = i2 * (around + 1) + j;
      index.push(a, d, a + 1, d, d + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The knot's character along its length: swelling, flattening into sheets, and stretches of smooth chrome.
function knotProfile(u) {
  return {
    r: 0.95 + 0.45 * Math.sin(TAU * u + 0.6) + 0.16 * Math.sin(TAU * 3 * u + 1.7),
    flat: 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.9)),
    plates: 0.3 * (1 - 0.95 * Math.exp(-Math.pow(((u - 0.18 + 1) % 1 - 0.5) * 9, 2)) - 0.95 * Math.exp(-Math.pow(((u - 0.62 + 1) % 1 - 0.5) * 11, 2))),
    angle: TAU * 1.5 * u,
    pleat: 0.06 * (0.5 + 0.5 * Math.cos(TAU * 2 * u)),
  };
}

// Thin, smooth spikes: a flattened blade that tapers to a point.
function spike(points, width) {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
  return sweep(curve, 160, 24, false, (u) => ({
    r: width * Math.pow(1 - u, 1.35) * smooth(0, 0.12, u + 0.04), flat: 0.16, plates: 0, angle: 0.4 + u * 1.2, pleat: 0,
  }), 1);
}

// What the chrome reflects: a panorama painted in code like holographic foil. Narrow rainbow bands that repeat,
// dark navy bands between them for contrast, and thin white lines for the crisp highlights on every plate edge.
function foilPanorama() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  // the poster's palette, in the order the bands run: silver-violet chrome with cyan, pink and gold sheen
  const STOPS = ['#1b1440', '#7b4dff', '#c9a8ff', '#f4f0ff', '#7fe6ff', '#3d5cff', '#1b1440', '#ff9ad5', '#ffd27a', '#f7f3ff', '#a77bff', '#2a1c5c']
    .map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  const palette = (t) => {
    const x = (((t % 1) + 1) % 1) * STOPS.length, i = Math.floor(x), f = x - i, a = STOPS[i], b = STOPS[(i + 1) % STOPS.length];
    const e = f * f * (3 - 2 * f);
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  };
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // bands sweep across the panorama, bent by soft waves so they curve over the form
      const bend = 0.07 * Math.sin(TAU * (v * 2 + u)) + 0.04 * Math.sin(TAU * (u * 5 - v * 3));
      const [r, gg, b] = palette(u * 2 + v * 1.2 + bend);
      const i = (y * W + x) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // thin white light lines
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    const x = (k / 6) * W + 60 * Math.sin(k * 2.3);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(x, H * 0.15, 6 + (k % 3) * 4, H * 0.55);
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, H * 0.32, W, 8);
  const tex = new CanvasTexture(c);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function start(canvas, fallback) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null; // no WebGL: the poster image stays
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(foilPanorama()).texture;
  scene.environmentIntensity = 1.2;
  const camera = new PerspectiveCamera(30, 2, 0.1, 100);

  // chrome with a thin-film rainbow, tinted toward violet like the poster
  const material = new MeshPhysicalMaterial({
    color: 0xece6ff, metalness: 1, roughness: 0.08,
    iridescence: 0.85, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900],
    clearcoat: 1, clearcoatRoughness: 0.05, side: DoubleSide,
  });
  const form = new Group();
  form.add(new Mesh(sweep(new Trefoil(), 3000, 64, true, knotProfile, 170), material));
  form.add(new Mesh(spike([[-1.2, 1.2, 0.4], [-2.4, 2.0, 0.9], [-2.6, 3.4, 0.6], [-1.7, 4.6, 0.1], [-1.3, 5.4, -0.2]], 0.75), material)); // top-left blade
  form.add(new Mesh(spike([[1.0, 1.4, -0.1], [2.2, 2.2, 0.3], [2.4, 3.4, 0.6], [3.4, 4.1, 0.4], [4.2, 4.9, 0.1]], 0.7), material));   // top-right blade
  form.add(new Mesh(spike([[-1.8, -1.6, 0.4], [-3.0, -2.0, 1.0], [-4.0, -2.9, 0.8], [-5.0, -3.4, 0.3]], 0.6), material));            // bottom-left blade
  form.scale.set(1.9, 1.05, 1.1); // the poster's form is wide and low
  form.rotation.set(-0.42, 0.32, 0.18);
  form.position.set(1.0, -0.75, 0); // fills the left, keeps the area under "DARE TO MAKE." dark, right lobe off the edge
  scene.add(form);

  // lights: three coloured lights orbit; a white light follows the pointer
  const orbiters = [[0xb98cff, 0], [0x6fe3ff, 2.1], [0xff8fd0, 4.2]].map(([color, phase]) => {
    const l = new PointLight(color, 90, 0, 2);
    scene.add(l);
    return { l, phase };
  });
  const pointerLight = new PointLight(0xffffff, 110, 0, 2);
  scene.add(pointerLight);
  const pointer = { x: 0.3, y: 0.2, tx: 0.3, ty: 0.2 };
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5);
    pointer.ty = MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5);
    if (still) requestAnimationFrame(() => draw(0));
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, w / h < 1.3 ? 22 : 14); // big enough to fill the frame, a lobe running off the edge
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function draw(t) {
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    pointerLight.position.set(pointer.x * 7, pointer.y * 4, 6);
    orbiters.forEach(({ l, phase }, k) => {
      const a = t * (0.2 + k * 0.05) + phase;
      l.position.set(Math.cos(a) * 8, Math.sin(a * 1.3) * 4, Math.sin(a) * 7);
    });
    form.rotation.y = 0.32 + Math.sin(t * 0.11) * 0.28 + pointer.x * 0.1;
    form.rotation.x = -0.42 + Math.sin(t * 0.08) * 0.12 - pointer.y * 0.07;
    form.rotation.z = 0.12 + Math.sin(t * 0.05) * 0.1;
    renderer.render(scene, camera);
  }

  // run only while on screen; hold still when the visitor prefers less motion
  let visible = true, running = false;
  const t0 = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !running && !still) loop(); }).observe(canvas);
  function loop() {
    running = visible && !document.hidden && !still;
    if (!running) return;
    draw((performance.now() - t0) / 1000);
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !running && !still) loop(); });

  canvas.hidden = false;
  if (fallback) fallback.hidden = true;
  if (still) draw(0); else loop();
  return { renderer, scene, camera, form, pointerLight, draw };
}

const canvas = document.getElementById('hero-3d');
if (canvas) window.__hero = start(canvas, document.getElementById('hero-poster'));
