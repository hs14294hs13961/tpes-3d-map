// 依 campus.json 畫出整個校園。
// 規則：每個資料項目都是一個 Group，Group 的位置＝資料的 x/z、旋轉＝rot（度），
// 子物件一律用「以項目中心為原點」的局部座標，這樣編輯模式拖動 Group 就等於改資料。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { makeGroundPlane, makeReferencePlane, makeRoad, makeTrack, makeCourt } from './ground.js';
import { wingLayout, stairLayout, gateParts, rcx, rcz, rw, rd } from './layout.js';

export const ROOM_COLORS = {
  class: 0xf8fafc,
  admin: 0xfdba74,
  special: 0xfde047,
  support: 0xa3e635,
  other: 0x93c5fd,
  wc: 0xc4b5fd,
};

export const SAFETY_ICONS = {
  assembly: '🚩',
  cmd: '⛺',
  med: '➕',
  shelter: '🏃',
  aed: '❤️',
  comm: '📻',
  food: '🌾',
  tool: '🛠️',
  pickup: '👨‍👧',
  hydrant: '🚒',
  extinguisher: '🧯',
};

const SAFETY_COLORS = {
  assembly: 0x16a34a, cmd: 0xeab308, med: 0xdc2626, shelter: 0x16a34a, aed: 0xe11d48,
  comm: 0xeab308, food: 0xf97316, tool: 0xeab308, pickup: 0xf97316, hydrant: 0xdc2626, extinguisher: 0xdc2626,
};
// 只顯示圖示、不顯示文字的防災點（數量多，避免畫面太擠）
const ICON_ONLY = new Set(['hydrant', 'extinguisher']);

const matCache = new Map();

// 實景照片貼圖（public/textures/），同一張只載入一次
let photoLoader = null;
function photoMat(name) {
  const key = `photo:${name}`;
  if (!matCache.has(key)) {
    const tex = photoLoader.load(`./public/textures/${name}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    matCache.set(key, new THREE.MeshLambertMaterial({ map: tex }));
  }
  return matCache.get(key);
}
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function flat(w, d, material, y = 0.02) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

export function buildCampus(data, { loader, onLabelClick }) {
  photoLoader = loader;
  const root = new THREE.Group();
  root.name = 'campus';
  const registry = []; // { obj, vis: { type, floor } }
  const groups = new Map(); // "collection:id" → Group
  const s = data.settings;

  const reg = (obj, type, floor = 1) => registry.push({ obj, vis: { type, floor } });

  function itemGroup(collection, item, id = item.id) {
    const g = new THREE.Group();
    g.position.set(item.x, 0, item.z);
    g.rotation.y = THREE.MathUtils.degToRad(-(item.rot || 0));
    g.userData.ref = { collection, id };
    groups.set(`${collection}:${id}`, g);
    root.add(g);
    return g;
  }

  // pri：標籤重疊時，數字大的優先顯示
  function label(parent, text, cls, y, ref, pri = 60) {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.textContent = text;
    el.dataset.key = `${ref.collection}:${ref.id}`;
    el.dataset.pri = pri;
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      onLabelClick?.(ref);
    });
    const obj = new CSS2DObject(el);
    obj.position.set(0, y, 0);
    obj.center.set(0.5, 1);
    parent.add(obj);
    return obj;
  }

  // ---------- 地面 ----------
  root.add(makeGroundPlane());
  for (const road of data.roads || []) root.add(makeRoad(road));

  // 圍牆：折線，每段一道牆
  const wallMatOuter = mat(0xe7e5df);
  for (const wall of data.walls || []) {
    const h = wall.height ?? 1.6;
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [x0, z0] = wall.points[i];
      const [x1, z1] = wall.points[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const seg = box(len, h, 0.25, wallMatOuter, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      root.add(seg);
    }
  }

  if (data.reference) {
    const g = itemGroup('reference', data.reference, 'aerial');
    g.userData.noPick = true;
    g.add(makeReferencePlane(data.reference, loader));
    reg(g, 'reference');
  }

  for (const sp of data.sports || []) {
    const g = itemGroup('sports', sp);
    g.add(sp.kind === 'track' ? makeTrack(sp) : makeCourt(sp));
    reg(g, 'always');
  }

  // ---------- 教學大樓 ----------
  const fh = s.floorHeight;
  const base = s.buildingBase;
  const wallMat = mat(0xf1efe8);
  const plinthMat = mat(0x9ca3af);
  const slabMat = mat(0xc9ccc9);
  const graniteMat = mat(0x8f9399);
  const roofMat = mat(0xb8c7b0, { side: THREE.DoubleSide });
  const facade1Mat = new THREE.MeshLambertMaterial({ map: facadeTexture(true) });
  const facade2Mat = new THREE.MeshLambertMaterial({ map: facadeTexture(false) });

  for (const w of data.buildings || []) {
    const g = itemGroup('buildings', w);
    const { body, corr, columns, spans } = wingLayout(w, data.buildings);
    const cx = rcx;
    const cz = rcz;

    const plinth = box(w.w, base, w.d, plinthMat, 0, base / 2, 0);
    g.add(plinth);
    reg(plinth, 'always');

    for (let f = 1; f <= w.floors; f++) {
      const y0 = base + (f - 1) * fh;
      // 外牆貼「窗戶＋牆面」貼圖，依實際公尺數重複，窗戶大小不會被拉長
      const shell = box(rw(body), fh, rd(body), f === 1 ? facade1Mat : facade2Mat, cx(body), y0 + fh / 2, cz(body));
      metricUV(shell.geometry, rw(body), fh, rd(body), BAY_W, fh);
      g.add(shell);
      reg(shell, 'shell', f);

      if (!corr) continue;
      const parts = new THREE.Group();
      if (f > 1) {
        parts.add(box(rw(corr), 0.25, rd(corr), slabMat, cx(corr), y0 - 0.125, cz(corr)));
      }
      // 走廊外緣的柱子：下段花崗石灰、上段白色
      for (const { x: px, z: pz } of columns) {
        parts.add(box(0.55, 1.2, 0.55, graniteMat, px, y0 + 0.6, pz));
        parts.add(box(0.5, fh - 1.2, 0.5, wallMat, px, y0 + 1.2 + (fh - 1.2) / 2, pz));
      }
      if (f > 1) {
        // 二樓走廊外側矮牆（只在面向戶外的段落）
        for (const { a, b } of spans) {
          const sw = Math.max(0.2, Math.abs(b.x - a.x));
          const sd = Math.max(0.2, Math.abs(b.z - a.z));
          parts.add(box(sw, 1.0, sd, wallMat, (a.x + b.x) / 2, y0 + 0.5, (a.z + b.z) / 2));
        }
      }
      g.add(parts);
      reg(parts, 'slab', f);
    }

    // 雙斜屋頂（含走廊上方），屋脊方向依 ridge
    const eave = base + w.floors * fh;
    const roof = gableRoof(w.w + 1.0, w.d + 1.0, 2.4, w.ridge === 'z', roofMat);
    roof.position.y = eave;
    g.add(roof);
    reg(roof, 'roof');
    const solar = solarPanels(w.w + 1.0, w.d + 1.0, 2.4, w.ridge === 'z', eave);
    g.add(solar);
    reg(solar, 'roof');
    const lbl = label(g, w.name, 'bldg', eave + 3, { collection: 'buildings', id: w.id }, 50);
    reg(lbl, 'roof');
  }

  // ---------- 教室 ----------
  for (const r of data.rooms || []) {
    const g = itemGroup('rooms', r);
    const h = fh - 0.5;
    const y0 = base + (r.floor - 1) * fh;
    g.add(box(r.w - 0.3, h, r.d - 0.3, mat(ROOM_COLORS[r.category] ?? 0xe2e8f0), 0, y0 + h / 2 + 0.02, 0));
    label(g, r.name, 'room', y0 + h + 0.6, { collection: 'rooms', id: r.id }, 70);
    reg(g, 'room', r.floor);
  }

  // ---------- 折返式樓梯（形狀與碰撞共用 stairLayout） ----------
  const stepMat = mat(0xd6d3cb);
  const noseMat = mat(0xfacc15);
  const railMat = mat(0x94a3b8, { transparent: true, opacity: 0.55 });
  for (const st of data.stairs || []) {
    const g = itemGroup('stairs', st);
    const L = stairLayout(st, s);
    // (u,v) 範圍的方塊，從 y0 到 y1
    const uvBox = (u0, u1, v0, v1, y0, y1, m) => {
      const a = L.toLocal(u0, v0);
      const b = L.toLocal(u1, v1);
      return box(Math.abs(b.lx - a.lx), y1 - y0, Math.abs(b.lz - a.lz), m, (a.lx + b.lx) / 2, (y0 + y1) / 2, (a.lz + b.lz) / 2);
    };
    const half = L.W / 2;
    const dv = L.run / L.steps;
    const rise = L.fh / 2 / L.steps;
    for (let i = 0; i < L.steps; i++) {
      const m = i % 4 === 3 ? noseMat : stepMat;
      // 第一段：開口邊往內、越走越高
      g.add(uvBox(0, half - 0.05, i * dv, (i + 1) * dv, 0, L.base + (i + 1) * rise, m));
      // 第二段：從平台往開口邊、越走越高
      g.add(uvBox(half + 0.05, L.W, i * dv, (i + 1) * dv, 0, L.base + L.fh - i * rise, m));
    }
    g.add(uvBox(0, L.W, L.run, L.L, 0, L.base + L.fh / 2, stepMat)); // 中間平台
    g.add(uvBox(half - 0.05, half + 0.05, 0, L.run, 0, L.base + L.fh + 1, railMat)); // 兩段之間的欄杆
    g.add(uvBox(0, half, -0.05, 0.05, L.base + L.fh, L.base + L.fh + 1, railMat)); // 二樓開口邊的欄杆
    label(g, st.name, 'stair', L.base + L.fh + 1.6, { collection: 'stairs', id: st.id }, 75);
    reg(g, 'stair');
  }

  // ---------- 戶外設施 ----------
  for (const o of data.outdoor || []) {
    const g = itemGroup('outdoor', o);
    const h = buildOutdoor(g, o);
    if (!o.noLabel) {
      label(g, o.name, o.needsCheck ? 'check' : '', h + 1.2, { collection: 'outdoor', id: o.id });
    }
    reg(g, 'always');
  }

  // ---------- 樹 ----------
  const trunkMat = mat(0x6b4f35);
  const leafMats = [mat(0x3f7d3a), mat(0x4a8a3f), mat(0x35703a)];
  (data.trees || []).forEach((t, i) => {
    const g = itemGroup('trees', t, i);
    const trunkH = Math.max(2, t.r * 0.7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(t.r * 0.8, 0), leafMats[i % 3]);
    crown.position.y = trunkH + t.r * 0.5;
    crown.scale.y = 0.75;
    crown.castShadow = true;
    g.add(trunk, crown);
    reg(g, 'always');
  });

  // ---------- 防災點 ----------
  for (const sf of data.safety || []) {
    const g = itemGroup('safety', sf);
    const y0 = sf.floor > 1 ? base + (sf.floor - 1) * fh : 0;
    const color = SAFETY_COLORS[sf.type] ?? 0xdc2626;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), mat(0x475569));
    pole.position.y = y0 + 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat(color));
    head.position.y = y0 + 1.8;
    g.add(pole, head);
    const icon = SAFETY_ICONS[sf.type] || '⚠️';
    const text = ICON_ONLY.has(sf.type) ? icon : `${icon} ${sf.name}`;
    label(g, text, 'safety', y0 + 3, { collection: 'safety', id: sf.id }, sf.type === 'assembly' ? 90 : ICON_ONLY.has(sf.type) ? 30 : 45);
    reg(g, 'safety', sf.floor || 1);
  }

  return { root, registry, groups };
}

// ---------- 外牆貼圖：一格＝一個 4 m 寬的窗間距 ----------
const BAY_W = 4;
const textureCache = new Map();
function facadeTexture(groundFloor) {
  const key = `facade${groundFloor}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 232; // 4 m × 3.6 m
  const ctx = c.getContext('2d');
  const px = 64; // 每公尺像素
  const y = m => c.height - m * px; // 由下往上量
  ctx.fillStyle = '#f1efe8';
  ctx.fillRect(0, 0, c.width, c.height);
  if (groundFloor) {
    ctx.fillStyle = '#8f9399'; // 一樓牆腳灰色石材
    ctx.fillRect(0, y(1.0), c.width, 1.0 * px);
  }
  // 窗：鋁框＋玻璃＋中間分隔
  const wx = 0.5 * px;
  const ww = 3.0 * px;
  const top = y(2.8);
  const wh = (2.8 - 1.1) * px;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(wx - 4, top - 4, ww + 8, wh + 8);
  ctx.fillStyle = '#3b4f66';
  ctx.fillRect(wx, top, ww, wh);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(wx, top, ww, wh * 0.35);
  ctx.fillStyle = '#cbd5e1';
  for (let i = 1; i < 4; i++) ctx.fillRect(wx + (ww * i) / 4 - 2, top, 4, wh);
  ctx.fillRect(wx, top + wh * 0.62, ww, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

// 把方塊每一面的 UV 換成「公尺 ÷ 貼圖尺寸」，貼圖就會照實際大小重複
function metricUV(geo, w, h, d, tw, th) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fw) / tw, (uv.getY(k) * fh) / th);
    }
  }
  uv.needsUpdate = true;
}

// 屋頂兩側斜面的太陽能板（覆蓋屋脊方向中間七成）
function solarPanels(w, d, rise, ridgeAlongZ, eave) {
  const group = new THREE.Group();
  const L = ridgeAlongZ ? d : w;
  const S = ridgeAlongZ ? w : d;
  const slope = Math.atan2(rise, S / 2);
  const slopeLen = S / 2 / Math.cos(slope);
  const panelMat = mat(0x1e3a5f);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(ridgeAlongZ ? slopeLen * 0.55 : L * 0.7, 0.08, ridgeAlongZ ? L * 0.7 : slopeLen * 0.55), panelMat);
    const off = S / 4; // 斜面中點
    const y = eave + rise / 2 + 0.1;
    if (ridgeAlongZ) {
      panel.position.set(side * off, y, 0);
      panel.rotation.z = -side * slope;
    } else {
      panel.position.set(0, y, side * off);
      panel.rotation.x = side * slope;
    }
    group.add(panel);
  }
  return group;
}

// 雙斜屋頂（三角柱），ridgeAlongZ=true 時屋脊沿 z 方向
function gableRoof(w, d, rise, ridgeAlongZ, material) {
  const L = ridgeAlongZ ? d : w; // 屋脊長
  const S = ridgeAlongZ ? w : d; // 跨距
  const shape = new THREE.Shape();
  shape.moveTo(-S / 2, 0);
  shape.lineTo(S / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  if (!ridgeAlongZ) geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 依 kind 畫戶外設施，回傳物件高度（給標籤定位）
function buildOutdoor(g, o) {
  const w = o.w ?? 2;
  const d = o.d ?? 2;
  switch (o.kind) {
    case 'stage': {
      // 照片：底座學生彩繪、背牆繪本草原壁畫、頂棚葉子圖案（都貼在朝操場的 -x 面）
      const h = o.h ?? 5;
      const white = mat(0xf1efe8);
      const baseMat = photoMat('stage-base.jpg');
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), [white, baseMat, white, white, baseMat, baseMat]).translateY(0.5));
      const wallH = 3.4;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, d - 1), [white, photoMat('stage-mural.jpg'), white, white, white, white]);
      wall.position.set(w / 2 - 0.6, 1 + wallH / 2, 0);
      g.add(wall);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(box(0.5, h - 1, 0.5, white, sx * (w / 2 - 0.6), 1 + (h - 1) / 2, sz * (d / 2 - 0.6)));
      }
      const leaf = photoMat('stage-canopy.jpg');
      const green = mat(0x86c06c);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), [leaf, leaf, green, green, leaf, leaf]).translateY(h + 0.25));
      g.add(box(w + 0.8, 0.25, d + 0.8, mat(0xf8fafc), 0, h - 0.1, 0));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 8), mat(0xd1d5db));
      pole.position.set(0, h + 6, 0);
      g.add(pole);
      g.add(box(1.6, 1.0, 0.04, mat(0xdc2626), 0.85, h + 11.3, 0));
      g.children.forEach(c => (c.castShadow = c.receiveShadow = true));
      return h + 1;
    }
    case 'turf': g.add(flat(w, d, mat(0x4caf50), 0.04)); return 0.5;
    case 'lawn': g.add(flat(w, d, mat(0x8fbf6a), 0.035)); return 0.5;
    case 'paving': g.add(flat(w, d, mat(0xcfcac0), 0.025)); return 0.5;
    case 'paddy': {
      g.add(flat(w, d, mat(0x8fb27a), 0.02));
      for (let i = 1; i < 4; i++) g.add(box(w, 0.15, 0.4, mat(0x7a6a4f), 0, 0.08, -d / 2 + (i * d) / 4));
      return 0.5;
    }
    case 'farm': {
      g.add(flat(w, d, mat(0x7c5a3a), 0.03));
      const rows = Math.max(2, Math.floor(d / 1.6));
      for (let i = 0; i < rows; i++) {
        g.add(box(w - 1, 0.35, 0.7, mat(i % 2 ? 0x2f5d34 : 0x1f2937), 0, 0.18, -d / 2 + 0.8 + i * 1.6));
      }
      return 0.6;
    }
    case 'pingpong': {
      g.add(box(w, 0.05, d, mat(0x1d4ed8), 0, o.h ?? 0.76, 0));
      g.add(box(0.05, 0.15, d, mat(0xf8fafc), 0, (o.h ?? 0.76) + 0.1, 0));
      for (const sx of [-1, 1]) g.add(box(0.1, o.h ?? 0.76, d - 0.3, mat(0x111827), sx * (w / 2 - 0.4), (o.h ?? 0.76) / 2, 0));
      return 1;
    }
    case 'carport': {
      const h = o.h ?? 3;
      const rust = mat(0x8b4a2b);
      const n = Math.max(2, Math.round(d / 5) + 1);
      for (let i = 0; i < n; i++) {
        const z = -d / 2 + 0.3 + (i * (d - 0.6)) / (n - 1);
        g.add(box(0.2, h, 0.2, mat(0x9ca3af), w / 2 - 0.5, h / 2, z));
        g.add(box(0.2, h - 0.6, 0.2, mat(0x9ca3af), -w / 2 + 0.5, (h - 0.6) / 2, z));
      }
      const roof = box(w, 0.12, d, rust, 0, h - 0.25, 0);
      roof.rotation.z = Math.atan2(0.6, w);
      g.add(roof);
      g.add(flat(w, d, mat(0xbfbab0), 0.025));
      return h;
    }
    case 'pond': {
      const r = Math.min(w, d) / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 24, 1, false, Math.PI, Math.PI), mat(0xb8b5ad));
      rim.position.y = 0.3;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.4, r - 0.4, 0.62, 24, 1, false, Math.PI, Math.PI), mat(0x4f8fbf));
      water.position.y = 0.31;
      g.add(rim, water);
      return 0.6;
    }
    case 'gate': {
      const brick = mat(0xb5654b);
      let top = 0;
      for (const p of gateParts(o)) {
        // 朝外（-x）那一面貼校門照片，其他面是磚色
        const face = p.tex ? photoMat(p.tex) : brick;
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), [brick, face, brick, brick, brick, brick]);
        m.position.set(p.lx, p.h / 2, p.lz);
        m.castShadow = true;
        g.add(m);
        top = Math.max(top, p.h);
      }
      return top;
    }
    case 'hut': {
      const h = o.h ?? 2.5;
      g.add(box(w, h, d, mat(0xc08a52), 0, h / 2, 0));
      const roof = box(w + 0.4, 0.15, d + 0.4, mat(0x64748b), 0, h + 0.1, 0);
      g.add(roof);
      return h;
    }
    case 'treehouse': {
      // 架高小屋在後半部，前方（靠操場）放紅藍涵管屋；尺寸跟著 w、d 縮放
      const h = o.h ?? 4.5;
      const wood = mat(0x8a5a35);
      const hw = w * 0.6;
      const hd = d * 0.55;
      const hz = -d / 2 + hd / 2;
      const deckY = 2.2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(box(0.25, deckY, 0.25, wood, sx * (hw / 2 - 0.2), deckY / 2, hz + sz * (hd / 2 - 0.2)));
      }
      g.add(box(hw + 0.4, 0.2, hd + 0.4, wood, 0, deckY, hz));
      const houseH = Math.max(1.4, h - deckY - 1.2);
      g.add(box(hw - 0.4, houseH, hd - 0.4, mat(0xa16a3e), 0, deckY + houseH / 2 + 0.1, hz));
      const roof = gableRoof(hw + 0.2, hd + 0.2, 1.1, false, mat(0x6b4f35));
      roof.position.set(0, deckY + houseH + 0.1, hz);
      g.add(roof);
      const r = Math.min(0.8, d * 0.18);
      [0xdc2626, 0x2563eb].forEach((c, i) => {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.6, 16, 1, true), mat(c, { side: THREE.DoubleSide }));
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set((i - 0.5) * (r * 2 + 0.4), r, d / 2 - 0.9);
        pipe.castShadow = true;
        g.add(pipe);
      });
      return h;
    }
    case 'bars': {
      // 高低單槓：沿寬度方向一排，高度遞增
      const n = Math.max(2, Math.round(w / 1.5));
      const steel = mat(0x2563eb);
      const span = w / n;
      for (let i = 0; i <= n; i++) {
        const h = 1.2 + (0.5 * Math.min(i, n - 1)) / Math.max(1, n - 1);
        g.add(box(0.12, h, 0.12, steel, -w / 2 + i * span, h / 2, 0));
      }
      for (let i = 0; i < n; i++) {
        const h = 1.2 + (0.5 * i) / Math.max(1, n - 1);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, span, 6), mat(0xd1d5db));
        bar.rotation.z = Math.PI / 2;
        bar.position.set(-w / 2 + (i + 0.5) * span, h - 0.05, 0);
        g.add(bar);
      }
      return 1.8;
    }
    case 'deck': {
      const h = o.h ?? 0.45;
      const wood = mat(0xa9744a);
      g.add(box(w, h, d, wood, 0, h / 2, 0));
      for (let i = 1; i < Math.floor(w / 0.6); i++) {
        g.add(box(0.03, 0.01, d, mat(0x7c5434), -w / 2 + i * 0.6, h + 0.005, 0));
      }
      g.add(box(w, 0.9, 0.12, mat(0x8a5a35), 0, h + 0.45, d / 2 - 0.06)); // 靠馬路側的木欄
      return h + 0.5;
    }
    case 'context': {
      const h = o.h ?? 6;
      g.add(box(w, h, d, mat(0xd6d3d1), 0, h / 2, 0));
      const roof = gableRoof(w + 0.6, d + 0.6, 2, d > w, mat(0xb4533c));
      roof.position.y = h;
      g.add(roof);
      return h;
    }
    default:
      g.add(box(w, o.h ?? 1, d, mat(0x94a3b8), 0, (o.h ?? 1) / 2, 0));
      return o.h ?? 1;
  }
}
