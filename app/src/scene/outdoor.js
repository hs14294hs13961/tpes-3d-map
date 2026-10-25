// 戶外設施：依資料的 kind 畫出來（第三輪依實景照片重畫）。
// 所有座標都是「以項目中心為原點」的局部座標：x＝寬（w）、z＝深（d），朝操場的一面通常是 -z。
import * as THREE from 'three';
import { gateParts, railSegments, pingpongBarrier } from './layout.js';
import { mat, texMat, photoMat, box, cyl, flat, metricUV, gableRoof, shadowAll } from './parts.js';
import {
  playgroundTexture, accessibleTexture, parkingTexture, paddyTexture, ribTexture, plaqueTexture,
  clinicFrontTexture, netTexture, meshTexture, plateTexture, flagTexture, brickTexture,
  centerFacadeTexture, verticalPlateTexture, BAY_W,
} from './textures.js';

// 校門磁磚（要重複貼）
let tileMatCache = null;
function gateTileMat() {
  if (!tileMatCache) {
    const m = photoMat('gate-tile.jpg').clone();
    m.map = m.map.clone();
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.needsUpdate = true;
    tileMatCache = m;
  }
  return tileMatCache;
}

// 插在柱子上的國旗：從 (x,y,z) 斜斜往外（-x）伸出
function flagPole(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = 0.6; // 往外（-x）傾斜
  g.add(cyl(0.025, 0.025, 1.6, mat(0xd1d5db), 0, 0.8, 0, 6));
  // 旗面長邊貼著旗桿，往下垂（旗桿局部 -x 是斜下方）
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.0), texMat(flagTexture(), { side: THREE.DoubleSide }));
  flag.position.set(-0.34, 1.05, 0);
  g.add(flag);
  return g;
}

// 依 kind 畫戶外設施，回傳物件高度（給標籤定位）
export function buildOutdoor(g, o) {
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
      g.add(cyl(0.08, 0.1, 12, mat(0xd1d5db), 0, h + 6, 0, 8));
      g.add(box(1.6, 1.0, 0.04, mat(0xdc2626), 0.85, h + 11.3, 0));
      shadowAll(g);
      return h + 1;
    }
    case 'turf':
      g.add(flat(w, d, o.decor === 'playground' ? texMat(playgroundTexture(w, d)) : mat(0x4caf50), 0.04));
      return 0.5;
    case 'lawn': g.add(flat(w, d, mat(0x8fbf6a), 0.035)); return 0.5;
    case 'paving': {
      if (o.marking === 'accessible') {
        g.add(flat(w, d, texMat(accessibleTexture(w, d)), 0.03));
        // 不鏽鋼欄杆：沿建物牆（+x）一段、沿北側圍牆（-z）一段
        const steel = mat(0xc7ccd1);
        const red = mat(0xdc2626);
        const rail = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const n = Math.max(2, Math.round(len / 0.25));
          const grp = new THREE.Group();
          grp.position.set(x0, 0, z0);
          grp.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
          grp.add(box(len, 0.05, 0.05, steel, len / 2, 0.95, 0));
          grp.add(box(len, 0.04, 0.04, steel, len / 2, 0.15, 0));
          for (let i = 0; i <= n; i++) grp.add(box(0.025, 0.8, 0.025, steel, (i * len) / n, 0.55, 0));
          grp.add(box(0.08, 0.08, 0.08, red, len, 0.97, 0));
          g.add(grp);
        };
        for (const r of railSegments(o)) rail(r.x0, r.z0, r.x1, r.z1);
      } else if (o.marking === 'parking') {
        g.add(flat(w, d, texMat(parkingTexture(w, d)), 0.03));
      } else {
        g.add(flat(w, d, mat(0xcfcac0), 0.025));
      }
      return 0.5;
    }
    case 'paddy': {
      g.add(flat(w, d, texMat(paddyTexture(w, d)), 0.02));
      for (let i = 1; i < 4; i++) g.add(box(w, 0.15, 0.4, mat(0x7a6a4f), 0, 0.08, -d / 2 + (i * d) / 4));
      return 0.5;
    }
    case 'rice': {
      // 校內小稻田：土埂圍起來，裡面是水和一叢叢稻子
      const bank = mat(0x8a7454);
      g.add(flat(w, d, mat(0x5d5a35), 0.03));
      for (const sz of [-1, 1]) g.add(box(w + 0.3, 0.2, 0.15, bank, 0, 0.1, sz * (d / 2 + 0.07)));
      for (const sx of [-1, 1]) g.add(box(0.15, 0.2, d, bank, sx * (w / 2 + 0.07), 0.1, 0));
      const step = 0.3;
      const nx = Math.floor((w - 0.2) / step);
      const nz = Math.floor((d - 0.2) / step);
      const geo = new THREE.ConeGeometry(0.09, 0.85, 4, 1, true).translate(0, 0.45, 0);
      const tufts = new THREE.InstancedMesh(geo, mat(0x8cc63f, { side: THREE.DoubleSide }), nx * nz);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const s = 0.85 + ((i * 7 + j * 13) % 5) * 0.06;
        m4.makeScale(s, s, s).setPosition(-w / 2 + 0.1 + (i + 0.5) * step, 0, -d / 2 + 0.1 + (j + 0.5) * step);
        tufts.setMatrixAt(k++, m4);
      }
      tufts.castShadow = true;
      g.add(tufts);
      return 1;
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
      const th = o.h ?? 0.76;
      g.add(box(w, 0.05, d, mat(0x1d4ed8), 0, th, 0));
      g.add(box(0.05, 0.15, d, mat(0xf8fafc), 0, th + 0.1, 0));
      for (const sx of [-1, 1]) g.add(box(0.1, th, d - 0.3, mat(0x111827), sx * (w / 2 - 0.4), th / 2, 0));
      // 靠牆那側（-z）的藍色擋板
      if (o.barrier) {
        const b = pingpongBarrier(o);
        for (let i = 0; i < 4; i++) g.add(box(b.len / 4 - 0.05, 0.7, 0.05, mat(0x1e40af), -b.len / 2 + (i + 0.5) * (b.len / 4), 0.35, b.z));
      }
      return 1;
    }
    case 'banana': {
      // 香蕉樹：一根假莖＋向外垂的大葉子
      g.add(cyl(0.11, 0.15, 1.8, mat(0x7c8c4a), 0, 0.9, 0, 6));
      const leafMat = mat(0x5f9e3a, { side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        // 外層轉方向、中層往下垂、葉片本身平放（沿 +x 伸出）
        const turn = new THREE.Group();
        turn.position.y = 1.65 + (i % 3) * 0.12;
        turn.rotation.y = (i / 7) * Math.PI * 2;
        const droop = new THREE.Group();
        droop.rotation.z = -0.35 - (i % 2) * 0.3;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38).translate(0.75, 0, 0).rotateX(-Math.PI / 2), leafMat);
        leaf.castShadow = true;
        droop.add(leaf);
        turn.add(droop);
        g.add(turn);
      }
      return 2.4;
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
      // 磚紅色方塊磁磚；朝外（-x）那一面是校名／拱門貼圖，拱門朝校內那面也有門洞
      let top = 0;
      const tile = gateTileMat();
      for (const p of gateParts(o)) {
        const keep = [];
        const faces = [tile, tile, tile, tile, tile, tile];
        if (p.tex) (faces[1] = photoMat(p.tex)), keep.push(1);
        if (p.back) (faces[0] = photoMat(p.back)), keep.push(0);
        const geo = metricUV(new THREE.BoxGeometry(p.w, p.h, p.d), p.w, p.h, p.d, 1, 1, keep);
        const m = new THREE.Mesh(geo, faces);
        m.position.set(p.lx, p.h / 2, p.lz);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        if (p.flag) g.add(flagPole(p.lx - p.w / 2 - 0.02, p.h * 0.62, p.lz + p.flag * (p.d / 2 - 0.12)));
        top = Math.max(top, p.h);
      }
      return top;
    }
    case 'hut': {
      const h = o.h ?? 2.5;
      if (o.style === 'coop') {
        // 27號夢想雞舍：架高的木屋（西側）＋鐵絲網籠舍，上面是深灰色鋼構屋頂
        const wood = mat(0x9a6a40);
        const cw = Math.min(1.8, w * 0.45);
        g.add(box(cw, 1.3, d - 0.2, wood, -w / 2 + cw / 2, 0.55 + 0.65, 0));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, 0.55, 0.1, mat(0x5b4636), -w / 2 + cw / 2 + sx * (cw / 2 - 0.1), 0.28, sz * (d / 2 - 0.2)));
        g.add(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.24), texMat(plateTexture('夢想雞舍', '#f4e3c3', '#7c4a1e'))).translateX(-w / 2 + cw / 2).translateY(1.6).translateZ(-d / 2 + 0.09).rotateY(Math.PI));
        const meshW = w - cw;
        const cage = new THREE.Mesh(new THREE.BoxGeometry(meshW, h - 0.1, d - 0.1), texMat(meshTexture(), { transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        metricUV(cage.geometry, meshW, h - 0.1, d - 0.1, 0.25, 0.25);
        cage.position.set(w / 2 - meshW / 2, (h - 0.1) / 2, 0);
        g.add(cage);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, h, 0.08, mat(0x6b7280), sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04)));
        const roof = box(w + 0.6, 0.08, d + 0.6, mat(0x4b5563), 0, h + 0.1, 0);
        roof.rotation.x = 0.06;
        g.add(roof);
        return h;
      }
      if (o.style === 'metal') {
        // 警衛室：白色浪板小屋，朝校內（+x）有鐵窗
        const wall = texMat(ribTexture('#eef0ee', '#cfd4d2'));
        const geo = metricUV(new THREE.BoxGeometry(w, h, d), w, h, d, 1, 1);
        g.add(new THREE.Mesh(geo, wall).translateY(h / 2));
        g.add(box(0.06, 1.0, 1.4, mat(0x4e6170), w / 2 + 0.02, 1.6, -0.4));
        for (let i = 0; i < 6; i++) g.add(box(0.04, 1.0, 0.03, mat(0xf8fafc), w / 2 + 0.06, 1.6, -0.4 - 0.65 + i * 0.26));
        g.add(box(w + 0.3, 0.12, d + 0.3, mat(0x7b8794), 0, h + 0.06, 0));
        shadowAll(g);
        return h;
      }
      g.add(box(w, h, d, mat(0xc08a52), 0, h / 2, 0));
      g.add(box(w + 0.4, 0.15, d + 0.4, mat(0x64748b), 0, h + 0.1, 0));
      return h;
    }
    case 'clinic': {
      // 東平里衛生室：一層樓紅磚房，正面（+x，朝校內停車格）上方有磁磚字帶，屋頂有水塔
      const h = o.h ?? 3.4;
      const brick = texMat(brickTexture());
      const front = texMat(clinicFrontTexture(d, h));
      const geo = metricUV(new THREE.BoxGeometry(w, h, d), w, h, d, 1, 1, [0]);
      g.add(new THREE.Mesh(geo, [front, brick, mat(0x8f8f8a), brick, brick, brick]).translateY(h / 2));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, d), [photoMat('clinic-sign.jpg'), mat(0xd6d3cb), mat(0xd6d3cb), mat(0xd6d3cb), mat(0xd6d3cb), mat(0xd6d3cb)]);
      band.position.set(w / 2 - 0.1, h + 0.4, 0);
      g.add(band);
      g.add(box(1.0, 0.12, d * 0.45, mat(0xd9d2bd), w / 2 + 0.45, 2.75, 0)); // 門口雨遮
      g.add(cyl(0.55, 0.55, 1.1, mat(0x9ca3af), -w / 4, h + 1.1, d / 4, 12));
      g.add(box(1.2, 0.5, 1.2, mat(0x6b7280), -w / 4, h + 0.25, d / 4));
      shadowAll(g);
      return h + 1.6;
    }
    case 'shed': {
      // 消防機房：淺綠色浪板鐵皮屋，紅色收邊，門與門牌在朝操場的 -x 面
      const h = o.h ?? 3;
      const wall = texMat(ribTexture('#bcd6c3', '#9dbfa9'));
      const geo = metricUV(new THREE.BoxGeometry(w, h, d), w, h, d, 1, 1);
      g.add(new THREE.Mesh(geo, wall).translateY(h / 2));
      const red = mat(0xc0392b);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, h, 0.1, red, sx * (w / 2), h / 2, sz * (d / 2)));
      g.add(box(w + 0.1, 0.12, 0.1, red, 0, h - 0.06, -d / 2));
      g.add(box(w + 0.1, 0.12, 0.1, red, 0, h - 0.06, d / 2));
      const roof = gableRoof(w + 0.5, d + 0.5, 0.6, d > w, mat(0x8fa89a, { side: THREE.DoubleSide }));
      roof.position.y = h;
      g.add(roof);
      g.add(box(0.06, 2.1, 1.1, mat(0x5f7d6c), -w / 2 - 0.03, 1.05, 0));
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), texMat(plateTexture('消防機房', '#c0392b', '#ffffff')));
      plate.rotation.y = -Math.PI / 2;
      plate.position.set(-w / 2 - 0.07, 2.45, 0);
      g.add(plate);
      shadowAll(g);
      return h + 0.6;
    }
    case 'treehouse': return buildTreehouse(g, o, w, d);
    case 'bars': {
      // 藍色高低單槓：柱頂黃色頂蓋，橫槓兩端黃色固定環，下方鋪人工草皮
      g.add(flat(w + 1.6, 2.6, mat(0x3f9b4a), 0.035));
      const n = Math.max(2, Math.round(w / 1.5));
      const span = w / n;
      const barH = i => 1.35 + (0.6 * i) / Math.max(1, n - 1);
      const blue = mat(0x1d4ed8);
      const yellow = mat(0xfacc15);
      const steel = mat(0xd1d5db);
      for (let i = 0; i <= n; i++) {
        const h = Math.max(barH(Math.max(0, i - 1)), barH(Math.min(n - 1, i))) + 0.12;
        const x = -w / 2 + i * span;
        g.add(cyl(0.055, 0.055, h, blue, x, h / 2, 0, 10));
        g.add(cyl(0.065, 0.065, 0.06, yellow, x, h + 0.03, 0, 10));
      }
      for (let i = 0; i < n; i++) {
        const h = barH(i);
        const bar = cyl(0.025, 0.025, span, steel, -w / 2 + (i + 0.5) * span, h, 0, 6);
        bar.rotation.z = Math.PI / 2;
        g.add(bar);
        for (const e of [0, 1]) g.add(box(0.1, 0.06, 0.12, yellow, -w / 2 + (i + e) * span + (e ? -0.05 : 0.05), h, 0));
      }
      return 2.2;
    }
    case 'deck': {
      const h = o.h ?? 0.45;
      const wood = mat(0xa58467);
      g.add(box(w, h, d, wood, 0, h / 2, 0));
      for (let i = 1; i < Math.floor(w / 0.6); i++) {
        g.add(box(0.03, 0.01, d, mat(0x7c6450), -w / 2 + i * 0.6, h + 0.005, 0));
      }
      // 後方（靠馬路側）波浪頂的木牆，中間掛圓牌
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      const waves = Math.max(2, Math.round(w / 3));
      for (let i = 0; i <= 40; i++) {
        const x = -w / 2 + (i / 40) * w;
        shape.lineTo(x, 1.55 + 0.22 * Math.cos((i / 40) * waves * Math.PI * 2));
      }
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      const back = new THREE.Mesh(wallGeo, texMat(ribTexture('#8b6b53', '#735643')));
      back.position.set(0, h, d / 2 - 0.12);
      back.castShadow = back.receiveShadow = true;
      g.add(back);
      const disc = cyl(0.28, 0.28, 0.03, mat(0xf1f5f9), 0, h + 1.15, d / 2 - 0.14, 20);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
      return h + 1.8;
    }
    case 'swing': return buildSwing(g, o, w, d);
    case 'seesaw': return buildSeesaw(g, w, d);
    case 'goal': {
      // 足球門：開口朝 +x，白色門框、網子往後收
      const h = o.h ?? 2;
      const white = mat(0xf8fafc);
      for (const sz of [-1, 1]) {
        g.add(cyl(0.05, 0.05, h, white, w / 2, h / 2, sz * (d / 2), 8));
        // 側邊斜桿：從後柱頂（-x，0.6h）接到門框頂（+x，h）
        const back = cyl(0.03, 0.03, Math.hypot(w, h * 0.4), white, 0, h * 0.8, sz * (d / 2), 6);
        back.rotation.z = Math.atan2(-w, h * 0.4);
        g.add(back);
        g.add(cyl(0.03, 0.03, h * 0.6, white, -w / 2, h * 0.3, sz * (d / 2), 6));
      }
      const top = cyl(0.05, 0.05, d, white, w / 2, h, 0, 8);
      top.rotation.x = Math.PI / 2;
      g.add(top);
      const ground = cyl(0.03, 0.03, d, white, -w / 2, 0.03, 0, 6);
      ground.rotation.x = Math.PI / 2;
      g.add(ground);
      const net = texMat(netTexture(), { transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const netGeo = metricUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0.25, 0.25);
      const netBox = new THREE.Mesh(netGeo, [mat(0, { visible: false }), net, net, mat(0, { visible: false }), net, net]);
      netBox.position.y = h / 2;
      g.add(netBox);
      return h;
    }
    case 'hoop': {
      // 固定式籃球架：藍色柱子在後（-x），籃板朝 +x
      const h = o.h ?? 3.05;
      const blue = mat(0x1d4ed8);
      const px = -w / 2 + 0.1;
      g.add(cyl(0.09, 0.11, h + 0.9, blue, px, (h + 0.9) / 2, 0, 10));
      const arm = box(0.9, 0.1, 0.1, blue, px + 0.45, h + 0.6, 0);
      g.add(arm);
      g.add(box(0.05, 1.05, d, mat(0xf8fafc), px + 0.9, h + 0.45, 0));
      g.add(box(0.06, 0.45, 0.59, mat(0xdc2626), px + 0.92, h + 0.4, 0));
      g.add(box(0.07, 0.38, 0.5, mat(0xf8fafc), px + 0.93, h + 0.42, 0));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20).rotateX(Math.PI / 2), mat(0xf97316));
      rim.position.set(px + 1.18, h, 0);
      g.add(rim);
      return h + 1;
    }
    case 'banners': {
      // 山牆上的紅色布條（素面，不寫字），面向 -x
      const n = o.count ?? 4;
      const bw = (d - (n - 1) * 0.2) / n;
      const len = 3.4;
      for (let i = 0; i < n; i++) {
        const z = -d / 2 + bw / 2 + i * (bw + 0.2);
        g.add(box(0.03, len, bw, mat(i % 2 ? 0xd62839 : 0xc81e3a), 0, (o.h ?? 7.6) - len / 2, z));
        g.add(box(0.035, len - 0.3, bw - 0.25, mat(0xe8475c), -0.005, (o.h ?? 7.6) - len / 2, z));
      }
      return o.h ?? 7.6;
    }
    case 'plaque': {
      const h = o.h ?? 2.6;
      const ph = 1.5;
      const face = texMat(plaqueTexture());
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, ph, d), [mat(0x111111), face, mat(0x111111), mat(0x111111), mat(0x111111), mat(0x111111)]);
      m.position.y = h - ph / 2;
      g.add(m);
      return h;
    }
    case 'center': return buildCommunityCenter(g, o, w, d);
    case 'ditch': {
      // 巷子北側的水溝：深色溝槽＋兩側水泥邊
      g.add(flat(w, Math.max(0.2, d - 0.16), mat(0x3f4447), 0.012));
      for (const sz of [-1, 1]) g.add(box(w, 0.06, 0.08, mat(0xb8b5ad), 0, 0.03, sz * (d / 2 - 0.04)));
      return 0.3;
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

// 東平里民活動中心（街景）：兩層樓、灰白小磁磚牆、紅瓦雙斜屋頂（屋脊沿巷子）。
// 正面朝巷子（-z），前面留 1.8 m 放戶外樓梯：從東往西爬上二樓，上方是彎弧形鐵皮雨遮。
function buildCommunityCenter(g, o, w, d) {
  const h = o.h ?? 6.8;
  const floorH = 3.3;
  const stairW = 1.8;
  const dw = d - stairW; // 建物本體深度
  const cz = stairW / 2; // 本體中心（往後讓出樓梯）
  const front = -d / 2 + stairW;
  const wall = texMat(centerFacadeTexture(floorH));
  const gray = mat(0xa9adad);
  const body = new THREE.Mesh(metricUV(new THREE.BoxGeometry(w, h, dw), w, h, dw, BAY_W, floorH), [wall, wall, gray, gray, wall, wall]);
  body.position.set(0, h / 2, cz);
  g.add(body);
  const roof = gableRoof(w + 1, dw + 1, 2.0, false, [mat(0xd9dcdc), mat(0xc4553c, { side: THREE.DoubleSide })]);
  roof.position.set(0, h, cz);
  g.add(roof);
  g.add(box(w + 1.2, 0.18, 0.5, gray, 0, floorH + 0.1, front - 0.25)); // 二樓樓板外緣（雨遮）
  g.add(box(1.6, 2.3, 0.06, mat(0x2b2f33), -w / 2 + 9.5, 1.15, front - 0.03)); // 一樓大門

  // 戶外樓梯：底在東、頂在西（二樓平台在最西端）
  const top = floorH + 0.2;
  const steps = 19;
  const tread = 0.28;
  const run = steps * tread;
  const x0 = -w / 2 + 0.3; // 平台西緣
  const landing = 2.0;
  const sz = -d / 2 + stairW / 2;
  const stepMat = mat(0xb9b6ae);
  g.add(box(landing, 0.2, stairW - 0.2, stepMat, x0 + landing / 2, top - 0.1, sz));
  g.add(box(0.3, top - 0.2, 0.3, gray, x0 + 0.2, (top - 0.2) / 2, sz - stairW / 2 + 0.3));
  for (let i = 0; i < steps; i++) {
    const sh = (top * (i + 1)) / steps;
    g.add(box(tread, sh, stairW - 0.2, stepMat, x0 + landing + run - (i + 0.5) * tread, sh / 2, sz));
  }
  const slope = Math.atan2(top, run);
  const len = Math.hypot(run, top);
  const midX = x0 + landing + run / 2;
  const rail = box(len, 0.06, 0.06, mat(0x9ca3af), midX, top / 2 + 0.95, -d / 2 + 0.12);
  rail.rotation.z = -slope;
  g.add(rail);
  // 半圓形鐵皮雨遮，順著樓梯斜度
  const canopyGeo = new THREE.CylinderGeometry(0.95, 0.95, len + 1.2, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, mat(0x8f969a, { side: THREE.DoubleSide }));
  canopy.position.set(midX - 0.4, top / 2 + 2.3, sz);
  canopy.rotation.z = -slope;
  g.add(canopy);

  // 直式紅底金字木牌
  for (const [text, x, y, pw] of [['東平里活動中心', -w / 2 + 11.2, floorH + 1.7, 0.42], ['東平里集會所', -w / 2 + 8.3, 1.8, 0.36]]) {
    const n = [...text].length;
    const ph = (pw * (40 + n * 52)) / 64;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), texMat(verticalPlateTexture(text)));
    plate.rotation.y = Math.PI;
    plate.position.set(x, y, front - 0.04);
    g.add(plate);
  }
  shadowAll(g);
  return h + 2;
}

// 太平樹屋（照片：從操場看，東側是三角屋頂小屋、西側是有欄杆的平台，
// 下方紅邊綠內、藍邊橘內兩個大涵管，最西邊是竹編屏風與樓梯）
function buildTreehouse(g, o, w, d) {
  const h = o.h ?? 5;
  const wood = mat(0x5c4a3d);
  const woodLight = mat(0x6e5847);
  const deckY = 2.3;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.2, deckY, 0.2, wood, sx * (w / 2 - 0.15), deckY / 2, sz * (d / 2 - 0.15)));
  }
  g.add(box(w, 0.2, d, woodLight, 0, deckY, 0));

  // 兩個涵管（軸向沿 z，從操場這側看得到管口）
  const r = Math.min(1.05, (deckY - 0.15) / 2);
  const L = Math.min(2.6, d * 0.55);
  const cz = -d / 2 + L / 2 + 0.1;
  const concrete = mat(0xd8d2c4);
  [[0.22, 0xd62828, 0x5cbf4a], [-0.08, 0x1d4ed8, 0xe08a3c]].forEach(([fx, rim, inner]) => {
    const x = fx * w;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 24, 1, true).rotateX(Math.PI / 2), concrete);
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.12, r - 0.12, L, 24, 1, true).rotateX(Math.PI / 2), mat(inner, { side: THREE.BackSide }));
    for (const m of [outer, inside]) {
      m.position.set(x, r, cz);
      m.castShadow = true;
      g.add(m);
    }
    for (const e of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 24), mat(rim, { side: THREE.DoubleSide }));
      ring.position.set(x, r, cz + (e * L) / 2);
      g.add(ring);
    }
    g.add(box(1.3, 0.06, L, mat(0x6b5a4b), x, 0.32, cz)); // 管內木地板
  });

  // 最西邊：竹編屏風
  g.add(box(1.1, deckY - 0.2, 0.06, mat(0xc8a46a), -w / 2 + 0.7, (deckY - 0.2) / 2, -d / 2 + 0.3));
  for (let i = 0; i < 8; i++) g.add(box(0.03, deckY - 0.2, 0.08, mat(0xa98450), -w / 2 + 0.2 + i * 0.14, (deckY - 0.2) / 2, -d / 2 + 0.3));

  // 東側三角屋頂小屋（前面山牆掛「太平樹屋」木牌），屋頂斜木在頂端交叉
  const ax = w / 4 + 0.15;
  const aw = w / 2 - 0.4;
  const ad = d * 0.65;
  const az = -d / 2 + ad / 2 + 0.05;
  const ah = Math.min(2.8, h - deckY + 0.6);
  const aframe = gableRoof(aw, ad, ah, true, [mat(0x4a3b30), mat(0x55606a, { side: THREE.DoubleSide })]);
  aframe.position.set(ax, deckY + 0.1, az);
  g.add(aframe);
  // 從屋簷沿斜面往上，超過屋脊 0.7 m，兩根在頂端交叉成 X
  const slopeLen = Math.hypot(ah, aw / 2);
  for (const sx of [-1, 1]) {
    const ux = (-sx * aw) / 2 / slopeLen;
    const uy = ah / slopeLen;
    const len = slopeLen + 0.7;
    const ex = ax + (sx * aw) / 2;
    const ey = deckY + 0.1;
    const rafter = box(0.12, len, 0.12, wood, ex + (ux * len) / 2, ey + (uy * len) / 2, az - ad / 2 - 0.08);
    rafter.rotation.z = Math.atan2(-ux, uy);
    g.add(rafter);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.32), texMat(plateTexture('太平樹屋', '#3a2e26', '#f8fafc')));
  plate.position.set(ax, deckY + 0.75, az - ad / 2 - 0.02);
  plate.rotation.y = Math.PI;
  g.add(plate);

  // 西側平台欄杆（前方與西側）
  const railH = 1.0;
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const grp = new THREE.Group();
    grp.position.set(x0, deckY + 0.1, z0);
    grp.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    grp.add(box(len, 0.08, 0.08, wood, len / 2, railH, 0));
    const n = Math.max(2, Math.round(len / 0.3));
    for (let i = 0; i <= n; i++) grp.add(box(0.05, railH, 0.05, woodLight, (i * len) / n, railH / 2, 0));
    g.add(grp);
  };
  rail(-w / 2 + 0.05, -d / 2 + 0.05, ax - aw / 2, -d / 2 + 0.05);
  rail(-w / 2 + 0.05, -d / 2 + 0.05, -w / 2 + 0.05, d / 2 - 0.05);
  rail(-w / 2 + 0.05, d / 2 - 0.05, w / 2 - 0.05, d / 2 - 0.05);
  shadowAll(g);
  return h;
}

// 鞦韆：兩個深灰色拱形（倒 U）架並排，西邊一格一般座椅、東邊一格鳥巢鞦韆
function buildSwing(g, o, w, d) {
  const h = o.h ?? 2.6;
  const steel = mat(0x3b4148);
  const rc = 0.45; // 轉角圓弧半徑
  const bay = w / 2;
  for (let b = 0; b < 2; b++) {
    const x0 = -w / 2 + b * bay + 0.15;
    const x1 = x0 + bay - 0.3;
    for (const x of [x0, x1]) g.add(cyl(0.07, 0.07, h - rc, steel, x, (h - rc) / 2, 0, 10));
    const beam = cyl(0.07, 0.07, x1 - x0 - rc * 2, steel, (x0 + x1) / 2, h, 0, 10);
    beam.rotation.z = Math.PI / 2;
    g.add(beam);
    for (const [x, start] of [[x0 + rc, Math.PI / 2], [x1 - rc, 0]]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(rc, 0.07, 6, 10, Math.PI / 2), steel);
      arc.rotation.z = start;
      arc.position.set(x, h - rc, 0);
      g.add(arc);
    }
    const cx = (x0 + x1) / 2;
    const chain = mat(0x6b7280);
    if (b === 0) {
      for (const sx of [-0.25, 0.25]) g.add(cyl(0.012, 0.012, h - 0.55, chain, cx + sx, (h + 0.55) / 2, 0, 4));
      g.add(box(0.6, 0.05, 0.22, mat(0x111827), cx, 0.52, 0));
    } else {
      for (const [sx, sz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
        const rope = cyl(0.012, 0.012, h - 0.6, chain, cx + sx * 0.5, (h + 0.6) / 2, sz * 0.5, 4);
        g.add(rope);
      }
      const nest = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 24).rotateX(Math.PI / 2), mat(0x111827));
      nest.position.set(cx, 0.6, 0);
      g.add(nest);
      g.add(cyl(0.48, 0.48, 0.03, mat(0x1f2937), cx, 0.6, 0, 20));
    }
  }
  // 兩格之間的連接橫桿
  const link = cyl(0.07, 0.07, 0.3, steel, -w / 2 + bay, h, 0, 8);
  link.rotation.z = Math.PI / 2;
  g.add(link);
  shadowAll(g);
  return h;
}

// 四人翹翹板：灰色長框＋兩端座板，四角是彩色動物造型木板
function buildSeesaw(g, w, d) {
  const gray = mat(0x9ca3af);
  g.add(cyl(0.18, 0.2, 0.45, mat(0x111827), -0.25, 0.22, 0, 10));
  g.add(cyl(0.18, 0.2, 0.45, mat(0x111827), 0.25, 0.22, 0, 10));
  const frame = new THREE.Group();
  frame.position.y = 0.5;
  frame.rotation.z = 0.06;
  for (const sz of [-1, 1]) frame.add(box(w, 0.08, 0.08, gray, 0, 0, sz * 0.45));
  frame.add(box(1.0, 0.04, 0.9, mat(0xa1a1aa), 0, 0.03, 0));
  for (const sx of [-1, 1]) {
    frame.add(box(0.45, 0.06, d, mat(0x9ca3af), sx * (w / 2 - 0.25), 0.05, 0));
    const handle = cyl(0.025, 0.025, d * 0.8, mat(0xd1d5db), sx * (w / 2 - 0.75), 0.45, 0, 6);
    handle.rotation.x = Math.PI / 2;
    frame.add(handle);
  }
  // 四角造型板：紅（高）、黃（圓）、藍（圓）、黑（齒輪）
  const panels = [[-1, -1, 0xef4444, 'tall'], [-1, 1, 0xfacc15, 'round'], [1, -1, 0x2563eb, 'round'], [1, 1, 0x111827, 'gear']];
  for (const [sx, sz, color, shape] of panels) {
    const s = new THREE.Shape();
    if (shape === 'tall') {
      s.moveTo(-0.25, 0);
      s.lineTo(0.25, 0);
      s.lineTo(0.25, 0.7);
      s.quadraticCurveTo(0, 0.95, -0.25, 0.7);
    } else if (shape === 'gear') {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const rr = i % 2 ? 0.32 : 0.38;
        s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, 0.45 + Math.sin(a) * rr);
      }
    } else {
      s.absarc(0, 0.42, 0.34, 0, Math.PI * 2, false);
    }
    // 板子沿著長框兩側立起來（板面朝 ±z）
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(sx * (w / 2 - 0.3), 0.05, sz * 0.5);
    frame.add(m);
  }
  g.add(frame);
  shadowAll(g);
  return 1.4;
}
