// 地上的黃色導引線＋箭頭（沿路線的每一段，上下樓梯也跟著斜）。
import * as THREE from 'three';

const LIFT = 0.14; // 高出地面一點，避免和地板閃爍
const WIDTH = 0.45;

export function createPathLine(scene) {
  const group = new THREE.Group();
  group.renderOrder = 8;
  scene.add(group);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xb45309, depthWrite: false, transparent: true, side: THREE.DoubleSide });
  // 平貼地面的三角箭頭，尖端朝 +z
  const arrowShape = new THREE.Shape([new THREE.Vector2(0, 0.32), new THREE.Vector2(0.24, -0.16), new THREE.Vector2(-0.24, -0.16)]);
  const arrowGeo = new THREE.ShapeGeometry(arrowShape).rotateX(Math.PI / 2);

  function clear() {
    for (const c of [...group.children]) {
      group.remove(c);
      if (c.geometry !== arrowGeo) c.geometry.dispose();
    }
  }

  function show(points) {
    clear();
    const up = new THREE.Vector3(0, 1, 0);
    let carry = 1.2; // 第一個箭頭的位置
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(points[i].x, points[i].y + LIFT, points[i].z);
      const b = new THREE.Vector3(points[i + 1].x, points[i + 1].y + LIFT, points[i + 1].z);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.05) continue;
      dir.normalize();
      const side = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(WIDTH / 2);
      if (side.lengthSq() === 0) side.set(WIDTH / 2, 0, 0);
      const p = [a.clone().add(side), a.clone().sub(side), b.clone().add(side), b.clone().sub(side)];
      const geo = new THREE.BufferGeometry().setFromPoints([p[0], p[1], p[2], p[1], p[3], p[2]]);
      const strip = new THREE.Mesh(geo, lineMat);
      strip.renderOrder = 8;
      group.add(strip);
      // 每 2.5 m 一個箭頭（間距跨段落延續）
      let t = carry;
      for (; t < len; t += 2.5) {
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.copy(a).addScaledVector(dir, t);
        arrow.position.y += 0.03;
        arrow.rotation.y = Math.atan2(dir.x, dir.z);
        arrow.renderOrder = 9;
        group.add(arrow);
      }
      carry = t - len;
    }
  }

  return { show, clear };
}
