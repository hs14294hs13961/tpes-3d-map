// 人物碰撞（平面上的圓形 vs 矩形／圓／線段）與可行走的地面高度，支援樓梯與二樓走廊。
// 全部從 campus.json 產生，和畫面共用 layout.js，改資料後兩者一起變。
import { wingLayout, stairLayout, gateParts, rcx, rcz, rw, rd, toWorld } from '../scene/layout.js';

const STEP = 0.5; // 能直接跨上／跨下的高度差（走廊台階 0.3 m、木平台 0.45 m）
const BODY_H = 1.3; // 人物身高，用來判斷障礙物有沒有擋到

// 世界座標的有向矩形；y0～y1 是它佔的高度範圍
function orientedRect(item, lx, lz, w, d, y0 = 0, y1 = 99) {
  const c = toWorld(item, lx, lz);
  const a = (-(item.rot || 0) * Math.PI) / 180; // 和 layout.toWorld 相同的旋轉角
  return { x: c.x, z: c.z, hw: w / 2, hd: d / 2, cos: Math.cos(a), sin: Math.sin(a), y0, y1 };
}

// 世界 → 局部（toWorld 的反轉換）
function toLocal(r, x, z) {
  const dx = x - r.x;
  const dz = z - r.z;
  return { lx: dx * r.cos - dz * r.sin, lz: dx * r.sin + dz * r.cos };
}

function inside(r, x, z, pad = 0) {
  const { lx, lz } = toLocal(r, x, z);
  return Math.abs(lx) <= r.hw + pad && Math.abs(lz) <= r.hd + pad;
}

export function buildCollision(data) {
  const settings = data.settings;
  const { buildingBase: base, floorHeight: fh } = settings;
  const top = base + 2 * fh;
  const rects = []; // 擋路的矩形（hole：true 表示樓梯範圍內不算，例如建物本體）
  const circles = [];
  const segments = [];
  const flats = []; // 可行走的平面：{ rect, h, solid }（solid＝下面是實心，不能從底下鑽過）
  const stairs = []; // { rect, item, layout }

  for (const st of data.stairs || []) {
    const L = stairLayout(st, settings);
    const rect = orientedRect(st, 0, 0, st.w, st.d);
    stairs.push({ rect, item: st, L });
    // 樓梯間的牆：兩側與底部（開口邊不擋），中間欄杆，二樓開口邊第一段上方的欄杆
    const uvRect = (u0, u1, v0, v1, y0, y1) => {
      const a = L.toLocal(u0, v0);
      const b = L.toLocal(u1, v1);
      return orientedRect(st, (a.lx + b.lx) / 2, (a.lz + b.lz) / 2, Math.abs(b.lx - a.lx), Math.abs(b.lz - a.lz), y0, y1);
    };
    rects.push(uvRect(0, 0.12, 0, L.L, 0, top));
    rects.push(uvRect(L.W - 0.12, L.W, 0, L.L, 0, top));
    rects.push(uvRect(0, L.W, L.L - 0.12, L.L, 0, top));
    rects.push(uvRect(L.W / 2 - 0.08, L.W / 2 + 0.08, 0, L.run, 0, top));
    rects.push(uvRect(0, L.W / 2, -0.1, 0.1, base + fh, base + fh + 1));
  }

  const inStair = (x, z) => stairs.some(s => inside(s.rect, x, z));

  for (const w of data.buildings || []) {
    const { body, corr, columns, spans } = wingLayout(w, data.buildings);
    flats.push({ rect: orientedRect(w, 0, 0, w.w, w.d), h: base, solid: true }); // 一樓地坪（含走廊）
    const bodyRect = orientedRect(w, rcx(body), rcz(body), rw(body), rd(body), 0, top);
    bodyRect.hole = true;
    rects.push(bodyRect);
    for (const c of columns) rects.push(orientedRect(w, c.x, c.z, 0.55, 0.55, 0, top));
    if (corr && w.floors > 1) {
      for (let f = 2; f <= w.floors; f++) {
        const y = base + (f - 1) * fh;
        flats.push({ rect: orientedRect(w, rcx(corr), rcz(corr), rw(corr), rd(corr)), h: y, solid: false });
        // 二樓走廊外側矮牆（只在面向戶外的段落）
        for (const { a, b } of spans) {
          const sw = Math.max(0.25, Math.abs(b.x - a.x));
          const sd = Math.max(0.25, Math.abs(b.z - a.z));
          rects.push(orientedRect(w, (a.x + b.x) / 2, (a.z + b.z) / 2, sw, sd, y, y + 1));
        }
      }
    }
  }

  // 教室（一般在建物本體裡；司令台旁的體育器材室在中庭，要另外擋）
  for (const r of data.rooms || []) {
    const y0 = base + (r.floor - 1) * fh;
    rects.push(orientedRect(r, 0, 0, r.w, r.d, r.floor === 1 ? 0 : y0, y0 + fh));
  }

  for (const o of data.outdoor || []) {
    const w = o.w ?? 2;
    const d = o.d ?? 2;
    const h = o.h ?? 3;
    switch (o.kind) {
      case 'stage':
      case 'hut':
      case 'treehouse':
      case 'context':
      case 'pingpong':
        rects.push(orientedRect(o, 0, 0, w, d, 0, Math.max(h, 2)));
        break;
      case 'bars':
        rects.push(orientedRect(o, 0, 0, w, 0.3, 0, 2));
        break;
      case 'gate':
        for (const g of gateParts(o)) rects.push(orientedRect(o, g.lx, g.lz, g.w, g.d, 0, g.h));
        break;
      case 'pond': {
        // 半圓水池（西半邊）：用偏西的圓近似
        const r = Math.min(w, d) / 2;
        const c = toWorld(o, -r * 0.35, 0);
        circles.push({ x: c.x, z: c.z, r: r * 0.8, y0: 0, y1: 1 });
        break;
      }
      case 'deck':
        flats.push({ rect: orientedRect(o, 0, 0, w, d), h: o.h ?? 0.45, solid: true });
        rects.push(orientedRect(o, 0, d / 2 - 0.06, w, 0.12, 0, 2)); // 靠馬路側的木欄
        break;
      default:
        break; // 草地、步道、田、車棚（只有細柱子）都可以走
    }
  }

  for (const t of data.trees || []) circles.push({ x: t.x, z: t.z, r: 0.35, y0: 0, y1: 99 });

  for (const wall of data.walls || []) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [ax, az] = wall.points[i];
      const [bx, bz] = wall.points[i + 1];
      segments.push({ ax, az, bx, bz, half: 0.15, y0: 0, y1: wall.height ?? 1.6 });
    }
  }

  const bounds = { x0: -74, x1: 72, z0: -44, z1: 42 };

  // 這一點所有可站的面：{ h, solid }（地面永遠在）
  function surfacesAt(x, z) {
    const out = [{ h: 0, solid: true }];
    // 放寬 0.15 m：兩棟走廊交界若有幾公分的縫，不會被當成「會掉下去」
    for (const f of flats) if (inside(f.rect, x, z, 0.15)) out.push({ h: f.h, solid: f.solid });
    for (const s of stairs) {
      if (!inside(s.rect, x, z)) continue;
      const { lx, lz } = toLocal(s.rect, x, z);
      const { u, v } = s.L.toUV(lx, lz);
      out.push({ h: s.L.heightUV(u, v), solid: true });
    }
    return out;
  }

  // 目前高度 y 時，這一點能站的高度；不能站（太高、會掉下去、會鑽進樓梯底下）回傳 null
  function standHeight(x, z, y) {
    let best = null;
    for (const s of surfacesAt(x, z)) {
      if (s.solid && s.h > y + STEP) return null; // 實心的東西擋在頭頂
      if (s.h <= y + STEP && s.h >= y - STEP && (best === null || s.h > best)) best = s.h;
    }
    return best;
  }

  const overlapsY = (o, y) => o.y1 > y + 0.1 && o.y0 < y + BODY_H;

  // 把半徑 radius 的圓推出所有障礙物（只算和人物身高重疊的）
  function resolve(x, z, radius, y = 0) {
    for (let iter = 0; iter < 3; iter++) {
      for (const r of rects) {
        if (!overlapsY(r, y)) continue;
        const { lx, lz } = toLocal(r, x, z);
        if (Math.abs(lx) > r.hw + radius || Math.abs(lz) > r.hd + radius) continue;
        const cx = Math.max(-r.hw, Math.min(r.hw, lx));
        const cz = Math.max(-r.hd, Math.min(r.hd, lz));
        // 建物本體在樓梯間的位置是空的（樓梯本身有牆）
        if (r.hole) {
          const wx = r.x + cx * r.cos + cz * r.sin;
          const wz = r.z - cx * r.sin + cz * r.cos;
          if (inStair(wx, wz) || inStair(x, z)) continue;
        }
        let nx = lx - cx;
        let nz = lz - cz;
        let dist = Math.hypot(nx, nz);
        if (dist >= radius) continue;
        if (dist < 1e-6) {
          // 圓心已經在矩形裡：往最近的邊推出去
          const ex = r.hw - Math.abs(lx);
          const ez = r.hd - Math.abs(lz);
          if (ex < ez) (nx = Math.sign(lx) || 1), (nz = 0), (dist = -ex);
          else (nx = 0), (nz = Math.sign(lz) || 1), (dist = -ez);
        } else {
          nx /= dist;
          nz /= dist;
        }
        const push = radius - dist;
        const plx = lx + nx * push;
        const plz = lz + nz * push;
        x = r.x + plx * r.cos + plz * r.sin;
        z = r.z - plx * r.sin + plz * r.cos;
      }
      for (const c of circles) {
        if (!overlapsY(c, y)) continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (dist >= min || dist < 1e-6) continue;
        x = c.x + (dx / dist) * min;
        z = c.z + (dz / dist) * min;
      }
      for (const s of segments) {
        if (!overlapsY(s, y)) continue;
        const vx = s.bx - s.ax;
        const vz = s.bz - s.az;
        const len2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / len2));
        const px = s.ax + vx * t;
        const pz = s.az + vz * t;
        const dx = x - px;
        const dz = z - pz;
        const dist = Math.hypot(dx, dz);
        const min = s.half + radius;
        if (dist >= min || dist < 1e-6) continue;
        x = px + (dx / dist) * min;
        z = pz + (dz / dist) * min;
      }
    }
    x = Math.max(bounds.x0, Math.min(bounds.x1, x));
    z = Math.max(bounds.z0, Math.min(bounds.z1, z));
    return { x, z };
  }

  // 從 (x,z,y) 走到 (nx,nz)：推出障礙物，再檢查新位置站不站得住
  function move(x, z, y, nx, nz, radius) {
    const p = resolve(nx, nz, radius, y);
    const h = standHeight(p.x, p.z, y);
    if (h === null) return { x, z, y, blocked: true };
    return { x: p.x, z: p.z, y: h, blocked: false };
  }

  function heightAt(x, z, y = 0) {
    return standHeight(x, z, y) ?? y;
  }

  // 是否在建物（走廊、樓梯）範圍內：給「進室內自動切換樓層剖面」用
  function underRoof(x, z) {
    return flats.some(f => f.solid && f.h === base && inside(f.rect, x, z)) || inStair(x, z);
  }

  const floorOf = y => (y > base + fh * 0.6 ? 2 : 1);

  return { resolve, move, heightAt, underRoof, floorOf, stairs, base, fh };
}
