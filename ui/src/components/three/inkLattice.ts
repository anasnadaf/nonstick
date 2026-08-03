import * as THREE from "three";

/**
 * "Ink lattice" — the structure the product actually builds, drawn as an
 * engraved plate rather than a particle field.
 *
 *   hubs      documents you uploaded
 *   nodes     the chunks they were split into
 *   hairlines chunk → document membership (ink, faint)
 *   copper    cross-document citation edges (the interesting ones)
 *
 * Everything fades with depth, the way an etching lightens as it recedes into
 * the page. No bloom, no emissive glow, no tone mapping — those belong to a
 * different aesthetic and would fight the paper.
 */

export interface LatticeOptions {
  /** CSS colour for node dots and structural hairlines. */
  inkColor: string;
  /** CSS colour for cross-document citation edges. */
  copperColor: string;
  /** Scales node counts. 1 = hero, ~0.35 = ambient. */
  density?: number;
  /** Global alpha multiplier. */
  opacity?: number;
  /** Follow the pointer with a slight parallax. */
  interactive?: boolean;
  /** Render a single frame and never animate. */
  still?: boolean;
}

export interface LatticeHandle {
  start(): void;
  stop(): void;
  setColors(inkColor: string, copperColor: string): void;
  dispose(): void;
}

const DEPTH_FADE = /* glsl */ `
  float depthFade(float depth) {
    return 1.0 - smoothstep(uNear, uFar, depth);
  }
`;

const NODE_VERT = /* glsl */ `
  attribute float aScale;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vDepth;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_PointSize = aScale * uSize * uPixelRatio * (4.0 / vDepth);
    gl_Position = projectionMatrix * mv;
  }
`;

const NODE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uNear;
  uniform float uFar;
  varying float vDepth;
  ${DEPTH_FADE}

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    // Soft rim keeps the dots reading as printed, not as sprites.
    float disc = smoothstep(0.25, 0.13, d2);
    gl_FragColor = vec4(uColor, disc * depthFade(vDepth) * uOpacity);
  }
`;

const EDGE_VERT = /* glsl */ `
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uNear;
  uniform float uFar;
  varying float vDepth;
  ${DEPTH_FADE}

  void main() {
    gl_FragColor = vec4(uColor, depthFade(vDepth) * uOpacity);
  }
`;

/** Deterministic PRNG so the plate is identical on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fibonacciSphere(i: number, n: number, radius: number) {
  const y = 1 - (i / Math.max(1, n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.399963229728653; // golden angle
  return new THREE.Vector3(
    Math.cos(theta) * r * radius,
    y * radius,
    Math.sin(theta) * r * radius,
  );
}

export function createLattice(
  canvas: HTMLCanvasElement,
  opts: LatticeOptions,
): LatticeHandle {
  const {
    inkColor,
    copperColor,
    density = 1,
    opacity = 1,
    interactive = false,
    still = false,
  } = opts;

  const rand = mulberry32(0x5e1f);

  const docCount = Math.max(3, Math.round(7 * density));
  const chunksPerDoc = Math.max(4, Math.round(26 * density));
  const citationCount = Math.max(6, Math.round(44 * density));

  // ---- geometry ---------------------------------------------------------

  const hubs: THREE.Vector3[] = [];
  for (let i = 0; i < docCount; i++) {
    hubs.push(fibonacciSphere(i, docCount, 2.05));
  }

  const positions: number[] = [];
  const scales: number[] = [];
  const structural: number[] = [];
  /** Index into `positions` (in vertices) of each chunk, grouped by doc. */
  const chunkIndexByDoc: number[][] = [];

  hubs.forEach((hub) => {
    const hubIndex = positions.length / 3;
    positions.push(hub.x, hub.y, hub.z);
    scales.push(2.9);

    const owned: number[] = [];
    for (let c = 0; c < chunksPerDoc; c++) {
      // Cluster around the hub, then relax outward so the shell stays open.
      const dir = new THREE.Vector3(
        rand() - 0.5,
        rand() - 0.5,
        rand() - 0.5,
      ).normalize();
      const spread = 0.35 + rand() * 0.95;
      const p = hub.clone().addScaledVector(dir, spread);
      p.multiplyScalar(1 + (rand() - 0.5) * 0.12);

      const idx = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      scales.push(0.85 + rand() * 0.7);
      owned.push(idx);

      structural.push(hub.x, hub.y, hub.z, p.x, p.y, p.z);
    }
    chunkIndexByDoc.push(owned);
    void hubIndex;
  });

  // Citation edges deliberately span *different* documents — that crossing
  // traffic is the whole point of the picture.
  const citations: number[] = [];
  for (let i = 0; i < citationCount; i++) {
    const a = Math.floor(rand() * docCount);
    let b = Math.floor(rand() * docCount);
    if (b === a) b = (b + 1) % docCount;
    const from = chunkIndexByDoc[a][Math.floor(rand() * chunkIndexByDoc[a].length)];
    const to = chunkIndexByDoc[b][Math.floor(rand() * chunkIndexByDoc[b].length)];
    citations.push(
      positions[from * 3],
      positions[from * 3 + 1],
      positions[from * 3 + 2],
      positions[to * 3],
      positions[to * 3 + 1],
      positions[to * 3 + 2],
    );
  }

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  nodeGeo.setAttribute("aScale", new THREE.Float32BufferAttribute(scales, 1));

  const structuralGeo = new THREE.BufferGeometry();
  structuralGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(structural, 3),
  );

  const citationGeo = new THREE.BufferGeometry();
  citationGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(citations, 3),
  );

  // ---- materials --------------------------------------------------------

  const near = 3.4;
  const far = 11.5;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const nodeMat = new THREE.ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(inkColor) },
      uOpacity: { value: 0.82 * opacity },
      uSize: { value: 1.55 },
      uPixelRatio: { value: pixelRatio },
      uNear: { value: near },
      uFar: { value: far },
    },
  });

  const makeEdgeMat = (color: string, alpha: number) =>
    new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: alpha * opacity },
        uNear: { value: near },
        uFar: { value: far },
      },
    });

  const structuralMat = makeEdgeMat(inkColor, 0.16);
  const citationMat = makeEdgeMat(copperColor, 0.55);

  // ---- scene ------------------------------------------------------------

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.add(new THREE.Points(nodeGeo, nodeMat));
  group.add(new THREE.LineSegments(structuralGeo, structuralMat));
  group.add(new THREE.LineSegments(citationGeo, citationMat));
  group.rotation.set(0.32, 0.6, 0.06);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 7.1);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearAlpha(0);

  const resize = () => {
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || canvas.clientWidth || 1;
    const h = parent?.clientHeight || canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (observer && canvas.parentElement) observer.observe(canvas.parentElement);

  // ---- interaction ------------------------------------------------------

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  const onPointerMove = (e: PointerEvent) => {
    pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (interactive) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  }

  // ---- loop -------------------------------------------------------------

  let frame = 0;
  let running = false;
  const clock = new THREE.Clock();
  const baseX = group.rotation.x;

  const render = () => renderer.render(scene, camera);

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    group.rotation.y += dt * 0.075;
    pointer.x += (pointerTarget.x - pointer.x) * 0.04;
    pointer.y += (pointerTarget.y - pointer.y) * 0.04;
    group.rotation.x = baseX + Math.sin(t * 0.21) * 0.05 + pointer.y * 0.12;
    group.position.x = pointer.x * 0.18;

    render();
    frame = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      if (still) {
        render();
        return;
      }
      clock.start();
      frame = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
    setColors(nextInk: string, nextCopper: string) {
      nodeMat.uniforms.uColor.value.set(nextInk);
      structuralMat.uniforms.uColor.value.set(nextInk);
      citationMat.uniforms.uColor.value.set(nextCopper);
      if (!running || still) render();
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer?.disconnect();
      if (interactive) window.removeEventListener("pointermove", onPointerMove);
      nodeGeo.dispose();
      structuralGeo.dispose();
      citationGeo.dispose();
      nodeMat.dispose();
      structuralMat.dispose();
      citationMat.dispose();
      renderer.dispose();
    },
  };
}
