// 地面類物件：地表、空拍底圖、道路、跑道、球場。
// 跑道與球場用 canvas 畫成貼圖，尺寸全部以公尺計算。
import * as THREE from 'three';

const PPM = 20; // 貼圖解析度：每公尺 20 像素

export function makeGroundPlane() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 320).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xa9c48f })
  );
  mesh.position.set(0, -0.02, 0);
  mesh.receiveShadow = true;
  return mesh;
}

// 空拍底圖：照片約 1 MB，等第一次要顯示時才下載（一般訪客用不到）
export function makeReferencePlane(ref, loader) {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: ref.opacity ?? 0.85,
    depthWrite: false,
    visible: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ref.w, ref.d).rotateX(-Math.PI / 2), mat);
  mesh.position.y = 0.2;
  mesh.renderOrder = 5;
  mesh.userData.load = () => {
    if (mat.map) return;
    const tex = loader.load(ref.image.replace(/^public\//, './public/'), () => (mat.visible = true));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mat.map = tex;
    mat.needsUpdate = true;
  };
  return mesh;
}

// 沿折線做出平面道路
export function makeRoad(road) {
  const pts = road.points.map(([x, z]) => new THREE.Vector2(x, z));
  const half = road.width / 2;
  const positions = [];
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(half);
    left.push(pts[i].clone().add(n));
    right.push(pts[i].clone().sub(n));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = left[i], b = right[i], c = left[i + 1], d = right[i + 1];
    positions.push(a.x, 0, a.y, c.x, 0, c.y, b.x, 0, b.y);
    positions.push(b.x, 0, b.y, c.x, 0, c.y, d.x, 0, d.y);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x5b6470, side: THREE.DoubleSide }));
  mesh.position.y = 0.01;
  mesh.receiveShadow = true;
  return mesh;
}

function canvasPlane(w, d, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * PPM);
  canvas.height = Math.ceil(d * PPM);
  const ctx = canvas.getContext('2d');
  ctx.scale(PPM, PPM);
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true });
  mat.userData.disposable = true; // 每次重畫都會重做，舊的要釋放
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  mesh.receiveShadow = true;
  return mesh;
}

// 跑道：中央內場（stadium 形）＋六道環形跑道＋上下延伸的直線跑道
export function makeTrack(t) {
  const R = t.innerRadius;
  const hs = t.halfStraight;
  const lw = t.laneWidth;
  const outer = R + t.lanes * lw;
  const bands = t.bands || [];
  const xmin = Math.min(-hs - outer, ...bands.map(b => b.x0));
  const xmax = Math.max(hs + outer, ...bands.map(b => b.x1));
  const zmin = Math.min(-outer, ...bands.map(b => b.z0));
  const zmax = Math.max(outer, ...bands.map(b => b.z1));
  const w = xmax - xmin;
  const d = zmax - zmin;

  const mesh = canvasPlane(w, d, ctx => {
    ctx.translate(-xmin, -zmin);
    const stadium = r => {
      ctx.beginPath();
      ctx.moveTo(-hs, -r);
      ctx.lineTo(hs, -r);
      ctx.arc(hs, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-hs, r);
      ctx.arc(-hs, 0, r, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };
    const red = '#b9503f';
    ctx.fillStyle = red;
    for (const b of bands) ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    stadium(outer);
    ctx.fill();
    ctx.fillStyle = '#7fae5a';
    stadium(R);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.08;
    for (let i = 0; i <= t.lanes; i++) {
      stadium(R + i * lw);
      ctx.stroke();
    }
    // 直線延伸段的分道線
    for (const b of bands) {
      const sign = b.z0 < 0 ? -1 : 1;
      for (let i = 0; i <= t.lanes; i++) {
        const z = sign * (R + i * lw);
        if (z < b.z0 - 0.01 || z > b.z1 + 0.01) continue;
        ctx.beginPath();
        ctx.moveTo(b.x0, z);
        ctx.lineTo(b.x1, z);
        ctx.stroke();
      }
    }
  });
  mesh.position.set((xmin + xmax) / 2, 0.03, (zmin + zmax) / 2);
  return mesh;
}

// 籃球／綜合球場（以 FIBA 尺寸畫線，球場比 28×15 小時會等比縮小）
export function makeCourt(c) {
  const mesh = canvasPlane(c.w, c.d, ctx => {
    ctx.fillStyle = c.color || '#3f9d5a';
    ctx.fillRect(0, 0, c.w, c.d);
    const L = Math.min(28, c.w - 1.5);
    const W = Math.min(15, c.d - 1.5);
    const k = Math.min(L / 28, W / 15);
    ctx.translate(c.w / 2, c.d / 2);
    ctx.scale(k, k);
    const hl = 14, hw = 7.5;
    const paint = '#d2604f';
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-hl, -2.45, 5.8, 4.9);
    ctx.fillRect(hl - 5.8, -2.45, 5.8, 4.9);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.08;
    ctx.strokeRect(-hl, -hw, hl * 2, hw * 2);
    ctx.beginPath();
    ctx.moveTo(0, -hw);
    ctx.lineTo(0, hw);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    for (const s of [-1, 1]) {
      const bx = s * (hl - 1.575);
      ctx.strokeRect(s < 0 ? -hl : hl - 5.8, -2.45, 5.8, 4.9);
      ctx.beginPath();
      ctx.arc(s * (hl - 5.8), 0, 1.8, 0, Math.PI * 2);
      ctx.stroke();
      // 三分線：兩側直線＋弧線
      const a = Math.asin(6.6 / 6.75);
      ctx.beginPath();
      if (s < 0) ctx.arc(bx, 0, 6.75, -a, a);
      else ctx.arc(bx, 0, 6.75, Math.PI - a, Math.PI + a);
      ctx.stroke();
      const xEnd = bx + s * -Math.cos(a) * 6.75;
      for (const zz of [-6.6, 6.6]) {
        ctx.beginPath();
        ctx.moveTo(s * hl, zz);
        ctx.lineTo(xEnd, zz);
        ctx.stroke();
      }
    }
  });
  mesh.position.y = 0.06;
  return mesh;
}
