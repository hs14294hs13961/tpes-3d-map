// 畫面與碰撞共用的幾何計算，確保「看到的牆」和「撞到的牆」永遠一致。
import * as THREE from 'three';

// 一棟建物：本體（教室區）與走廊區的局部範圍、走廊柱子位置、外側矮牆範圍（都是局部座標）。
// 走廊外緣只有「面向戶外」的部分才有柱子和矮牆；接到其他棟的那一段是開放的交會口。
export function wingLayout(w, wings = []) {
  const cw = w.corridor?.width || 0;
  const side = w.corridor?.side;
  const body = { x0: -w.w / 2, x1: w.w / 2, z0: -w.d / 2, z1: w.d / 2 };
  let corr = null;
  if (cw && side) {
    corr = { ...body };
    if (side === 'south') { body.z1 -= cw; corr.z0 = body.z1; }
    if (side === 'north') { body.z0 += cw; corr.z1 = body.z0; }
    if (side === 'west') { body.x0 += cw; corr.x1 = body.x0; }
    if (side === 'east') { body.x1 -= cw; corr.x0 = body.x1; }
  }
  const columns = [];
  const spans = [];
  const alongX = side === 'south' || side === 'north';
  if (corr) {
    const others = wings.filter(o => o.id !== w.id);
    const blocked = (lx, lz) => {
      const p = toWorld(w, lx, lz);
      return others.some(o => insideItem(o, p.x, p.z, 0.5));
    };
    const len = alongX ? rw(corr) : rd(corr);
    const edge = { south: corr.z1 - 0.3, north: corr.z0 + 0.3, west: corr.x0 + 0.3, east: corr.x1 - 0.3 }[side];
    const at = t => (alongX ? { x: rcx(corr) + t, z: edge } : { x: edge, z: rcz(corr) + t });
    const n = Math.max(2, Math.round(len / 4) + 1);
    for (let i = 0; i < n; i++) {
      const p = at(-len / 2 + 0.3 + (i * (len - 0.6)) / (n - 1));
      if (!blocked(p.x, p.z)) columns.push(p);
    }
    // 矮牆：沿外緣每 0.25 m 取樣，連續「面向戶外」的段落合成一段
    let start = null;
    for (let t = -len / 2; t <= len / 2 + 1e-6; t += 0.25) {
      const p = at(Math.min(t, len / 2));
      const open = !blocked(p.x, p.z);
      if (open && start === null) start = p;
      if ((!open || t + 0.25 > len / 2 + 1e-6) && start !== null) {
        const end = open ? p : at(Math.max(-len / 2, t - 0.25));
        if (Math.hypot(end.x - start.x, end.z - start.z) > 0.3) spans.push({ a: start, b: end });
        start = null;
      }
    }
  }
  return { body, corr, side, alongX, columns, spans };
}

// 世界座標 → 資料項目的局部座標（toWorld 的反轉換）
export function toLocal(o, x, z) {
  const a = THREE.MathUtils.degToRad(-(o.rot || 0));
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - o.x;
  const dz = z - o.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

// 世界座標的點是否在某個資料項目的矩形內（pad：往外放寬）
export function insideItem(o, x, z, pad = 0) {
  const { lx, lz } = toLocal(o, x, z);
  return Math.abs(lx) <= o.w / 2 + pad && Math.abs(lz) <= o.d / 2 + pad;
}

// 教室朝走廊的那一面：在哪一棟、沿走廊的範圍、面的位置與朝向（建物局部座標）。
// 不在任何一棟本體裡的空間（例如司令台旁的體育器材室）回傳 null。
//   origin：面上 u=0 的點；dirU：u 增加的方向（從走廊看過去由左到右）；normal：朝走廊
export function roomFace(room, wings) {
  for (const w of wings) {
    const L = wingLayout(w, wings);
    if (!L.corr) continue;
    const { body } = L;
    const { lx, lz } = toLocal(w, room.x, room.z);
    if (lx < body.x0 || lx > body.x1 || lz < body.z0 || lz > body.z1) continue;
    const half = L.alongX ? room.w / 2 : room.d / 2;
    const c = L.alongX ? lx : lz;
    // 相鄰教室的牆面要接齊，不能留縫（剖面時縫後面是空的）
    const a = Math.max(L.alongX ? body.x0 : body.z0, c - half);
    const b = Math.min(L.alongX ? body.x1 : body.z1, c + half);
    if (b - a < 0.5) return null;
    switch (L.side) {
      case 'south': return { wing: w, len: b - a, origin: { x: a, z: body.z1 }, dirU: { x: 1, z: 0 }, normal: { x: 0, z: 1 } };
      case 'north': return { wing: w, len: b - a, origin: { x: b, z: body.z0 }, dirU: { x: -1, z: 0 }, normal: { x: 0, z: -1 } };
      case 'west': return { wing: w, len: b - a, origin: { x: body.x0, z: a }, dirU: { x: 0, z: 1 }, normal: { x: -1, z: 0 } };
      case 'east': return { wing: w, len: b - a, origin: { x: body.x1, z: b }, dirU: { x: 0, z: -1 }, normal: { x: 1, z: 0 } };
      default: return null;
    }
  }
  return null;
}

export const rcx = r => (r.x0 + r.x1) / 2;
export const rcz = r => (r.z0 + r.z1) / 2;
export const rw = r => r.x1 - r.x0;
export const rd = r => r.z1 - r.z0;

// 折返式樓梯：從開口邊（open，接走廊）往內走，第一段在左半邊爬到中間平台，
// 第二段在右半邊往回爬到二樓，出口也在開口邊。
// 以 (u, v) 描述：u 沿開口邊 0～W，v 從開口邊往內 0～L。
export function stairLayout(st, settings) {
  const { buildingBase: base, floorHeight: fh } = settings;
  const open = st.open || 'north';
  const acrossX = open === 'north' || open === 'south';
  const W = acrossX ? st.w : st.d;
  const L = acrossX ? st.d : st.w;
  const landing = Math.min(1.6, L * 0.3);
  const run = L - landing;
  const steps = 11; // 每段階數

  // (u,v) ↔ 樓梯局部座標 (lx,lz)
  function toLocal(u, v) {
    switch (open) {
      case 'south': return { lx: st.w / 2 - u, lz: st.d / 2 - v };
      case 'west': return { lx: -st.w / 2 + v, lz: st.d / 2 - u };
      case 'east': return { lx: st.w / 2 - v, lz: -st.d / 2 + u };
      default: return { lx: -st.w / 2 + u, lz: -st.d / 2 + v };
    }
  }
  function toUV(lx, lz) {
    switch (open) {
      case 'south': return { u: st.w / 2 - lx, v: st.d / 2 - lz };
      case 'west': return { u: st.d / 2 - lz, v: lx + st.w / 2 };
      case 'east': return { u: lz + st.d / 2, v: st.w / 2 - lx };
      default: return { u: lx + st.w / 2, v: lz + st.d / 2 };
    }
  }
  // 樓梯面高度（含平台）
  function heightUV(u, v) {
    if (v >= run) return base + fh / 2;
    const t = Math.max(0, v) / run;
    return u < W / 2 ? base + t * (fh / 2) : base + fh - t * (fh / 2);
  }
  return { open, W, L, landing, run, steps, base, fh, toLocal, toUV, heightUV };
}

// 校門的柱子（畫面與碰撞共用）。style: 'main' 是正門：南側高門柱（直寫校名）＋北側拱門小屋。
// 回傳局部座標的方塊：{ lx, lz, w, d, h, tex, back, flag }
//   tex：朝外那一面（-x）的貼圖；back：朝校內那一面（+x）的貼圖；flag：國旗插在哪一側（+1／-1 往 z）
export function gateParts(o) {
  const w = o.w ?? 2;
  const d = o.d ?? 2;
  const alongZ = d >= w;
  const span = alongZ ? d : w;
  const at = (t, pw, pd) => (alongZ ? { lx: 0, lz: t, w: pw, d: pd } : { lx: t, lz: 0, w: pd, d: pw });
  if (o.style === 'main') {
    return [
      { ...at(span / 2 + 0.8, 1.6, 1.6), h: 5.6, tex: 'gate-pillar.jpg', flag: -1 },
      { ...at(-span / 2 - 1.5, 2.2, 3.0), h: 4.0, tex: 'gate-arch.jpg', back: 'gate-arch-back.jpg', flag: 1 },
    ];
  }
  const h = o.h ?? 3;
  return [-1, 1].map(sgn => ({ ...at((sgn * span) / 2, 1.0, 1.0), h }));
}

// 無障礙車位的欄杆（局部座標），畫面與碰撞共用
export function railSegments(o) {
  if (o.marking !== 'accessible') return [];
  const w = o.w;
  const d = o.d;
  return [
    // 沿建物牆那段從北側圍牆往內退 3.4 m，留出圍牆和大樓之間的小通道
    { x0: w / 2 - 0.35, z0: -d / 2 + 3.4, x1: w / 2 - 0.35, z1: -d / 2 + 6.8 },
    { x0: -w / 2 + 2.2, z0: -d / 2 + 0.35, x1: w / 2 - 0.8, z1: -d / 2 + 0.35 },
  ];
}

// 桌球桌擋板（局部 z 位置與長度），畫面與碰撞共用
export function pingpongBarrier(o) {
  return { z: -(o.d ?? 1.53) / 2 - 1.6, len: 6 };
}

// 資料項目的局部座標 → 世界座標（與 build.js 的 Group 旋轉一致：rotation.y = -rot）
export function toWorld(item, lx, lz) {
  const a = THREE.MathUtils.degToRad(-(item.rot || 0));
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c };
}
