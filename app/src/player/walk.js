// 走路模式：人物移動（搖桿／鍵盤／點地面／沿路線自動走）、碰撞、第三人稱鏡頭跟隨。
import * as THREE from 'three';
import { createCharacter } from './character.js';

const RADIUS = 0.3; // 人物碰撞半徑
const EYE = 1.1; // 鏡頭看向人物的高度
const WALK = 1.8; // 公尺／秒
const RUN = 3.6;
const START = { x: -50, z: -1, heading: Math.PI / 2 }; // 正門進來，面向操場
const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

// onLevelChange(level)：'all'＝在戶外、1／2＝在室內的第幾層（給自動切換樓層剖面用）
export function createWalk({ scene, camera, controls, collision, joystick, onLevelChange }) {
  let kind = 'boy';
  let char = createCharacter(kind);
  const pos = new THREE.Vector3(START.x, 0, START.z);
  let heading = START.heading;
  let target = null; // 點地面直接走去的點（找不到路線時的備案）
  let path = null; // 沿路線自動走：{ points, i, opts }
  let stuck = 0;
  let level = 'all';
  let active = false;
  const keys = new Set();

  const isTyping = e => e.target.matches?.('input, textarea, select');
  window.addEventListener('keydown', e => {
    if (!active || isTyping(e)) return;
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.includes(k) || k === 'shift') {
      keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function placeCamera() {
    const look = new THREE.Vector3(pos.x, pos.y + EYE, pos.z);
    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    controls.target.copy(look);
    camera.position.copy(look).addScaledVector(back, 4.4).add(new THREE.Vector3(0, 1.7, 0));
    // 先關掉慣性再更新一次，清掉之前拖曳留下的旋轉速度，避免瞬移後鏡頭亂甩
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }

  function updateLevel(force = false) {
    const next = collision.underRoof(pos.x, pos.z) ? collision.floorOf(pos.y) : 'all';
    if (next !== level || force) {
      level = next;
      onLevelChange?.(level);
    }
  }

  function enter() {
    active = true;
    pos.y = collision.heightAt(pos.x, pos.z, pos.y);
    scene.add(char.root);
    syncChar();
    placeCamera();
    updateLevel(true);
  }

  function exit() {
    active = false;
    keys.clear();
    target = null;
    cancel();
    scene.remove(char.root);
  }

  // 直接把人物放到某處（例如疏散演練從教室門口出發）
  function teleport(p, toward) {
    pos.set(p.x, p.y, p.z);
    if (toward) heading = Math.atan2(toward.x - p.x, toward.z - p.z);
    target = null;
    syncChar();
    placeCamera();
    updateLevel(true);
  }

  function setKind(next) {
    if (next === kind) return;
    kind = next;
    const inScene = !!char.root.parent;
    if (inScene) scene.remove(char.root);
    char = createCharacter(kind);
    if (inScene) scene.add(char.root);
    syncChar();
  }

  function syncChar() {
    char.root.position.copy(pos);
    char.root.rotation.y = heading;
  }

  function setTarget(x, z) {
    cancel();
    target = new THREE.Vector2(x, z);
    stuck = 0;
  }

  // 沿路線走。opts：speed、cam（鏡頭自動轉到背後）、paused()、mul()、onProgress(剩餘公尺)、onDone()、onCancel(原因)
  function follow(points, opts = {}) {
    cancel();
    target = null;
    path = { points, i: 1, opts };
    stuck = 0;
  }

  function cancel(reason = 'replaced') {
    if (!path) return;
    const { opts } = path;
    path = null;
    opts.onCancel?.(reason);
  }

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const offset = new THREE.Vector3();

  function remaining() {
    const { points, i } = path;
    let d = Math.hypot(points[i].x - pos.x, points[i].z - pos.z);
    for (let k = i; k < points.length - 1; k++) {
      d += Math.hypot(points[k + 1].x - points[k].x, points[k + 1].z - points[k].z, points[k + 1].y - points[k].y);
    }
    return d;
  }

  function update(dt) {
    if (!active) return;
    dt = Math.min(dt, 0.05);

    // 以鏡頭方向為準：搖桿往上＝往畫面前方走
    fwd.copy(controls.target).sub(camera.position).setY(0).normalize();
    right.set(-fwd.z, 0, fwd.x);
    let ix = joystick.x;
    let iy = joystick.y;
    if (keys.has('w') || keys.has('arrowup')) iy += 1;
    if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    move.copy(fwd).multiplyScalar(iy).addScaledVector(right, ix);
    const mag = Math.min(1, move.length());
    let speed = 0;
    if (mag > 0.05) {
      // 自己操作就取消自動行走
      target = null;
      cancel('manual');
      move.normalize();
      speed = joystick.active ? mag * RUN : keys.has('shift') ? RUN : WALK;
    } else if (path) {
      const p = path.points[path.i];
      move.set(p.x - pos.x, 0, p.z - pos.z);
      if (move.length() < 0.35) {
        path.i++;
        if (path.i >= path.points.length) {
          const { opts } = path;
          path = null;
          opts.onDone?.();
        }
      } else {
        move.normalize();
        speed = path.opts.paused?.() ? 0 : (path.opts.speed ?? WALK) * (path.opts.mul?.() ?? 1);
      }
      if (path) path.opts.onProgress?.(remaining());
    } else if (target) {
      move.set(target.x - pos.x, 0, target.y - pos.z);
      const dist = move.length();
      if (dist < 0.25) target = null;
      else {
        move.normalize();
        speed = Math.min(WALK * 1.2, dist * 3);
      }
    }

    let actual = 0;
    if (speed > 0) {
      const step = speed * dt;
      const r = collision.move(pos.x, pos.z, pos.y, pos.x + move.x * step, pos.z + move.z * step, RADIUS);
      actual = Math.hypot(r.x - pos.x, r.z - pos.z) / dt;
      pos.x = r.x;
      pos.z = r.z;
      pos.y += (r.y - pos.y) * Math.min(1, dt * 20);
      // 面向移動方向（取最短轉向）
      const want = Math.atan2(move.x, move.z);
      const diff = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
      heading += diff * Math.min(1, dt * 12);
      // 卡住太久就停下
      stuck = actual < speed * 0.25 ? stuck + dt : 0;
      if (stuck > 1.2) {
        target = null;
        cancel('stuck');
        stuck = 0;
      }
    } else {
      pos.y += (collision.heightAt(pos.x, pos.z, pos.y) - pos.y) * Math.min(1, dt * 20);
    }
    syncChar();
    char.animate(actual, dt);

    // 鏡頭跟著人物平移（保留使用者轉好的角度與距離）
    const look = new THREE.Vector3(pos.x, pos.y + EYE, pos.z);
    camera.position.add(look.clone().sub(controls.target));
    controls.target.copy(look);
    // 自動行走時，鏡頭慢慢轉到人物背後
    if (path?.opts.cam && actual > 0.1) {
      offset.copy(camera.position).sub(look);
      const cur = Math.atan2(offset.x, offset.z);
      const want = heading + Math.PI;
      const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      const a = cur + d * Math.min(1, dt * 1.8);
      const flat = Math.hypot(offset.x, offset.z);
      camera.position.set(look.x + Math.sin(a) * flat, camera.position.y, look.z + Math.cos(a) * flat);
    }

    updateLevel();
  }

  return {
    enter,
    exit,
    update,
    setKind,
    setTarget,
    follow,
    cancel,
    teleport,
    placeCamera,
    get position() {
      return pos;
    },
    get active() {
      return active;
    },
    get following() {
      return !!path;
    },
  };
}
