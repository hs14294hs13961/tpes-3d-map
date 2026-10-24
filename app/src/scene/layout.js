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

// 世界座標的點是否在某個資料項目的矩形內（pad：往外放寬）
export function insideItem(o, x, z, pad = 0) {
  const a = THREE.MathUtils.degToRad(-(o.rot || 0));
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - o.x;
  const dz = z - o.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= o.w / 2 + pad && Math.abs(lz) <= o.d / 2 + pad;
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

// 校門的柱子（畫面與碰撞共用）。style: 'main' 是正門：南側高門柱（校名）＋北側拱門。
// 回傳局部座標的方塊：{ lx, lz, w, d, h, tex }，tex 是朝外那一面（-x）要貼的照片
export function gateParts(o) {
  const w = o.w ?? 2;
  const d = o.d ?? 2;
  const alongZ = d >= w;
  const span = alongZ ? d : w;
  const at = (t, pw, pd) => (alongZ ? { lx: 0, lz: t, w: pw, d: pd } : { lx: t, lz: 0, w: pd, d: pw });
  if (o.style === 'main') {
    return [
      { ...at(span / 2 + 0.55, 1.0, 1.1), h: 4.4, tex: 'gate-pillar.jpg' },
      { ...at(-span / 2 - 0.9, 1.4, 1.8), h: 3.6, tex: 'gate-arch.jpg' },
    ];
  }
  const h = o.h ?? 3;
  return [-1, 1].map(sgn => ({ ...at((sgn * span) / 2, 1.0, 1.0), h }));
}

// 資料項目的局部座標 → 世界座標（與 build.js 的 Group 旋轉一致：rotation.y = -rot）
export function toWorld(item, lx, lz) {
  const a = THREE.MathUtils.degToRad(-(item.rot || 0));
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c };
}
