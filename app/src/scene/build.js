// 依 campus.json 畫出整個校園。
// 規則：每個資料項目都是一個 Group，Group 的位置＝資料的 x/z、旋轉＝rot（度），
// 子物件一律用「以項目中心為原點」的局部座標，這樣編輯模式拖動 Group 就等於改資料。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { makeGroundPlane, makeReferencePlane, makeRoad, makeTrack, makeCourt } from './ground.js';
import { wingLayout, stairLayout, roomFace, insideItem, toWorld, rcx, rcz, rw, rd } from './layout.js';
import { setPhotoLoader, mat, texMat, box, metricUV, gableRoof, mergeStatic } from './parts.js';
import { buildOutdoor } from './outdoor.js';
import {
  BAY_W, SIGN_W, SIGN_H, graniteTexture, floorTileTexture, facadeTexture, roomFacadeTexture, gableTexture,
  solarTexture, signTexture, brickTexture, stoneTexture, plasterTexture,
} from './textures.js';

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

export function buildCampus(data, { loader, onLabelClick }) {
  setPhotoLoader(loader);
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
  for (const wall of data.walls || []) root.add(buildWall(wall));

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

  // ---------- 教學大樓（照片：灰色洗石子外牆、白色浪板山牆、卡其綠屋頂） ----------
  const fh = s.floorHeight;
  const base = s.buildingBase;
  const granite = texMat(graniteTexture());
  const tile = texMat(floorTileTexture());
  const ceiling = mat(0xf3f1ea);
  const capMat = mat(0xc9c9c3);
  const yellow = mat(0xf2c230);
  const roofMat = mat(0xa9b391, { side: THREE.DoubleSide });
  const facade = kind => texMat(facadeTexture(kind, fh));

  for (const w of data.buildings || []) {
    const g = itemGroup('buildings', w);
    const { body, corr, side, alongX, columns, spans } = wingLayout(w, data.buildings);
    const ridgeX = w.ridge !== 'z';

    // 一樓地坪（走廊頂面是磨石子地磚）
    const plinth = new THREE.Mesh(
      metricUV(new THREE.BoxGeometry(w.w, base, w.d), w.w, base, w.d, 1, 1),
      [granite, granite, tile, granite, granite, granite]
    );
    plinth.position.y = base / 2;
    plinth.receiveShadow = true;
    g.add(plinth);
    reg(plinth, 'always');

    // 外牆每一面的樣式：朝走廊＝米白＋洗石子牆腳；山牆那兩端＝整面洗石子沒有窗；其他＝洗石子＋窗
    const corrFace = { east: 0, west: 1, south: 4, north: 5 }[side];
    const endFaces = ridgeX ? [0, 1] : [4, 5];
    for (let f = 1; f <= w.floors; f++) {
      const y0 = base + (f - 1) * fh;
      const faceMats = [0, 1, 2, 3, 4, 5].map(i => {
        if (i === 2 || i === 3) return granite;
        if (i === corrFace) return facade('corr');
        if (endFaces.includes(i)) return facade('end');
        return facade('ext');
      });
      const shell = new THREE.Mesh(
        metricUV(new THREE.BoxGeometry(rw(body), fh, rd(body)), rw(body), fh, rd(body), BAY_W, fh),
        faceMats
      );
      shell.position.set(rcx(body), y0 + fh / 2, rcz(body));
      shell.castShadow = shell.receiveShadow = true;
      g.add(shell);
      reg(shell, 'shell', f);

      if (!corr) continue;
      const parts = new THREE.Group();
      if (f > 1) {
        // 二樓樓板：上面磨石子、下面是一樓走廊的天花板
        const slab = new THREE.Mesh(
          metricUV(new THREE.BoxGeometry(rw(corr), 0.25, rd(corr)), rw(corr), 0.25, rd(corr), 1, 1),
          [granite, granite, tile, ceiling, granite, granite]
        );
        slab.position.set(rcx(corr), y0 - 0.125, rcz(corr));
        slab.receiveShadow = true;
        parts.add(slab);
      }
      // 走廊外緣的柱子：整根花崗石，朝走廊的兩個角貼黃色護角
      const inward = { south: { x: 0, z: -1 }, north: { x: 0, z: 1 }, west: { x: 1, z: 0 }, east: { x: -1, z: 0 } }[side];
      for (const { x: px, z: pz } of columns) {
        const col = new THREE.Mesh(metricUV(new THREE.BoxGeometry(0.55, fh, 0.55), 0.55, fh, 0.55, 1, 1), granite);
        col.position.set(px, y0 + fh / 2, pz);
        col.castShadow = true;
        parts.add(col);
        for (const t of [-1, 1]) {
          const gx = px + (alongX ? t * 0.29 : inward.x * 0.29);
          const gz = pz + (alongX ? inward.z * 0.29 : t * 0.29);
          parts.add(box(0.07, 1.6, 0.07, yellow, gx, y0 + 0.3 + 0.8, gz));
        }
      }
      if (f > 1) {
        // 二樓走廊外側：灰色實心矮牆＋壓頂
        const parapet = (cx, cz, sw, sd) => {
          const m = new THREE.Mesh(metricUV(new THREE.BoxGeometry(sw, 1.0, sd), sw, 1.0, sd, 1, 1), granite);
          m.position.set(cx, y0 + 0.5, cz);
          m.castShadow = true;
          parts.add(m);
          parts.add(box(sw + (sw > sd ? 0 : 0.1), 0.06, sd + (sd > sw ? 0 : 0.1), capMat, cx, y0 + 1.03, cz));
        };
        for (const { a, b } of spans) {
          parapet((a.x + b.x) / 2, (a.z + b.z) / 2, Math.max(0.25, Math.abs(b.x - a.x)), Math.max(0.25, Math.abs(b.z - a.z)));
        }
        // 走廊盡頭朝戶外的那一端也有矮牆（接到其他棟的那一端不擋）
        for (const end of [-1, 1]) {
          const ex = alongX ? (end < 0 ? corr.x0 : corr.x1) : rcx(corr);
          const ez = alongX ? rcz(corr) : end < 0 ? corr.z0 : corr.z1;
          const out = toWorld(w, ex + (alongX ? end * 0.6 : 0), ez + (alongX ? 0 : end * 0.6));
          if (data.buildings.some(o => o.id !== w.id && insideItem(o, out.x, out.z))) continue;
          if (alongX) parapet(ex - end * 0.125, ez, 0.25, rd(corr));
          else parapet(ex, ez - end * 0.125, rw(corr), 0.25);
        }
      }
      g.add(parts);
      reg(parts, 'slab', f);
    }

    // 雙斜屋頂（含走廊上方），兩端山牆是白色浪板＋拱形窗
    const eave = base + w.floors * fh;
    const rw0 = w.w + 1.0;
    const rd0 = w.d + 1.0;
    const span = ridgeX ? rd0 : rw0;
    const rise = span * 0.18;
    const roof = gableRoof(rw0, rd0, rise, !ridgeX, [texMat(gableTexture(span, rise)), roofMat]);
    roof.position.y = eave;
    g.add(roof);
    reg(roof, 'roof');
    const solar = solarArrays(rw0, rd0, rise, !ridgeX, eave, w.solar);
    g.add(solar);
    reg(solar, 'roof');
    const lbl = label(g, w.name, 'bldg', eave + rise + 1, { collection: 'buildings', id: w.id }, 50);
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

    // 朝走廊的門窗與班牌（在建物群組裡，樓層剖面時也看得到）
    const face = roomFace(r, data.buildings);
    if (face) {
      const fg = buildRoomFacade(r, face, y0, fh);
      fg.userData.ref = { collection: 'rooms', id: r.id };
      groups.get(`buildings:${face.wing.id}`).add(fg);
      reg(fg, 'facade', r.floor);
    }
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

  // 合併同材質的小零件（柱子、欄杆、台階、樹…），畫面不變、手機比較順
  for (const { obj } of registry) if (obj.isGroup) mergeStatic(obj);
  for (const o of root.children) if (o.isGroup && !o.userData.ref) mergeStatic(o); // 圍牆
  return { root, registry, groups };
}

// 教室朝走廊的牆面（門、窗）＋門邊伸出來的班牌。座標是建物局部座標
function buildRoomFacade(r, face, y0, fh) {
  const g = new THREE.Group();
  const { len, origin, dirU, normal } = face;
  const at = (u, n) => ({ x: origin.x + dirU.x * u + normal.x * n, z: origin.z + dirU.z * u + normal.z * n });
  const seed = [...r.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 97;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(len, fh),
    texMat(roomFacadeTexture(len, fh, r.category === 'wc' ? 'wc' : 'room', seed))
  );
  const mid = at(len / 2, 0.03);
  panel.position.set(mid.x, y0 + fh / 2, mid.z);
  panel.rotation.y = Math.atan2(normal.x, normal.z);
  panel.receiveShadow = true;
  g.add(panel);

  if (r.sign) {
    // 班牌在門的右邊（靠教室邊界），垂直牆面伸出 0.66 m，兩面都看得到
    const sg = new THREE.Group();
    const p = at(Math.max(0.2, len - 0.28), 0.02);
    sg.position.set(p.x, y0 + 2.45, p.z);
    sg.rotation.y = Math.atan2(-normal.z, normal.x); // 局部 +x 指向走廊
    // 兩片背對背：從走廊兩個方向看，字都是正的
    const signMat = texMat(signTexture(r.sign), { alphaTest: 0.5 });
    for (const back of [false, true]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), signMat);
      plate.position.set(0.08 + SIGN_W / 2, 0, back ? -0.012 : 0.012);
      if (back) plate.rotation.y = Math.PI;
      sg.add(plate);
    }
    sg.add(box(SIGN_W - 0.1, SIGN_H - 0.06, 0.02, mat(0x4a3022), 0.08 + SIGN_W / 2, 0, 0)); // 木板厚度
    const wood = mat(0x4a3022);
    sg.add(box(0.05, SIGN_H + 0.12, 0.06, wood, 0.025, 0, 0)); // 牆上的底座
    sg.add(box(0.1, 0.035, 0.035, wood, 0.08, SIGN_H / 2 - 0.03, 0));
    g.add(sg);
  }
  return g;
}

// 屋頂太陽能板：cfg.side（south／north／east／west／both）、cfg.count（沿屋脊幾組）
function solarArrays(w, d, rise, ridgeAlongZ, eave, cfg) {
  const group = new THREE.Group();
  if (!cfg) return group;
  const L = ridgeAlongZ ? d : w;
  const S = ridgeAlongZ ? w : d;
  const slope = Math.atan2(rise, S / 2);
  const slopeLen = S / 2 / Math.cos(slope);
  const count = Math.max(1, cfg.count || 1);
  const gap = 1.2;
  const along = Math.min(7, (L * 0.8 - gap * (count - 1)) / count);
  const up = Math.min(3.4, slopeLen * 0.4); // 照片：每組大約兩排板子
  const tex = solarTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(along / 1.0, up / 1.65);
  const panelMat = new THREE.MeshLambertMaterial({ map: tex });
  const sides = cfg.side === 'both' ? [-1, 1] : [{ south: 1, north: -1, east: 1, west: -1 }[cfg.side] ?? 1];
  for (const sd of sides) {
    for (let i = 0; i < count; i++) {
      const t = -((count - 1) * (along + gap)) / 2 + i * (along + gap);
      const geo = new THREE.BoxGeometry(ridgeAlongZ ? up : along, 0.08, ridgeAlongZ ? along : up);
      if (ridgeAlongZ) {
        // 貼圖的長邊沿屋脊：把頂面 UV 轉 90 度
        const uv = geo.attributes.uv;
        for (let k = 8; k < 12; k++) uv.setXY(k, uv.getY(k), uv.getX(k));
      }
      const panel = new THREE.Mesh(geo, [panelMat, panelMat, panelMat, panelMat, panelMat, panelMat]);
      const off = S / 4;
      const y = eave + rise / 2 + 0.1;
      if (ridgeAlongZ) {
        panel.position.set(sd * off, y, t);
        panel.rotation.z = -sd * slope;
      } else {
        panel.position.set(t, y, sd * off);
        panel.rotation.x = sd * slope;
      }
      group.add(panel);
    }
  }
  return group;
}

// 圍牆：style＝stone（下段溪石擋土牆＋上段白牆）、brick（低矮紅磚牆＋柱）、concrete（灰色水泥牆）
const wallCache = {};
function wallMats() {
  if (!wallCache.stone) {
    wallCache.stone = texMat(stoneTexture());
    wallCache.plaster = texMat(plasterTexture());
    wallCache.brick = texMat(brickTexture());
    wallCache.post = mat(0xe4ded2);
    wallCache.concrete = mat(0xb9b7b0);
    wallCache.cap = mat(0xd6d3cb);
  }
  return wallCache;
}

function buildWall(wall) {
  const g = new THREE.Group();
  const m = wallMats();
  const h = wall.height ?? 1.6;
  for (let i = 0; i < wall.points.length - 1; i++) {
    const [x0, z0] = wall.points[i];
    const [x1, z1] = wall.points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Group();
    seg.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    const part = (ph, pd, material, y, tw, th) => {
      const geo = new THREE.BoxGeometry(len, ph, pd);
      if (tw) metricUV(geo, len, ph, pd, tw, th);
      const b = new THREE.Mesh(geo, material);
      b.position.y = y + ph / 2;
      b.castShadow = b.receiveShadow = true;
      seg.add(b);
    };
    const posts = (every, ph, y = 0) => {
      const n = Math.max(1, Math.round(len / every));
      for (let k = 0; k <= n; k++) seg.add(box(0.35, ph, 0.35, m.post, -len / 2 + (k * len) / n, y + ph / 2, 0));
    };
    if (wall.style === 'stone') {
      const low = Math.min(1.4, h * 0.47);
      part(low, 0.45, m.stone, 0, 2, 1.4);
      part(h - low, 0.25, m.plaster, low, 3.2, 1.6);
      posts(3.2, h - low + 0.15, low);
      part(0.06, 0.32, m.cap, h);
    } else if (wall.style === 'brick') {
      part(h, 0.25, m.brick, 0, 1, 1);
      part(0.06, 0.3, m.cap, h);
      posts(3.5, h + 0.15);
    } else {
      part(h, 0.25, wall.style === 'concrete' ? m.concrete : mat(0xe7e5df), 0);
    }
    g.add(seg);
  }
  return g;
}
