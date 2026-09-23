import * as THREE from "three";
import { DECOR, type DecorId, type Placed, type UpgradeId } from "./progress.js";

/** 3D diorama: floating island, stations, upgrades, and the Friend as an upright pixel billboard. */
export type StationId = "merchant" | "workbench" | "echo" | "rain" | "vault";
export const STATIONS: readonly { id: StationId; x: number; z: number; r: number }[] = [
  { id: "merchant", x: -6.3, z: 0.4, r: 0.95 }, { id: "workbench", x: -3.3, z: -6, r: 0.8 },
  { id: "echo", x: 3.6, z: -5.8, r: 1.05 }, { id: "rain", x: 6.4, z: 0.9, r: 0.95 }, { id: "vault", x: 0.3, z: 6.4, r: 0.95 },
];
export const REACH = 1.95;
const SPEED = 4.2, RADIUS = 0.28, SPAWN = { x: 0, z: 2.2 }, ISLAND = 9;
const COL = { grass: 0x78c265, grass2: 0x62ad58, sand: 0xe9d29a, dirt: 0x8a5a3c, dirt2: 0x6f4631, dirt3: 0x57372a, stone: 0x9b93b8,
  stoneDark: 0x6d6690, wood: 0x9a6a43, woodDark: 0x6b452b, gold: 0xffc93a, goldDark: 0xc98a1c, leaf: 0x3f9a5a, leaf2: 0x2f7d4a };
export type Facing = "down" | "up" | "left" | "right";
export type StepResult = { moving: boolean; facing: Facing; near: StationId | null; x: number; z: number };

const land = new Set<string>(); const key = (x: number, z: number) => `${x},${z}`;
for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) {
  const wobble = Math.sin(x * 0.9) * 0.55 + Math.cos(z * 1.1) * 0.45 + Math.sin((x + z) * 0.6) * 0.3;
  if (Math.hypot(x, z) < ISLAND + wobble) land.add(key(x, z));
}
const onPath = (x: number, z: number) => STATIONS.some(s => { // tiles on the straight line from plaza to each station
  const len = Math.hypot(s.x, s.z), t = (x * s.x + z * s.z) / (len * len);
  return t > 0.05 && t < 0.93 && Math.hypot(x - s.x * t, z - s.z * t) < 0.55; }) || Math.hypot(x, z) < 1.9;

/* Deterministic scatter: trees and rocks away from stations, paths and the plaza */
const clear = (x: number, z: number, gap: number) => land.has(key(Math.round(x), Math.round(z))) && !onPath(Math.round(x), Math.round(z)) &&
  STATIONS.every(s => Math.hypot(s.x - x, s.z - z) > s.r + gap) && Math.hypot(x, z) > 2.6;
const scatter = (count: number, seed: number, rMin: number, rMax: number, gap: number, taken: number[][]) => { const out: number[][] = [];
  for (let i = 0; out.length < count && i < count * 20; i++) { const a = (i * 2.399 + seed) % (Math.PI * 2), r = rMin + ((i * 0.618 + seed) % 1) * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z, gap) && [...taken, ...out].every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 1.5)) out.push([x, z]); }
  return out; };
const TREES = scatter(22, 0.7, 3.2, 9.2, 1.5, []);
const ROCKS = scatter(9, 2.1, 3, 8.8, 1.2, TREES);

type Circle = { x: number; z: number; r: number };
const blockers: Circle[] = [...STATIONS, ...TREES.map(([x, z]) => ({ x, z, r: 0.42 })), ...ROCKS.map(([x, z]) => ({ x, z, r: 0.45 }))];
const footprint = (t: DecorId) => DECOR.find(d => d.id === t)!.r;

function mat(color: number, extra: THREE.MeshStandardMaterialParameters = {}) { return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra }); }
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number | THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "number" ? mat(color) : color);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function tree(parent: THREE.Object3D, x: number, z: number, leaf: number, leaf2: number, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
  box(g, 0.22, 0.7, 0.22, COL.woodDark, 0, 0.35, 0);
  const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), mat(leaf)); a.position.y = 1.05; a.castShadow = true; g.add(a);
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(leaf2)); b.position.set(0.18, 1.5, -0.08); b.castShadow = true; g.add(b);
  return g;
}
function skyTexture() {
  const c = document.createElement("canvas"); c.width = 2; c.height = 256; const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#3d3f9a"); g.addColorStop(0.55, "#d98bb0"); g.addColorStop(1, "#ffcf9e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWorld(canvas: HTMLCanvasElement, mobile: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = skyTexture(); scene.fog = new THREE.Fog(0xe7a6b4, 26, 58);
  const camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 100);
  const OFFSET = new THREE.Vector3(13, 13.5, 13), target = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  scene.add(new THREE.HemisphereLight(0xffe2c7, 0x4b3a7a, 1.15));
  const SUN = new THREE.Vector3(7, 13, 3), sun = new THREE.DirectionalLight(0xffd1a0, 2.4); sun.position.copy(SUN); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
  sun.shadow.bias = -0.0006; scene.add(sun, sun.target);

  /* Island: instanced grass tiles over tapering dirt layers */
  const tiles = [...land].map(k => k.split(",").map(Number) as [number, number]);
  const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 1), mat(0xffffff), tiles.length);
  const tmp = new THREE.Object3D(), color = new THREE.Color();
  tiles.forEach(([x, z], i) => { tmp.position.set(x, -0.175, z); tmp.updateMatrix(); top.setMatrixAt(i, tmp.matrix);
    color.setHex(onPath(x, z) ? COL.sand : (x * 7 + z * 3) % 3 === 0 ? COL.grass2 : COL.grass); top.setColorAt(i, color); });
  top.receiveShadow = true; scene.add(top);
  [[0.8, -0.75, 99, COL.dirt], [0.8, -1.55, 7.6, COL.dirt2], [0.8, -2.35, 5.4, COL.dirt3], [0.9, -3.2, 3.2, COL.dirt3], [0.9, -4.1, 1.6, COL.dirt3]].forEach(([h, y, r, c]) => {
    const ring = tiles.filter(([x, z]) => Math.hypot(x, z) < r);
    const layer = new THREE.InstancedMesh(new THREE.BoxGeometry(1, h, 1), mat(c), ring.length);
    ring.forEach(([x, z], i) => { tmp.position.set(x, y, z); tmp.scale.set(0.98, 1, 0.98); tmp.updateMatrix(); layer.setMatrixAt(i, tmp.matrix); });
    tmp.scale.set(1, 1, 1); layer.castShadow = true; scene.add(layer);
  });
  TREES.forEach(([x, z], i) => tree(scene, x, z, COL.leaf, COL.leaf2, 0.9 + (i % 3) * 0.12));
  ROCKS.forEach(([x, z]) => { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), mat(COL.stone)); r.position.set(x, 0.22, z); r.scale.y = 0.7; r.castShadow = r.receiveShadow = true; scene.add(r); });

  /* Clouds drifting below the island */
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 14; i++) { const g = new THREE.Group(); const m = mat(0xfff4f0, { roughness: 1 });
    for (let j = 0; j < 3; j++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + j * 0.25, 0), m); s.position.set(j * 1.1 - 1, 0, (j % 2) * 0.4); s.scale.y = 0.55; g.add(s); }
    g.position.set(-24 + i * 3.6, -5 - (i % 3) * 1.8, -16 + ((i * 7) % 32)); clouds.push(g); scene.add(g); }

  /* Stations */
  const station = (id: StationId) => STATIONS.find(s => s.id === id)!;
  const lanternMat = mat(0xffe08a, { emissive: 0xffb347, emissiveIntensity: 1.6 });
  { const s = station("merchant"), g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = Math.PI / 2; scene.add(g);
    box(g, 1.7, 0.7, 0.8, COL.wood, 0, 0.35, 0); box(g, 1.8, 0.08, 0.9, COL.woodDark, 0, 0.74, 0);
    [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]].forEach(([x, z]) => box(g, 0.08, 1.7, 0.08, COL.woodDark, x, 0.85, z));
    for (let i = 0; i < 6; i++) { const a = box(g, 0.3, 0.08, 1.1, i % 2 ? 0xfff1dc : 0xef4d86, -0.75 + i * 0.3, 1.75, 0.05); a.rotation.x = -0.25; }
    const k = new THREE.Group(); k.position.set(0, 2.25, 0); g.add(k); box(k, 0.5, 0.14, 0.08, COL.gold, 0, 0, 0); box(k, 0.2, 0.2, 0.09, COL.gold, -0.3, 0, 0); box(k, 0.08, 0.14, 0.08, COL.gold, 0.18, -0.12, 0);
    [-0.4, 0, 0.4].forEach(x => box(g, 0.2, 0.2, 0.2, COL.goldDark, x, 0.88, 0)); }
  { const s = station("workbench"), g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = 0.5; scene.add(g);
    box(g, 1.3, 0.12, 0.7, COL.wood, 0, 0.7, 0); [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]].forEach(([x, z]) => box(g, 0.1, 0.7, 0.1, COL.woodDark, x, 0.35, z));
    box(g, 0.35, 0.25, 0.25, COL.stoneDark, -0.3, 0.88, 0); box(g, 0.5, 0.06, 0.06, COL.woodDark, 0.25, 0.8, 0.1); box(g, 0.12, 0.12, 0.2, COL.stone, 0.48, 0.8, 0.1);
    box(g, 0.08, 1.4, 0.08, COL.woodDark, 0.9, 0.7, -0.4); box(g, 0.6, 0.35, 0.06, COL.wood, 0.9, 1.3, -0.36); }
  const echoCrystals: THREE.Mesh[] = [];
  { const s = station("echo"), g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
    box(g, 1.9, 0.12, 1.9, COL.stone, 0, 0.06, 0);
    [0xef4d86, 0x46a8ff, 0x5ad66f, 0xffc93a].forEach((c, i) => { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat(c, { emissive: c, emissiveIntensity: 0.9, roughness: 0.3 }));
      cr.scale.y = 1.8; cr.position.set(i % 2 ? 0.6 : -0.6, 0.65, i < 2 ? -0.6 : 0.6); cr.castShadow = true; g.add(cr); echoCrystals.push(cr); });
    const glow = new THREE.PointLight(0x9ab8ff, 3, 4); glow.position.set(0, 1, 0); g.add(glow); }
  let rainStar: THREE.Mesh;
  { const s = station("rain"), g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 8), mat(COL.stoneDark)); p.position.y = 0.12; p.receiveShadow = p.castShadow = true; g.add(p);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 8), mat(COL.gold, { emissive: COL.goldDark, emissiveIntensity: 0.5 })); d.position.y = 0.26; g.add(d);
    rainStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat(COL.gold, { emissive: 0xffb000, emissiveIntensity: 1.2 })); rainStar.position.y = 1.5; rainStar.castShadow = true; g.add(rainStar); }
  const lid = new THREE.Group(); let vaultRing: THREE.Mesh; const vaultLight = new THREE.PointLight(0xffd36b, 0, 5);
  { const s = station("vault"), g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = Math.PI / 4; scene.add(g);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.4, 8), mat(COL.stone)); a.position.y = 0.2; a.castShadow = a.receiveShadow = true; g.add(a);
    vaultRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 32), mat(COL.gold, { emissive: 0xffb000, emissiveIntensity: 0.6 })); vaultRing.rotation.x = Math.PI / 2; vaultRing.position.y = 0.03; g.add(vaultRing);
    box(g, 1.0, 0.5, 0.65, COL.woodDark, 0, 0.65, 0); box(g, 1.04, 0.1, 0.69, COL.gold, 0, 0.5, 0); box(g, 0.14, 0.2, 0.08, COL.gold, 0, 0.72, 0.34);
    lid.position.set(0, 0.9, -0.325); g.add(lid); box(lid, 1.02, 0.28, 0.67, COL.woodDark, 0, 0.14, 0.325); box(lid, 1.06, 0.06, 0.7, COL.gold, 0, 0.3, 0.325);
    vaultLight.position.set(0, 1.4, 0); g.add(vaultLight); }

  /* One-off upgrades */
  const upgrades: Record<UpgradeId, THREE.Group> = { islet: new THREE.Group(), trail: new THREE.Group() };
  Object.values(upgrades).forEach(g => { g.visible = false; scene.add(g); });

  /* Placeable decorations */
  const waters: THREE.Mesh[] = [];
  const makeDecor = (t: DecorId, ghost?: THREE.Material): THREE.Group => {
    const g = new THREE.Group(), m = (c: number, extra: THREE.MeshStandardMaterialParameters = {}) => ghost ?? mat(c, extra);
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); o.castShadow = !ghost; o.receiveShadow = !ghost; g.add(o); return o; };
    if (t === "flowers") [[0, 0, 0xef4d86], [0.18, 0.12, 0xffffff], [-0.16, 0.14, 0xffc93a], [0.08, -0.18, 0xb07cff], [-0.12, -0.12, 0xef4d86]].forEach(([x, z, c]) => {
      add(new THREE.BoxGeometry(0.04, 0.2, 0.04), m(0x3f9a5a), x, 0.1, z); add(new THREE.BoxGeometry(0.12, 0.08, 0.12), m(c), x, 0.22, z); });
    if (t === "bush") { add(new THREE.IcosahedronGeometry(0.38, 0), m(COL.leaf), 0, 0.3, 0); add(new THREE.IcosahedronGeometry(0.24, 0), m(COL.leaf2), 0.22, 0.26, 0.1); }
    if (t === "lantern") { add(new THREE.BoxGeometry(0.08, 0.95, 0.08), m(COL.woodDark), 0, 0.47, 0); add(new THREE.BoxGeometry(0.3, 0.04, 0.08), m(COL.woodDark), 0.1, 0.93, 0);
      add(new THREE.BoxGeometry(0.2, 0.24, 0.2), ghost ?? mat(0xffe08a, { emissive: 0xffb347, emissiveIntensity: 1.8 }), 0.22, 0.8, 0); }
    if (t === "bench") { add(new THREE.BoxGeometry(0.9, 0.08, 0.32), m(COL.wood), 0, 0.36, 0); add(new THREE.BoxGeometry(0.9, 0.28, 0.06), m(COL.wood), 0, 0.56, -0.14);
      [-0.36, 0.36].forEach(x => add(new THREE.BoxGeometry(0.08, 0.34, 0.28), m(COL.woodDark), x, 0.17, 0)); }
    if (t === "cherry") { add(new THREE.BoxGeometry(0.22, 0.7, 0.22), m(COL.woodDark), 0, 0.35, 0); add(new THREE.IcosahedronGeometry(0.62, 0), m(0xf7a8c8), 0, 1.05, 0);
      add(new THREE.IcosahedronGeometry(0.42, 0), m(0xffc9dd), 0.18, 1.5, -0.08); }
    if (t === "crystal") { const c = add(new THREE.OctahedronGeometry(0.26, 0), ghost ?? mat(0x46d6cf, { emissive: 0x46d6cf, emissiveIntensity: 1.2, roughness: 0.3 }), 0, 0.5, 0); c.scale.y = 1.9;
      const c2 = add(new THREE.OctahedronGeometry(0.14, 0), ghost ?? mat(0xb07cff, { emissive: 0xb07cff, emissiveIntensity: 1.2 }), 0.22, 0.25, 0.1); c2.scale.y = 1.6; }
    if (t === "fountain") { add(new THREE.CylinderGeometry(0.8, 0.85, 0.35, 12), m(COL.stone), 0, 0.17, 0);
      const wtr = add(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16), ghost ?? mat(0x5fc9ff, { emissive: 0x1f6fb0, emissiveIntensity: 0.4, roughness: 0.1 }), 0, 0.33, 0); if (!ghost) waters.push(wtr);
      add(new THREE.BoxGeometry(0.18, 0.8, 0.18), m(COL.stone), 0, 0.6, 0); add(new THREE.IcosahedronGeometry(0.16, 0), ghost ?? mat(0x9fe3ff, { emissive: 0x5fc9ff, emissiveIntensity: 0.8 }), 0, 1.1, 0); }
    return g; };
  const decorRoot = new THREE.Group(); scene.add(decorRoot); let decorBlockers: Circle[] = []; let decorList: readonly Placed[] = [];
  const ghostOk = new THREE.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, opacity: 0.55, depthWrite: false });
  const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.55, depthWrite: false });
  let ghost: THREE.Group | null = null, ghostType: DecorId | null = null;
  let build: { type: DecorId | null; rot: number; pickup: boolean } | null = null;
  const pickRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffc93a, transparent: true, depthWrite: false }));
  pickRing.rotation.x = -Math.PI / 2; pickRing.position.y = 0.03; pickRing.visible = false; scene.add(pickRing);
  { const g = upgrades.islet; g.position.set(-11, 0.6, -10);
    [[0, 0, 1.4], [0, -0.7, 1], [0, -1.3, 0.6]].forEach(([y0, y, r]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.6, 7), mat(y === 0 ? COL.grass : COL.dirt2)); m.position.y = y + y0; m.castShadow = true; g.add(m); });
    tree(g, 0.3, 0, COL.leaf, COL.leaf2, 0.8); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), mat(0x46d6cf, { emissive: 0x46d6cf, emissiveIntensity: 1 })); c.position.set(-0.6, 0.6, 0.3); c.scale.y = 1.8; g.add(c); }
  const trail: { m: THREE.Mesh; life: number }[] = []; const trailMat = mat(COL.gold, { emissive: 0xffb000, emissiveIntensity: 1.4, transparent: true });

  /* Floating station labels: always visible, redrawn only when their text changes */
  const labels = new Map<StationId, { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; text: string; active: boolean }>();
  for (const s of STATIONS) { const c = document.createElement("canvas"); c.width = 512; c.height = 112; const ctx = c.getContext("2d")!;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true }));
    sprite.scale.set(2.9, 0.64, 1); sprite.position.set(s.x, s.id === "merchant" ? 3.3 : 2.7, s.z); sprite.renderOrder = 10; scene.add(sprite);
    labels.set(s.id, { sprite, ctx, tex: t, text: "", active: false }); }
  const drawLabel = (l: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; text: string; active: boolean }) => {
    const { ctx } = l, [name, status] = l.text.split("|"); ctx.clearRect(0, 0, 512, 112);
    ctx.font = "bold 40px 'Trebuchet MS', system-ui, sans-serif"; const nameW = ctx.measureText(name).width;
    ctx.font = "bold 30px 'Trebuchet MS', system-ui, sans-serif"; const statusW = status ? ctx.measureText(status).width + 22 : 0;
    const w = Math.min(500, nameW + statusW + 52), x0 = (512 - w) / 2;
    ctx.fillStyle = l.active ? "#ffc93a" : "rgba(42,31,74,0.86)"; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, 22, w, 68, 34); else ctx.rect(x0, 22, w, 68); ctx.fill();
    ctx.beginPath(); ctx.moveTo(244, 88); ctx.lineTo(268, 88); ctx.lineTo(256, 104); ctx.fill();
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = "bold 40px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = l.active ? "#2a1f4a" : "#fff8ef"; ctx.fillText(name, x0 + 26, 57);
    if (status) { ctx.font = "bold 30px 'Trebuchet MS', system-ui, sans-serif"; ctx.fillStyle = l.active ? "#2a1f4a" : "#9fe3ff"; ctx.fillText(status, x0 + 26 + nameW + 22, 58); }
    l.tex.needsUpdate = true; };

  /* Ground cursor: follows the mouse, then marks the chosen destination */
  const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff8ef, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), ringMat); ring.rotation.x = -Math.PI / 2; marker.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), ringMat); dot.rotation.x = -Math.PI / 2; marker.add(dot);
  marker.position.y = 0.025; marker.renderOrder = 5;
  let hover: { x: number; z: number; station: StationId | null; ok: boolean } | null = null; let finalDest: { x: number; z: number } | null = null;

  /* The Friend: canonical pixels on an upright billboard, with a silhouette shadow */
  const pix = document.createElement("canvas"); pix.width = 18; pix.height = 18;
  const tex = new THREE.CanvasTexture(pix); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.PlaneGeometry(1.3, 1.3); plane.translate(0, 0.65, 0);
  const friend = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
  friend.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  friend.castShadow = true; friend.rotation.y = Math.PI / 4; friend.scale.y = 1.25; scene.add(friend);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: 0x2a1a3a, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; scene.add(blob);

  const nameCanvas = document.createElement("canvas"); nameCanvas.width = 512; nameCanvas.height = 96;
  const nameTex = new THREE.CanvasTexture(nameCanvas); nameTex.colorSpace = THREE.SRGBColorSpace; nameTex.anisotropy = 4;
  const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, depthTest: false, depthWrite: false, transparent: true }));
  nameTag.visible = false; nameTag.renderOrder = 11; scene.add(nameTag);
  let friendName = "";
  const pos = { ...SPAWN }; let dest: { x: number; z: number } | null = null; let facing: Facing = "down"; let bought = new Set<UpgradeId>();
  let chestOpen = false, lidAngle = 0, trailClock = 0; let route: { x: number; z: number }[] = [];
  /* A* over a 0.5-unit grid, then string-pulled into a few straight legs */
  const CELL = 0.5, N = 48, idx = (i: number, j: number) => (i + N) * (2 * N + 1) + (j + N);
  const clearLine = (a: { x: number; z: number }, b: { x: number; z: number }) => { const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.1);
    for (let k = 1; k <= n; k++) if (!walkable(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n)) return false; return true; };
  const findRoute = (target: { x: number; z: number }, from0: { x: number; z: number } = pos, strict = false): { x: number; z: number }[] | null => {
    let goal = { ...target };
    if (!walkable(goal.x, goal.z)) { // clicked a tree, rock or the edge: aim for the closest free spot
      let best = Infinity, snap: { x: number; z: number } | null = null; const ci = Math.round(goal.x / CELL), cj = Math.round(goal.z / CELL);
      for (let di = -4; di <= 4; di++) for (let dj = -4; dj <= 4; dj++) { const x = (ci + di) * CELL, z = (cj + dj) * CELL, d = Math.hypot(x - goal.x, z - goal.z);
        if (d < best && walkable(x, z)) { best = d; snap = { x, z }; } }
      if (!snap) return strict ? null : [target]; goal = snap; }
    if (clearLine(from0, goal)) return [goal];
    const gi = Math.round(goal.x / CELL), gj = Math.round(goal.z / CELL);
    const si = Math.round(from0.x / CELL), sj = Math.round(from0.z / CELL), open: [number, number, number][] = [[si, sj, 0]];
    const cost = new Map<number, number>([[idx(si, sj), 0]]), from = new Map<number, number>(), h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
    for (let guard = 0; open.length && guard < 6000; guard++) {
      let b = 0; for (let k = 1; k < open.length; k++) if (open[k][2] < open[b][2]) b = k; const [ci, cj] = open.splice(b, 1)[0];
      if (ci === gi && cj === gj) { const cells: { x: number; z: number }[] = []; let c = idx(ci, cj);
        while (from.has(c)) { const i = Math.floor(c / (2 * N + 1)) - N, j = (c % (2 * N + 1)) - N; cells.unshift({ x: i * CELL, z: j * CELL }); c = from.get(c)!; }
        cells[cells.length - 1] = goal; const out: { x: number; z: number }[] = []; let anchor = { ...from0 };
        for (let k = 0; k < cells.length; k++) { if (k === cells.length - 1 || !clearLine(anchor, cells[k + 1])) { out.push(cells[k]); anchor = cells[k]; } }
        return out; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { if (!di && !dj) continue; const ni = ci + di, nj = cj + dj;
        if (Math.abs(ni) > N || Math.abs(nj) > N || !walkable(ni * CELL, nj * CELL)) continue;
        if (di && dj && (!walkable((ci + di) * CELL, cj * CELL) || !walkable(ci * CELL, (cj + dj) * CELL))) continue;
        const g = cost.get(idx(ci, cj))! + (di && dj ? Math.SQRT2 : 1), k = idx(ni, nj);
        if (g < (cost.get(k) ?? Infinity)) { cost.set(k, g); from.set(k, idx(ci, cj)); open.push([ni, nj, g + h(ni, nj)]); } } }
    return strict ? null : [goal]; };
  /* Placement rules, cheapest checks first; reachability only on an actual placement */
  const approach = (s: typeof STATIONS[number]) => { const len = Math.hypot(s.x, s.z) || 1; return { x: s.x - s.x / len * (s.r + 0.5), z: s.z - s.z / len * (s.r + 0.5) }; };
  const placeProblem = (t: DecorId, x: number, z: number, deep: boolean, ignore = -1): string => {
    const r = footprint(t);
    if (![[r, 0], [-r, 0], [0, r], [0, -r], [0, 0]].every(([dx, dz]) => land.has(key(Math.round(x + dx), Math.round(z + dz))))) return "Too close to the edge";
    if ([[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]].some(([dx, dz]) => onPath(Math.round(x + dx), Math.round(z + dz)))) return "Paths must stay clear";
    const st = STATIONS.find(s => Math.hypot(s.x - x, s.z - z) < s.r + r + 0.7); if (st) return "Too close to a station";
    if (blockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + r + 0.05) || decorList.some((d, i) => i !== ignore && Math.hypot(d.x - x, d.z - z) < footprint(d.t) + r + 0.05)) return "Something is already there";
    if (Math.hypot(pos.x - x, pos.z - z) < r + RADIUS + 0.15) return "Your Friend is standing there";
    if (deep) { const saved = decorBlockers; decorBlockers = [...decorBlockers.filter((_, i) => i !== ignore), { x, z, r }];
      const cut = STATIONS.find(s => !findRoute(approach(s), pos, true)); decorBlockers = saved; if (cut) return "That would block the way to a station"; }
    return ""; };
  const snap = (v: number) => Math.round(v * 4) / 4;
  const walkable = (x: number, z: number) => [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]].every(([dx, dz]) => land.has(key(Math.round(x + dx), Math.round(z + dz)))) &&
    !blockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + RADIUS) && !decorBlockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + RADIUS);
  const nearest = (): StationId | null => { let best: StationId | null = null, bestD = REACH;
    for (const s of STATIONS) { const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < bestD) { bestD = d; best = s.id; } } return best; };
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const resolve = (clientX: number, clientY: number, rect: DOMRect) => {
    ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    const label = ray.intersectObjects([...labels.values()].map(l => l.sprite))[0];
    if (label) { const id = [...labels.entries()].find(([, l]) => l.sprite === label.object)![0], st = STATIONS.find(x => x.id === id)!; return { x: st.x, z: st.z, station: id, ok: true }; }
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    const s = STATIONS.find(st => Math.hypot(st.x - hit.x, st.z - hit.z) < st.r + 0.4);
    return { x: hit.x, z: hit.z, station: s ? s.id : null, ok: Boolean(s) || walkable(hit.x, hit.z) }; };

  return {
    resize(w: number, h: number) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    /** Low graphics: no sun shadows and a lower render resolution, for older phones. */
    setLowGraphics(low: boolean) { sun.castShadow = !low; renderer.setPixelRatio(low ? 0.6 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      const c = renderer.domElement; renderer.setSize(c.clientWidth || 960, c.clientHeight || 640, false); },
    setUpgrades(list: readonly UpgradeId[]) { bought = new Set(list); upgrades.islet.visible = bought.has("islet"); },
    setDecor(list: readonly Placed[]) {
      decorList = list; decorBlockers = list.map(d => ({ x: d.x, z: d.z, r: footprint(d.t) })); waters.length = 0;
      decorRoot.children.slice().forEach(c => { decorRoot.remove(c); c.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); });
      list.forEach(d => { const g = makeDecor(d.t); g.position.set(d.x, 0, d.z); g.rotation.y = d.rot * Math.PI / 2; decorRoot.add(g); }); },
    /** Decorate mode: type to place (null = nothing selected), rotation in quarter turns, or pick-up mode. */
    setBuild(next: { type: DecorId | null; rot: number; pickup: boolean } | null) {
      build = next; if (ghost && (!next || next.pickup || next.type !== ghostType)) { scene.remove(ghost); ghost.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); ghost = null; ghostType = null; }
      if (next && !next.pickup && next.type && !ghost) { ghost = makeDecor(next.type, ghostOk); ghostType = next.type; ghost.visible = false; scene.add(ghost); } },
    /** Where the ghost would go and whether it can (quick checks). */
    buildPreview() { if (!build || !hover) return null; const x = snap(hover.x), z = snap(hover.z);
      if (build.pickup) { const i = decorList.findIndex(d => Math.hypot(d.x - hover!.x, d.z - hover!.z) < footprint(d.t) + 0.25); return { x, z, pick: i, problem: i < 0 ? "Point at a decoration to move it" : "" }; }
      return build.type ? { x, z, pick: -1, problem: placeProblem(build.type, x, z, false) } : null; },
    /** Full check including station reachability. Returns "" when the spot is valid. */
    validate(t: DecorId, x: number, z: number) { return placeProblem(t, x, z, true); },
    setFriendPixels(rows: readonly string[]) {
      const ctx = pix.getContext("2d")!; ctx.clearRect(0, 0, 18, 18); ctx.fillStyle = "#fff";
      rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === "#") ctx.fillRect(x, y, 3, 3); }));
      ctx.fillStyle = "#000"; rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === "#") ctx.fillRect(x + 1, y + 1, 1, 1); })); tex.needsUpdate = true;
    },
    /** Mouse hover (null when the pointer leaves). */
    hover(clientX: number | null, clientY = 0, rect?: DOMRect) { hover = clientX === null || !rect ? null : resolve(clientX, clientY, rect); },
    pointTo(clientX: number, clientY: number, rect: DOMRect) {
      const r = resolve(clientX, clientY, rect); if (!r) return;
      let goal = { x: r.x, z: r.z };
      if (r.station) { const s = STATIONS.find(st => st.id === r.station)!; const dx = pos.x - s.x, dz = pos.z - s.z, len = Math.hypot(dx, dz) || 1;
        goal = { x: s.x + dx / len * (s.r + 0.45), z: s.z + dz / len * (s.r + 0.45) }; }
      route = findRoute(goal) ?? [goal]; finalDest = route[route.length - 1] ?? goal; dest = route.shift() ?? goal;
    },
    /** Screen position (CSS px within the canvas) of each station label; used by automated tests. */
    screenPoints(width: number, height: number) { return Object.fromEntries([...labels.entries()].map(([id, l]) => { const v = l.sprite.position.clone().project(camera);
      return [id, [Math.round((v.x + 1) / 2 * width), Math.round((1 - v.y) / 2 * height)]]; })); },
    /** Local nickname shown above the Friend. Empty hides the tag. */
    setFriendName(name: string) {
      friendName = name.trim(); nameTag.visible = friendName.length > 0; if (!friendName) return;
      const ctx = nameCanvas.getContext("2d")!; ctx.clearRect(0, 0, 512, 96);
      ctx.font = "bold 54px 'Trebuchet MS', system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 10; ctx.strokeStyle = "#2a1f4a"; ctx.strokeText(friendName, 256, 52);
      ctx.fillStyle = "#fff8ef"; ctx.fillText(friendName, 256, 52); nameTex.needsUpdate = true;
    },
    setLabel(id: StationId, text: string, active: boolean) { const l = labels.get(id); if (!l || (l.text === text && l.active === active)) return; l.text = text; l.active = active; drawLabel(l); },
    stop() { dest = null; route = []; finalDest = null; hover = null; },
    /** Touch users set the ghost by tapping; mouse users by hovering. */
    aim(clientX: number, clientY: number, rect: DOMRect) { hover = resolve(clientX, clientY, rect); },
    setChest(open: boolean) { chestOpen = open; },
    /** Keyboard axes are screen-relative: kx right, ky up. */
    step(dt: number, now: number, kx: number, ky: number, active: boolean, still: boolean): StepResult {
      let dx = 0, dz = 0, moving = false;
      if (active) {
        if (kx || ky) { dest = null; route = []; finalDest = null; dx = (kx - ky) / Math.SQRT2; dz = (-kx - ky) / Math.SQRT2; }
        else if (dest) { dx = dest.x - pos.x; dz = dest.z - pos.z; if (Math.hypot(dx, dz) < 0.06) { dest = route.shift() ?? null; dx = dz = 0; if (!dest) finalDest = null; } }
        const len = Math.hypot(dx, dz);
        if (len > 0) {
          const travel = Math.min(SPEED * dt, dest && !(kx || ky) ? len : Infinity), steps = Math.max(1, Math.ceil(travel / 0.05)), before = { ...pos };
          for (let i = 0; i < steps; i++) { const nx = pos.x + dx / len * travel / steps, nz = pos.z + dz / len * travel / steps;
            if (walkable(nx, nz)) { pos.x = nx; pos.z = nz; } else if (walkable(nx, pos.z)) pos.x = nx; else if (walkable(pos.x, nz)) pos.z = nz; }
          moving = Math.hypot(pos.x - before.x, pos.z - before.z) > 0.0005;
          if (!moving) { dest = null; route = []; finalDest = null; }
          const sx = (dx - dz) / Math.SQRT2, sy = (-dx - dz) / Math.SQRT2; // screen right / screen up
          facing = Math.abs(sx) >= Math.abs(sy) ? (sx > 0 ? "right" : "left") : (sy > 0 ? "up" : "down");
        }
      } else { dest = null; route = []; finalDest = null; }
      const bob = moving && !still ? Math.abs(Math.sin(now / 90)) * 0.06 : 0;
      friend.position.set(pos.x, bob, pos.z); blob.position.set(pos.x, 0.012, pos.z);
      /* Ambient animation */
      const t = now / 1000;
      if (!still) { clouds.forEach((c, i) => { c.position.x += dt * (0.25 + (i % 3) * 0.1); if (c.position.x > 26) c.position.x = -26; });
        echoCrystals.forEach((c, i) => { c.position.y = 0.65 + Math.sin(t * 2 + i) * 0.06; c.rotation.y = t * 0.8 + i; });
        rainStar.rotation.y = t * 1.5; rainStar.position.y = 1.5 + Math.sin(t * 2) * 0.1; waters.forEach(m => m.scale.setScalar(1 + Math.sin(t * 3) * 0.02)); upgrades.islet.position.y = 0.6 + Math.sin(t * 0.8) * 0.15; }
      lidAngle += ((chestOpen ? -1.9 : 0) - lidAngle) * Math.min(1, dt * (still ? 30 : 5)); lid.rotation.x = lidAngle;
      vaultLight.intensity = chestOpen ? 6 : 0; (vaultRing.material as THREE.MeshStandardMaterial).emissiveIntensity = chestOpen ? 2.2 : 0.6 + (still ? 0 : Math.sin(t * 2) * 0.25);
      if (bought.has("trail")) { trailClock += dt; if (moving && trailClock > 0.07 && !still) { trailClock = 0;
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), trailMat); m.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.3); scene.add(m); trail.push({ m, life: 0.8 }); } }
      for (let i = trail.length - 1; i >= 0; i--) { const p = trail[i]; p.life -= dt; p.m.scale.setScalar(Math.max(0.01, p.life)); p.m.position.y += dt * 0.3; if (p.life <= 0) { scene.remove(p.m); p.m.geometry.dispose(); trail.splice(i, 1); } }
      /* Ground cursor: destination wins over hover; stations get a wide gold ring; blocked spots turn red */
      const show = finalDest ? { x: finalDest.x, z: finalDest.z, station: null as StationId | null, ok: true, set: true } : hover && active ? { ...hover, set: false } : null;
      marker.visible = Boolean(show) && !build;
      const pv = build ? (hover ? { x: snap(hover.x), z: snap(hover.z) } : null) : null;
      if (ghost) { ghost.visible = Boolean(pv); if (pv && build?.type) { ghost.position.set(pv.x, 0.02, pv.z); ghost.rotation.y = build.rot * Math.PI / 2;
        const bad = Boolean(placeProblem(build.type, pv.x, pv.z, false)); ghost.traverse(o => { if (o instanceof THREE.Mesh) o.material = bad ? ghostBad : ghostOk; }); } }
      const pi = build?.pickup && hover ? decorList.findIndex(d => Math.hypot(d.x - hover!.x, d.z - hover!.z) < footprint(d.t) + 0.25) : -1;
      pickRing.visible = pi >= 0; if (pi >= 0) { const d = decorList[pi]; pickRing.position.set(d.x, 0.03, d.z); pickRing.scale.setScalar((footprint(d.t) + 0.2) / 0.56); }
      if (show) { const st = show.station ? STATIONS.find(s => s.id === show.station)! : null;
        marker.position.set(st ? st.x : show.x, 0.025, st ? st.z : show.z); marker.scale.setScalar(st ? (st.r + 0.45) / 0.36 : show.set && !still ? 1 + Math.sin(t * 8) * 0.12 : 1);
        ringMat.color.setHex(!show.ok ? 0xff5a7a : st || show.set ? 0xffc93a : 0xfff8ef); dot.visible = !st; }
      /* Camera follows with a gentle ease */
      const goal = new THREE.Vector3(pos.x, 0, pos.z); target.lerp(goal, still ? 1 : Math.min(1, dt * 4));
      camera.position.copy(target).add(OFFSET); camera.lookAt(target.x, target.y + 0.4, target.z);
      if (nameTag.visible) { nameTag.position.set(pos.x, 1.55 + bob, pos.z);
        const dn = camera.position.distanceTo(nameTag.position); nameTag.scale.set(dn * 0.14, dn * 0.0263, 1); }
      labels.forEach(l => { const d = camera.position.distanceTo(l.sprite.position); l.sprite.scale.set(d * 0.135, d * 0.0298, 1); }); // same on-screen size near or far
      sun.position.copy(target).add(SUN); sun.target.position.copy(target); sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
      return { moving, facing, near: nearest(), x: pos.x, z: pos.z };
    },
    reset() { Object.assign(pos, SPAWN); dest = null; chestOpen = false; lidAngle = 0; },
    dispose() { renderer.dispose(); scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } }); tex.dispose(); },
  };
}
export type World = ReturnType<typeof createWorld>;
