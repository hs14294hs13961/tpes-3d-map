// 方塊造型小學生（身高約 1.3 m），男孩／女孩兩款，走路時擺手擺腳。
// 人物面向局部 +z。
import * as THREE from 'three';

const SKIN = 0xf2c9a0;
const HAIR = 0x2b2118;

function part(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// 以「關節」為原點的肢體：子物件往下長，旋轉 pivot 就是擺動
function limb(w, h, d, color, x, y, extra) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(part(w, h, d, color, 0, -h / 2, 0));
  if (extra) pivot.add(extra);
  return pivot;
}

export function createCharacter(kind = 'boy') {
  const root = new THREE.Group();
  const body = new THREE.Group(); // 走路時上下彈跳
  root.add(body);

  const girl = kind === 'girl';
  const shirt = 0xf8fafc;
  const bottom = girl ? 0xb91c1c : 0x1e3a8a;

  // 腿與鞋
  const shoe = () => part(0.16, 0.08, 0.24, 0x1f2937, 0, -0.58, 0.03);
  const legL = limb(0.14, 0.55, 0.16, girl ? SKIN : bottom, -0.1, 0.6, shoe());
  const legR = limb(0.14, 0.55, 0.16, girl ? SKIN : bottom, 0.1, 0.6, shoe());
  body.add(legL, legR);

  // 身體：白上衣、綠色領口
  body.add(part(0.42, 0.44, 0.24, shirt, 0, 0.82, 0));
  body.add(part(0.2, 0.05, 0.02, 0x0f766e, 0, 1.0, 0.125));
  if (girl) body.add(part(0.48, 0.22, 0.3, bottom, 0, 0.58, 0)); // 裙子
  else body.add(part(0.42, 0.14, 0.25, bottom, 0, 0.6, 0)); // 短褲腰

  // 手臂：短袖＋皮膚
  const armL = limb(0.11, 0.18, 0.13, shirt, -0.27, 1.02, part(0.1, 0.24, 0.11, SKIN, 0, -0.3, 0));
  const armR = limb(0.11, 0.18, 0.13, shirt, 0.27, 1.02, part(0.1, 0.24, 0.11, SKIN, 0, -0.3, 0));
  body.add(armL, armR);

  // 頭、頭髮、眼睛
  const head = new THREE.Group();
  head.position.y = 1.2;
  head.add(part(0.3, 0.3, 0.3, SKIN));
  head.add(part(0.32, 0.09, 0.32, HAIR, 0, 0.17, 0));
  head.add(part(0.32, 0.18, 0.06, HAIR, 0, 0.06, -0.14));
  if (girl) {
    head.add(part(0.3, 0.32, 0.07, HAIR, 0, -0.06, -0.16)); // 長髮
    head.add(part(0.08, 0.2, 0.08, HAIR, -0.19, -0.02, -0.08));
    head.add(part(0.08, 0.2, 0.08, HAIR, 0.19, -0.02, -0.08));
  }
  head.add(part(0.05, 0.05, 0.02, 0x111827, -0.07, 0.01, 0.151));
  head.add(part(0.05, 0.05, 0.02, 0x111827, 0.07, 0.01, 0.151));
  head.add(part(0.08, 0.025, 0.02, 0xc2410c, 0, -0.08, 0.151));
  body.add(head);

  // 腳下的光圈：遠看也找得到自己
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.85, depthWrite: false })
  );
  marker.position.y = 0.09; // 高過跑道與球場貼圖，避免閃爍
  marker.renderOrder = 9;
  root.add(marker);

  let phase = 0;
  // speed：公尺／秒
  function animate(speed, dt) {
    const amp = Math.min(1, speed / 2.5);
    if (speed > 0.05) phase += dt * (5 + speed * 2.5);
    else phase *= 0.85; // 停下時慢慢收回
    const swing = Math.sin(phase) * 0.7 * amp;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.9;
    armR.rotation.x = swing * 0.9;
    body.position.y = Math.abs(Math.sin(phase)) * 0.04 * amp;
  }

  return { root, animate };
}
