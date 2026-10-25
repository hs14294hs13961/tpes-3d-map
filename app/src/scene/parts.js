// 建物與戶外設施共用的小工具：材質快取、方塊、地面貼片、依公尺貼圖、雙斜屋頂。
import * as THREE from 'three';

const matCache = new Map();

// 實景照片貼圖（public/textures/），同一張只載入一次
let photoLoader = null;
export function setPhotoLoader(loader) {
  photoLoader = loader;
}
export function photoMat(name) {
  const key = `photo:${name}`;
  if (!matCache.has(key)) {
    const tex = photoLoader.load(`./public/textures/${name}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    matCache.set(key, new THREE.MeshLambertMaterial({ map: tex }));
  }
  return matCache.get(key);
}

export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

// 貼圖材質（同一張貼圖＋同樣選項共用一個材質）
export function texMat(tex, opts = {}) {
  const key = `tex:${tex.uuid}:${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ map: tex, ...opts }));
  return matCache.get(key);
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function flat(w, d, material, y = 0.02) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

// 把方塊每一面的 UV 換成「公尺 ÷ 貼圖尺寸」，貼圖就會照實際大小重複。
// keep：保留原本 0～1 UV 的面（例如整面貼照片的正面），順序 +x −x +y −y +z −z
export function metricUV(geo, w, h, d, tw, th, keep = []) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    if (keep.includes(f)) continue;
    const [fw, fh] = faces[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fw) / tw, (uv.getY(k) * fh) / th);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// 雙斜屋頂（三角柱），ridgeAlongZ=true 時屋脊沿 z 方向。
// material 可以是陣列：[山牆三角形, 屋面]
export function gableRoof(w, d, rise, ridgeAlongZ, material) {
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

export function shadowAll(g) {
  g.traverse(c => {
    if (c.isMesh) c.castShadow = c.receiveShadow = true;
  });
}

// 把一個群組裡「同一種材質」的小零件合成一個物件，減少手機每格要畫的次數。
// 只合併單一材質的一般 Mesh；多材質（貼照片的面）、InstancedMesh、標籤都保留原樣。
// 群組本身（含 userData.ref、可見度設定）不變，所以點選、編輯模式、樓層切換都照常。
export function mergeStatic(container) {
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const buckets = new Map(); // material → [{ mesh, matrix }]
  container.traverse(o => {
    if (o === container || !o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    if (o.userData.keep) return;
    const list = buckets.get(o.material) || [];
    list.push(o);
    buckets.set(o.material, list);
  });
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const pos = [];
    const nor = [];
    const uv = [];
    const m4 = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    let cast = false;
    let receive = false;
    for (const mesh of meshes) {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      m4.multiplyMatrices(inv, mesh.matrixWorld);
      nm.getNormalMatrix(m4);
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m4);
        pos.push(v.x, v.y, v.z);
        if (n) v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        else v.set(0, 1, 0);
        nor.push(v.x, v.y, v.z);
        uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      }
      if (g !== mesh.geometry) g.dispose();
      mesh.geometry.dispose();
      cast ||= mesh.castShadow;
      receive ||= mesh.receiveShadow;
      mesh.removeFromParent();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const merged = new THREE.Mesh(geo, material);
    merged.castShadow = cast;
    merged.receiveShadow = receive;
    container.add(merged);
  }
}
