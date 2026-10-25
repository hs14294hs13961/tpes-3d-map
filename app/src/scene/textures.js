// 程式畫的貼圖（canvas）：外牆、走廊牆、磨石子地磚、山牆、班牌、地面標線…
// 尺寸都以公尺計算；同樣內容只畫一次（快取）。依照第三輪實景照片調整配色。
import * as THREE from 'three';

const cache = new Map();
let logoImg = null;

// 班牌要畫校徽，先把圖片載好（main.js 開場時等這一步）
export function preloadTextureImages() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      logoImg = img;
      resolve();
    };
    img.onerror = () => resolve(); // 沒有校徽也能畫，只是少了圖案
    img.src = './public/logo.png';
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return { c, ctx: c.getContext('2d') };
}

function toTexture(c, repeat = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// 固定亂數，每次畫出來都一樣
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 洗石子（灰色帶細點）：外牆、柱子、矮牆、牆腳共用
function speckle(ctx, x, y, w, h, base, seed = 1, density = 0.9) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const r = rng(seed);
  const n = Math.round(w * h * density * 0.06);
  for (let i = 0; i < n; i++) {
    const v = r();
    ctx.fillStyle = v < 0.45 ? 'rgba(70,72,74,0.3)' : v < 0.8 ? 'rgba(235,235,230,0.4)' : 'rgba(150,140,128,0.3)';
    ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}

export const GRANITE = '#a9a9a4';
const CREAM = '#efe9dc';
const FRAME = '#4a3427'; // 深咖啡色鋁窗框
const GLASS = '#5f7486';

// 2 m × 2 m 的洗石子
export function graniteTexture() {
  return cached('granite', () => {
    const { c, ctx } = makeCanvas(256, 256);
    speckle(ctx, 0, 0, 256, 256, GRANITE, 3);
    return toTexture(c);
  });
}

// 1 m × 1 m（兩片 0.5 m）灰白磨石子地磚
export function floorTileTexture() {
  return cached('floortile', () => {
    const { c, ctx } = makeCanvas(128, 128);
    speckle(ctx, 0, 0, 128, 128, '#d9d8d2', 5, 1.4);
    ctx.strokeStyle = 'rgba(150,150,145,0.8)';
    ctx.lineWidth = 1.5;
    for (const p of [0, 64, 128]) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 128);
      ctx.moveTo(0, p);
      ctx.lineTo(128, p);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

// 兩段式鋁窗（下段推拉窗＋上段氣窗），部分窗格拉著窗簾
function drawWindow(ctx, x, y, w, h, px, seed = 1) {
  const r = rng(seed);
  ctx.fillStyle = FRAME;
  ctx.fillRect(x, y, w, h);
  const f = Math.max(2, 0.06 * px);
  const transom = h * 0.3;
  const panes = Math.max(2, Math.round(w / (0.9 * px)));
  const pw = (w - f) / panes;
  for (const [ty, th] of [[y + f, transom - f * 1.5], [y + transom + f / 2, h - transom - f * 1.5]]) {
    for (let i = 0; i < panes; i++) {
      const gx = x + f + i * pw;
      const gw = pw - f;
      ctx.fillStyle = GLASS;
      ctx.fillRect(gx, ty, gw, th);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(gx, ty, gw, th * 0.35);
      // 下段窗格有一半拉著米色窗簾
      if (ty > y + f && r() < 0.5) {
        ctx.fillStyle = 'rgba(236,228,210,0.85)';
        const cw = gw * (0.3 + r() * 0.4);
        ctx.fillRect(r() < 0.5 ? gx : gx + gw - cw, ty, cw, th);
      }
    }
  }
}

// 建物外牆貼圖：一格 4 m 寬 × 樓高，每格一扇窗
//   ext：洗石子外牆；corr：走廊側（上半米白、下 1 m 洗石子）；end：山牆面（洗石子、沒有窗）
export const BAY_W = 4;
export function facadeTexture(kind, fh) {
  return cached(`facade:${kind}:${fh}`, () => {
    const px = 64;
    const { c, ctx } = makeCanvas(BAY_W * px, fh * px);
    const y = m => c.height - m * px; // 由下往上量
    if (kind === 'corr') {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, c.width, c.height);
      speckle(ctx, 0, y(1.0), c.width, 1.0 * px, GRANITE, 7);
    } else {
      speckle(ctx, 0, 0, c.width, c.height, GRANITE, kind === 'end' ? 11 : 9);
    }
    if (kind !== 'end') drawWindow(ctx, 0.5 * px, y(2.8), 3.0 * px, 1.8 * px, px, kind === 'corr' ? 3 : 4);
    return toTexture(c);
  });
}

// 教室朝走廊的那一面：牆、窗、門（門在右端，從走廊看過去）
// kind：'room'（一般）、'wc'（化妝室：門洞＋高窗）
export function roomFacadeTexture(len, fh, kind = 'room', seed = 1) {
  const key = `room:${len.toFixed(2)}:${fh}:${kind}:${seed}`;
  return cached(key, () => {
    const px = 40;
    const { c, ctx } = makeCanvas(len * px, fh * px);
    const y = m => c.height - m * px;
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, c.width, c.height);
    speckle(ctx, 0, y(1.0), c.width, 1.0 * px, GRANITE, 13 + seed);
    // 窗台
    ctx.fillStyle = '#b9b9b3';
    ctx.fillRect(0, y(1.04), c.width, 0.06 * px);
    const doorW = 1.0;
    const doorX = len - 0.5 - doorW;
    if (kind === 'wc') {
      // 化妝室：沒有門扇的門洞，旁邊是高窗
      ctx.fillStyle = '#3b3f45';
      ctx.fillRect(doorX * px, y(2.3), (doorW + 0.3) * px, 2.3 * px);
      for (let x = 0.5; x + 1.3 < doorX - 0.3; x += 1.8) drawWindow(ctx, x * px, y(2.8), 1.3 * px, 0.6 * px, px, seed + x);
    } else {
      // 兩段式窗戶，窗與窗之間留 0.25 m 牆
      const span = doorX - 0.6;
      const n = Math.max(1, Math.round(span / 2.6));
      const ww = (span - (n - 1) * 0.25) / n;
      for (let i = 0; i < n; i++) drawWindow(ctx, (0.3 + i * (ww + 0.25)) * px, y(2.8), ww * px, 1.8 * px, px, seed * 7 + i);
      // 深咖啡色門：上半玻璃、上方氣窗
      ctx.fillStyle = FRAME;
      ctx.fillRect(doorX * px, y(2.8), doorW * px, 2.8 * px);
      ctx.fillStyle = GLASS;
      ctx.fillRect((doorX + 0.08) * px, y(2.72), (doorW - 0.16) * px, 0.45 * px);
      ctx.fillRect((doorX + 0.15) * px, y(2.0), (doorW - 0.3) * px, 0.85 * px);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect((doorX + 0.15) * px, y(2.0), (doorW - 0.3) * px, 0.3 * px);
      ctx.fillStyle = '#d6d3cb'; // 門把
      ctx.fillRect((doorX + 0.1) * px, y(1.05), 0.12 * px, 0.05 * px);
    }
    // 門口地上的門檻
    ctx.fillStyle = '#c9c3b5';
    ctx.fillRect(doorX * px, y(0.05), doorW * px, 0.05 * px);
    return toTexture(c, false);
  });
}

// 山牆三角形：白色浪板＋兩扇拱形窗。UV＝山牆形狀的公尺座標（x：-S/2～S/2，y：0～rise）
export function gableTexture(S, rise) {
  const key = `gable:${S.toFixed(2)}:${rise.toFixed(2)}`;
  return cached(key, () => {
    const px = 40;
    const { c, ctx } = makeCanvas(S * px, rise * px);
    ctx.fillStyle = '#eef0ec';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(160,166,162,0.55)';
    for (let x = 0; x < c.width; x += 0.25 * px) ctx.fillRect(x, 0, 2, c.height);
    // 兩扇拱形窗，各離中線 1.2 m
    const ww = 0.9 * px;
    const wh = Math.min(1.4, rise * 0.45) * px;
    const bottom = c.height - 0.45 * px;
    for (const off of [-1.2, 1.2]) {
      const cx = c.width / 2 + off * px;
      const draw = (inset, color) => {
        const r = ww / 2 - inset;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - r, bottom - inset);
        ctx.lineTo(cx - r, bottom - wh + ww / 2);
        ctx.arc(cx, bottom - wh + ww / 2, r, Math.PI, 0);
        ctx.lineTo(cx + r, bottom - inset);
        ctx.closePath();
        ctx.fill();
      };
      draw(0, '#ffffff');
      draw(4, GLASS);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1.5, bottom - wh, 3, wh);
      ctx.fillRect(cx - ww / 2, bottom - wh * 0.45, ww, 3);
    }
    const tex = toTexture(c);
    tex.repeat.set(1 / S, 1 / rise);
    tex.offset.set(0.5, 0);
    return tex;
  });
}

// 太陽能板：1 m × 1.65 m 一片
export function solarTexture() {
  return cached('solar', () => {
    const { c, ctx } = makeCanvas(64, 106);
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(0, 0, 64, 106);
    ctx.strokeStyle = 'rgba(200,215,230,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 104);
    ctx.strokeStyle = 'rgba(200,215,230,0.18)';
    ctx.lineWidth = 1;
    for (let x = 16; x < 64; x += 16) (ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, 106), ctx.stroke());
    for (let y = 13; y < 106; y += 13) (ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(64, y), ctx.stroke());
    return toTexture(c);
  });
}

// ---------- 班牌 ----------
// 行政／專科教室：膠囊形木框，左側白底校徽、右側青綠底中英文（照片）
// 班級（style: class）：深色木板，綠字白邊，右上角圓弧，右側紅色火焰標誌
// wc：左側改成男女圖示
export const SIGN_W = 0.66;
export const SIGN_H = 0.24;
export function signTexture(sign) {
  const key = `sign:${sign.zh}:${sign.en || ''}:${sign.style || ''}`;
  return cached(key, () => {
    const W = 396;
    const H = 144;
    const { c, ctx } = makeCanvas(W, H);
    const font = (size, weight = 700) => `${weight} ${size}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
    const fitText = (text, maxW, size, weight) => {
      let s = size;
      ctx.font = font(s, weight);
      while (s > 10 && ctx.measureText(text).width > maxW) ctx.font = font(--s, weight);
    };
    if (sign.style === 'class') {
      const r = 44;
      ctx.fillStyle = '#4b2f22';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W - r, 0);
      ctx.arc(W - r, r, r, -Math.PI / 2, 0);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,18,12,0.35)'; // 木紋
      ctx.lineWidth = 2;
      for (let y = 10; y < H; y += 13) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(W * 0.3, y + 4, W * 0.6, y - 4, W, y + 2);
        ctx.stroke();
      }
      // 右側紅色火焰標誌
      ctx.fillStyle = '#d23b33';
      ctx.beginPath();
      ctx.ellipse(W - 52, 66, 16, 26, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4b2f22';
      ctx.beginPath();
      ctx.ellipse(W - 46, 72, 8, 16, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineJoin = 'round';
      const outlined = (text, x, y, size, maxW) => {
        fitText(text, maxW, size);
        ctx.lineWidth = Math.max(4, size / 7);
        ctx.strokeStyle = '#f8fafc';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = '#2f9e57';
        ctx.fillText(text, x, y);
      };
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      outlined(sign.zh, 28, 70, 50, W - 120);
      if (sign.en) outlined(sign.en, 22, 118, 24, W - 110);
      return toTexture(c, false);
    }
    // 膠囊形：咖啡色木框，裡面左側白底（斜切）、右側青綠底
    const pillPath = inset => {
      const r = H / 2 - inset;
      ctx.beginPath();
      ctx.moveTo(H / 2, inset);
      ctx.lineTo(W - H / 2, inset);
      ctx.arc(W - H / 2, H / 2, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(H / 2, H - inset);
      ctx.arc(H / 2, H / 2, r, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };
    ctx.fillStyle = '#5a3a2a';
    pillPath(0);
    ctx.fill();
    ctx.fillStyle = '#2f8f91';
    pillPath(9);
    ctx.fill();
    ctx.save();
    pillPath(9);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(118, 0);
    ctx.lineTo(96, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (sign.style === 'wc') {
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(46, 46, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(38, 58, 16, 40);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(76, 46, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(76, 56);
      ctx.lineTo(90, 98);
      ctx.lineTo(62, 98);
      ctx.closePath();
      ctx.fill();
    } else if (logoImg) {
      ctx.drawImage(logoImg, 18, 30, 84, 84);
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const cx = (110 + W - 20) / 2;
    fitText(sign.zh, W - 150, 44);
    ctx.fillText(sign.zh, cx, sign.en ? 70 : 88);
    if (sign.en) {
      ctx.fillRect(cx - 100, 84, 200, 2);
      fitText(sign.en, W - 160, 20, 600);
      ctx.fillText(sign.en, cx, 112);
    }
    return toTexture(c, false);
  });
}

// ---------- 國旗 ----------
export function flagTexture() {
  return cached('flag', () => {
    const { c, ctx } = makeCanvas(240, 160);
    ctx.fillStyle = '#d7262e';
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = '#1c3f94';
    ctx.fillRect(0, 0, 120, 80);
    // 白日：十二道光芒
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12 - Math.PI / 2;
      const r = i % 2 === 0 ? 30 : 17;
      ctx.lineTo(60 + Math.cos(a) * r, 40 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c3f94';
    ctx.beginPath();
    ctx.arc(60, 40, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(60, 40, 13.5, 0, Math.PI * 2);
    ctx.fill();
    return toTexture(c, false);
  });
}

// ---------- 地面：遊戲區、停車格、稻田 ----------
// 回傳「每公尺 ppm 像素」的 canvas 與畫筆（已縮放成公尺、原點在左上角）
function groundCanvas(w, d, ppm = 20) {
  const { c, ctx } = makeCanvas(w * ppm, d * ppm);
  ctx.scale(ppm, ppm);
  return { c, ctx };
}

function gear(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = 10;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const rr = i % 2 === 0 ? r : r * 0.82;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// 人工草皮遊戲區：齒輪、跳格子、白色雲朵、紫色腳印
export function playgroundTexture(w, d) {
  return cached(`playground:${w}:${d}`, () => {
    const { c, ctx } = groundCanvas(w, d);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(0, 0, w, d);
    const r = rng(17);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(40,110,45,0.35)' : 'rgba(120,200,110,0.3)';
      ctx.fillRect(r() * w, r() * d, 0.15, 0.15);
    }
    // 鞦韆下方的齒輪（西側）
    gear(ctx, w * 0.2, d * 0.62, 0.8, '#f3e9b8');
    gear(ctx, w * 0.33, d * 0.62, 0.8, '#f3e9b8');
    // 跳格子（東側）
    const hx = w * 0.82;
    const cell = 0.7;
    ctx.lineWidth = 0.06;
    ['#f8fafc', '#a855f7', '#f8fafc', '#ef4444', '#f8fafc', '#a855f7'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(hx - cell / 2, d * 0.2 + i * cell, cell, cell * 0.9);
    });
    // 雲朵
    ctx.fillStyle = '#f1f5f9';
    for (const [cx, cy] of [[w * 0.55, d * 0.8], [w * 0.7, d * 0.3]]) {
      for (const [ox, oy, rr] of [[0, 0, 0.55], [0.6, 0.1, 0.45], [-0.55, 0.12, 0.42], [0.1, -0.35, 0.4]]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 紫色腳印
    ctx.fillStyle = '#9333ea';
    for (let i = 0; i < 4; i++) {
      const fx = w * 0.45 + i * 0.7;
      const fy = d * 0.4 + (i % 2) * 0.4;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 0.22, 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.arc(fx + k * 0.18, fy - 0.36, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return toTexture(c, false);
  });
}

// 水泥地＋無障礙車位（車位長邊平行建物牆，斜線區在牆邊）
export function accessibleTexture(w, d) {
  return cached(`accessible:${w}:${d}`, () => {
    const { c, ctx } = groundCanvas(w, d);
    ctx.fillStyle = '#cfcac0';
    ctx.fillRect(0, 0, w, d);
    const blue = '#2f6fd1';
    const x1 = w - 0.6; // 欄杆內側
    const aisle = 1.5;
    const sw = 3.5;
    const z0 = 0.8;
    const z1 = z0 + 6;
    ctx.strokeStyle = blue;
    ctx.lineWidth = 0.12;
    ctx.strokeRect(x1 - aisle - sw, z0, sw, z1 - z0);
    ctx.strokeRect(x1 - aisle, z0, aisle, z1 - z0);
    ctx.beginPath();
    for (let z = z0 + 0.6; z < z1; z += 0.9) {
      ctx.moveTo(x1 - aisle, z);
      ctx.lineTo(x1, z - 0.6);
    }
    ctx.stroke();
    // 輪椅圖示
    const cx = x1 - aisle - sw / 2;
    const cy = z1 - 1.6;
    ctx.fillStyle = blue;
    ctx.fillRect(cx - 0.8, cy - 0.6, 1.6, 1.2);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.arc(cx - 0.05, cy + 0.15, 0.32, 0.2, Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 0.1, cy - 0.38, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 0.12, cy - 0.25);
    ctx.lineTo(cx - 0.05, cy + 0.08);
    ctx.lineTo(cx + 0.3, cy + 0.08);
    ctx.lineTo(cx + 0.42, cy + 0.42);
    ctx.stroke();
    return toTexture(c, false);
  });
}

// 柏油地＋白色停車格（三格，車頭朝 -z）
export function parkingTexture(w, d) {
  return cached(`parking:${w}:${d}`, () => {
    const { c, ctx } = groundCanvas(w, d);
    ctx.fillStyle = '#7a7d80';
    ctx.fillRect(0, 0, w, d);
    const r = rng(23);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(40,40,40,0.25)' : 'rgba(200,200,200,0.2)';
      ctx.fillRect(r() * w, r() * d, 0.1, 0.1);
    }
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 0.1;
    const n = 3;
    const sw = Math.min(2.5, (w - 0.6) / n);
    const x0 = (w - n * sw) / 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      ctx.moveTo(x0 + i * sw, 0.5);
      ctx.lineTo(x0 + i * sw, Math.min(d - 0.5, 5.5));
    }
    ctx.moveTo(x0, 0.5);
    ctx.lineTo(x0 + n * sw, 0.5);
    ctx.stroke();
    return toTexture(c, false);
  });
}

// 水稻田：一行一行的秧苗與水面
export function paddyTexture(w, d) {
  return cached(`paddy:${w}:${d}`, () => {
    const { c, ctx } = groundCanvas(w, d, 8);
    ctx.fillStyle = '#6f8f4a';
    ctx.fillRect(0, 0, w, d);
    ctx.strokeStyle = 'rgba(160,205,95,0.9)';
    ctx.lineWidth = 0.18;
    for (let x = 0.2; x < w; x += 0.35) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, d);
      ctx.stroke();
    }
    return toTexture(c, false);
  });
}

// ---------- 其他小貼圖 ----------
// 浪板（鐵皮屋）：每 0.2 m 一道肋
export function ribTexture(base, rib) {
  return cached(`rib:${base}:${rib}`, () => {
    const { c, ctx } = makeCanvas(64, 64);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = rib;
    for (let x = 0; x < 64; x += 12.8) ctx.fillRect(x, 0, 3, 64);
    return toTexture(c);
  });
}

// 紅磚（1 m × 1 m）
export function brickTexture() {
  return cached('brick', () => {
    const { c, ctx } = makeCanvas(128, 128);
    ctx.fillStyle = '#d8cfc2';
    ctx.fillRect(0, 0, 128, 128);
    const r = rng(31);
    const bh = 128 / 15;
    const bw = 128 / 4.5;
    for (let row = 0; row < 15; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < 128; x += bw) {
        const v = 0.85 + r() * 0.2;
        ctx.fillStyle = `rgb(${Math.round(160 * v)},${Math.round(76 * v)},${Math.round(58 * v)})`;
        ctx.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    return toTexture(c);
  });
}

// 溪石擋土牆（2 m × 1.4 m 一格）
export function stoneTexture() {
  return cached('stone', () => {
    const { c, ctx } = makeCanvas(160, 112);
    ctx.fillStyle = '#4a4e4c';
    ctx.fillRect(0, 0, 160, 112);
    const r = rng(41);
    for (let i = 0; i < 70; i++) {
      const v = 150 + Math.round(r() * 70);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      ctx.beginPath();
      ctx.ellipse(r() * 160, r() * 112, 5 + r() * 7, 4 + r() * 5, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

// 白色粉刷圍牆（每 3.2 m 一個框）
export function plasterTexture() {
  return cached('plaster', () => {
    const { c, ctx } = makeCanvas(128, 64);
    ctx.fillStyle = '#ecebe6';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = 'rgba(150,150,145,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 108, 44);
    return toTexture(c);
  });
}

// 校慶碑：黑底金框、幾行金色字（看不清楚的小字，只表示有文字）
export function plaqueTexture() {
  return cached('plaque', () => {
    const { c, ctx } = makeCanvas(260, 160);
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 260, 160);
    ctx.strokeStyle = '#c9a54a';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 248, 148);
    ctx.fillStyle = 'rgba(214,180,90,0.8)';
    for (let x = 24; x < 240; x += 9) for (let y = 22; y < 140; y += 6) if ((x + y) % 7) ctx.fillRect(x, y, 4, 4);
    return toTexture(c, false);
  });
}

// 東平里衛生室正面：紅磚牆、灰色牆腳、綠框窗、鐵捲門與綠色門
export function clinicFrontTexture(w, h) {
  return cached(`clinic:${w}:${h}`, () => {
    const px = 48;
    const { c, ctx } = makeCanvas(w * px, h * px);
    const y = m => c.height - m * px;
    ctx.fillStyle = '#a8503c';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = 'rgba(220,200,185,0.45)';
    ctx.lineWidth = 1;
    for (let yy = 0; yy < c.height; yy += 4) (ctx.beginPath(), ctx.moveTo(0, yy), ctx.lineTo(c.width, yy), ctx.stroke());
    speckle(ctx, 0, y(0.9), c.width, 0.9 * px, '#a7a59f', 51);
    const mid = c.width / 2;
    // 門：上方鐵捲門盒、下方米色門＋綠色紗門
    ctx.fillStyle = '#d9d2bd';
    ctx.fillRect(mid - 1.1 * px, y(2.7), 2.2 * px, 0.5 * px);
    ctx.fillStyle = '#e2ddcf';
    ctx.fillRect(mid - 1.1 * px, y(2.2), 1.0 * px, 2.2 * px);
    ctx.fillStyle = '#2b2f33';
    ctx.fillRect(mid - 0.05 * px, y(2.2), 1.1 * px, 2.2 * px);
    ctx.fillStyle = '#2f8f7a';
    ctx.fillRect(mid + 0.45 * px, y(2.2), 0.6 * px, 2.2 * px);
    // 兩側綠框窗（有鐵窗）
    for (const wx of [0.5, w - 0.5 - 1.6]) {
      ctx.fillStyle = '#2f7f6a';
      ctx.fillRect(wx * px, y(2.4), 1.6 * px, 1.3 * px);
      ctx.fillStyle = '#4e6170';
      ctx.fillRect((wx + 0.08) * px, y(2.32), 1.44 * px, 1.14 * px);
      ctx.fillStyle = '#2f7f6a';
      for (let i = 1; i < 5; i++) ctx.fillRect((wx + (1.6 * i) / 5) * px - 1, y(2.4), 3, 1.3 * px);
    }
    return toTexture(c, false);
  });
}

// 足球門網子：白色細格、其他透明
export function netTexture() {
  return cached('net', () => {
    const { c, ctx } = makeCanvas(64, 64);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= 64; p += 16) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 64);
      ctx.moveTo(0, p);
      ctx.lineTo(64, p);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

// 雞舍的鐵絲網
export function meshTexture() {
  return cached('wiremesh', () => {
    const { c, ctx } = makeCanvas(32, 32);
    ctx.strokeStyle = 'rgba(200,205,210,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(16, 0);
    ctx.lineTo(32, 16);
    ctx.lineTo(16, 32);
    ctx.closePath();
    ctx.stroke();
    return toTexture(c);
  });
}

// 小木牌（樹屋「太平樹屋」、消防機房門牌）
export function plateTexture(text, bg, fg) {
  return cached(`plate:${text}:${bg}:${fg}`, () => {
    const { c, ctx } = makeCanvas(256, 80);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 80);
    ctx.fillStyle = fg;
    ctx.font = '700 44px "Kaiti TC", "BiauKai", "PingFang TC", "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 42);
    return toTexture(c, false);
  });
}
