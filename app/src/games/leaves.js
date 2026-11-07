// 叔公的吹落葉：90 秒內用吹葉機把操場內場的落葉吹進中間的防水布。
// 障礙：跑來跑去的同學（撞到會暫停）、水窪（走不快）、偶爾起風（落葉被吹散）。
import * as THREE from 'three';
import { createGameUi, awardEgg } from './common.js';

const TIME = 100;
const TOTAL = 70;
const GOAL = 30;
const BOUND = { x: 13.2, z: 8.8 }; // 球門之間的內場
const TARP = 2.1; // 防水布半邊長
const REACH = 4; // 吹葉機吹得到的距離
const CONE = Math.cos(THREE.MathUtils.degToRad(45));
const PUDDLES = [{ x: -7, z: 4.5, r: 1.5 }, { x: 6.5, z: -4.8, r: 1.6 }, { x: 8.5, z: 5.2, r: 1.2 }];
const LEAF_COLORS = [0xd9822b, 0xc9532c, 0xe0b23a, 0x9c6b30, 0xb8742a];

export function startGame({ scene, walk, enterWalk, hud, createCharacter }) {
  const ui = createGameUi({ icon: '🍂', title: '叔公的吹落葉' });
  const root = new THREE.Group();
  scene.add(root);

  // 防水布＋四角的石頭
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(TARP * 2, TARP * 2).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2f7fd0 }));
  tarp.position.y = 0.1;
  tarp.receiveShadow = true;
  root.add(tarp);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
    rock.position.set(sx * TARP, 0.14, sz * TARP);
    root.add(rock);
  }

  // 水窪
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x7fb6d8, transparent: true, opacity: 0.75, depthWrite: false });
  for (const p of PUDDLES) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28).rotateX(-Math.PI / 2), puddleMat);
    m.position.set(p.x, 0.1, p.z);
    m.scale.set(1, 1, 0.75);
    m.renderOrder = 8;
    root.add(m);
  }

  // 落葉：一個 InstancedMesh，每片自己記位置、速度
  const leafGeo = new THREE.CircleGeometry(0.16, 7).rotateX(-Math.PI / 2).scale(1, 1, 0.55);
  const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), TOTAL);
  leafMesh.renderOrder = 9;
  root.add(leafMesh);
  const color = new THREE.Color();
  for (let i = 0; i < TOTAL; i++) leafMesh.setColorAt(i, color.setHex(LEAF_COLORS[i % LEAF_COLORS.length]));
  const leaves = Array.from({ length: TOTAL }, () => ({ x: 0, z: 0, vx: 0, vz: 0, rot: 0, spin: 0, y: 0, done: 0, gone: false }));

  // 吹葉機的風：前方一圈半透明的扇形
  const wind = new THREE.Mesh(
    new THREE.CircleGeometry(REACH, 24, -Math.acos(CONE), Math.acos(CONE) * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  wind.renderOrder = 9;
  root.add(wind);

  // 跑來跑去的同學：繞著不同大小的橢圓跑
  const kids = [
    { kind: 'boy', rx: 9.5, rz: 5.5, cx: 0, cz: 0, w: 0.42, a: 0 },
    { kind: 'girl', rx: 5, rz: 6.5, cx: -6, cz: 0, w: -0.6, a: 2 },
    { kind: 'boy', rx: 4.5, rz: 3.5, cx: 7, cz: 1, w: 0.75, a: 4 },
  ].map((k) => {
    const c = createCharacter(k.kind);
    c.root.traverse((o) => { if (o.geometry?.type === 'RingGeometry') o.visible = false; });
    root.add(c.root);
    return { ...k, c, x: 0, z: 0 };
  });

  const tmp = new THREE.Object3D();
  let state = 'intro';
  let timeLeft = TIME;
  let score = 0;
  let stun = 0;
  let hitCooldown = 0;
  let gust = null;
  let nextGust = 0;
  let inPuddle = false;
  let playStart = 0;

  walk.setSpeedMul(() => (state !== 'play' || stun > 0 ? 0 : inPuddle ? 0.6 : 1.5)); // 拿著吹葉機走快一點，遊戲節奏才不會拖

  // 按住才吹：空白鍵，或手機右下角的「吹」鍵（左下是搖桿）
  let blowHeld = false;
  const blowBtn = ui.button('🍃 吹', 'game-key blow', () => {});
  blowBtn.hidden = true;
  blowBtn.setAttribute('aria-label', '按住吹落葉');
  document.body.append(blowBtn);
  const hold = (on) => (e) => { e.preventDefault(); blowHeld = on; blowBtn.classList.toggle('hit', on); };
  blowBtn.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) blowBtn.addEventListener(ev, hold(false));
  addEventListener('keydown', (e) => { if (e.key === ' ' && state === 'play') { e.preventDefault(); blowHeld = true; } });
  addEventListener('keyup', (e) => { if (e.key === ' ') blowHeld = false; });
  addEventListener('blur', () => (blowHeld = false));

  function scatter() {
    for (const l of leaves) {
      do {
        l.x = (Math.random() * 2 - 1) * (BOUND.x - 0.5);
        l.z = (Math.random() * 2 - 1) * (BOUND.z - 0.5);
      } while (Math.abs(l.x) < TARP + 2.2 && Math.abs(l.z) < TARP + 2.2);
      Object.assign(l, { vx: 0, vz: 0, rot: Math.random() * 6.3, spin: 0, y: 0.11, done: 0, gone: false });
    }
  }

  function reset() {
    scatter();
    score = 0;
    timeLeft = TIME;
    stun = 0;
    gust = null;
    nextGust = 18 + Math.random() * 6;
    enterWalk();
    walk.cancel();
    walk.teleport({ x: -10, y: 0, z: 6.5 }, { x: 0, z: 0 });
    ui.setStat('time', '時間', `${TIME}`);
    ui.setStat('score', '落葉', `0／${GOAL}`);
  }

  async function begin() {
    reset();
    state = 'intro';
    await ui.intro({
      lead: '叔公說：「落葉又掉滿地了！幫我把操場上的落葉吹進中間的藍色防水布。」',
      rules: [
        `${TIME} 秒內吹進 ${GOAL} 片落葉就過關。`,
        window.matchMedia('(pointer: coarse)').matches ? '用左下搖桿走路，按住右下「吹」鍵吹你面前的落葉。' : 'WASD／方向鍵走路（Shift 跑步），按住空白鍵吹你面前的落葉。',
        '訣竅：先繞到落葉外側，再一邊吹一邊往防水布走。',
        '小心跑來跑去的同學，撞到會停下來道歉；踩到水窪會走不快。',
        '偶爾會起風，把落葉吹散！',
      ],
    });
    state = 'play';
    blowBtn.hidden = false;
    playStart = performance.now();
    ui.flash('開始！', 700);
  }

  function finish() {
    state = 'over';
    blowBtn.hidden = true;
    blowHeld = false;
    const win = score >= GOAL;
    const egg = win && awardEgg('uncle-toolbox');
    const used = Math.round((performance.now() - playStart) / 1000);
    ui.result({
      win,
      heading: win ? '操場變乾淨了！' : `還差 ${GOAL - score} 片`,
      lines: win
        ? [`你在 ${used} 秒內吹進了 ${score} 片落葉。叔公說：「多虧有你，謝謝啦！」`]
        : [`時間到，吹進了 ${score} 片。把落葉集中成一堆再一起推過去，會快很多喔！`],
      egg,
      onRetry: begin,
    });
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const p = walk.position;
    const h = walk.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    wind.position.set(p.x, 0.12, p.z);
    wind.rotation.y = h - Math.PI / 2;
    wind.visible = state === 'play' && blowHeld && stun === 0;
    wind.material.opacity = 0.12 + Math.sin(performance.now() / 90) * 0.05;

    // 同學跑步
    for (const k of kids) {
      if (state === 'play') k.a += k.w * dt;
      const x = k.cx + Math.cos(k.a) * k.rx;
      const z = k.cz + Math.sin(k.a) * k.rz;
      const spd = Math.hypot(x - k.x, z - k.z) / dt;
      k.c.root.rotation.y = Math.atan2(x - k.x, z - k.z);
      k.x = x;
      k.z = z;
      k.c.root.position.set(x, 0, z);
      k.c.animate(state === 'play' ? spd : 0, dt);
    }

    if (state !== 'play') return render();

    timeLeft -= dt;
    stun = Math.max(0, stun - dt);
    hitCooldown = Math.max(0, hitCooldown - dt);
    ui.setStat('time', '時間', `${Math.max(0, Math.ceil(timeLeft))}`);

    // 水窪
    const wet = PUDDLES.some((q) => Math.hypot((p.x - q.x), (p.z - q.z) / 0.75) < q.r);
    if (wet && !inPuddle) hud.toast('💧 踩到水窪，走不快！');
    inPuddle = wet;

    // 撞到同學
    if (!hitCooldown && kids.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < 0.85)) {
      stun = 1.2;
      hitCooldown = 2.5;
      hud.toast('😵 撞到同學了！先停下來說對不起');
      // 撞到的那一下，旁邊的落葉被踢散
      for (const l of leaves) {
        if (!l.gone && Math.hypot(l.x - p.x, l.z - p.z) < 2) {
          l.vx += (Math.random() - 0.5) * 6;
          l.vz += (Math.random() - 0.5) * 6;
        }
      }
    }

    // 起風
    nextGust -= dt;
    if (nextGust <= 0 && !gust) {
      const a = Math.random() * Math.PI * 2;
      gust = { x: Math.cos(a), z: Math.sin(a), t: 1.6 };
      hud.toast('🍃 起風了！落葉被吹散了');
    }
    if (gust) {
      gust.t -= dt;
      if (gust.t <= 0) {
        gust = null;
        nextGust = 16 + Math.random() * 8;
      }
    }

    // 落葉物理
    const blowing = stun === 0 && blowHeld;
    for (const l of leaves) {
      if (l.gone) continue;
      if (l.done) {
        l.done += dt; // 進防水布：往中間收、慢慢沉下去
        l.x *= 1 - dt * 2;
        l.z *= 1 - dt * 2;
        if (l.done > 0.8) l.gone = true;
        continue;
      }
      const dx = l.x - p.x;
      const dz = l.z - p.z;
      const d = Math.hypot(dx, dz);
      if (blowing && d < REACH && d > 0.01 && (dx * fx + dz * fz) / d > CONE) {
        const f = 13 * (1 - d / REACH) + 4;
        // 往正前方吹，偏到旁邊的往中線收：落葉會在前面聚成一堆
        const ahead = dx * fx + dz * fz;
        const px = dx - ahead * fx;
        const pz = dz - ahead * fz;
        l.vx += (fx * f - px * 3) * dt;
        l.vz += (fz * f - pz * 3) * dt;
        l.spin = 8;
      }
      // 防水布附近有一點吸力（落葉滑進布裡）
      if (d > 0 && Math.hypot(l.x, l.z) < TARP + 1.6) {
        const c = Math.hypot(l.x, l.z);
        l.vx -= (l.x / c) * 2.2 * dt;
        l.vz -= (l.z / c) * 2.2 * dt;
      }
      if (gust) {
        l.vx += gust.x * 5 * dt;
        l.vz += gust.z * 5 * dt;
        l.spin = 6;
      }
      const drag = Math.exp(-2.6 * dt);
      l.vx *= drag;
      l.vz *= drag;
      l.spin *= drag;
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      l.rot += l.spin * dt;
      // 內場邊緣（球門、跑道）擋住，反彈回來
      if (Math.abs(l.x) > BOUND.x) { l.x = Math.sign(l.x) * BOUND.x; l.vx *= -0.4; }
      if (Math.abs(l.z) > BOUND.z) { l.z = Math.sign(l.z) * BOUND.z; l.vz *= -0.4; }
      const sp = Math.hypot(l.vx, l.vz);
      l.y = 0.11 + Math.min(0.5, sp * 0.08);
      if (Math.abs(l.x) < TARP && Math.abs(l.z) < TARP) { // 碰到防水布就算接住
        l.done = 0.001;
        score++;
        ui.setStat('score', '落葉', `${score}／${GOAL}`);
        if (score === GOAL) ui.flash('過關目標達成！', 1100, 'good');
      }
    }

    if (timeLeft <= 0 || score >= TOTAL) finish();
    render();
  }

  function render() {
    for (let i = 0; i < TOTAL; i++) {
      const l = leaves[i];
      tmp.position.set(l.x, l.gone ? -5 : l.done ? 0.11 - l.done * 0.12 : l.y, l.z);
      tmp.rotation.set(Math.sin(l.rot) * 0.4, l.rot, 0);
      tmp.scale.setScalar(l.done ? 1 - l.done : 1);
      tmp.updateMatrix();
      leafMesh.setMatrixAt(i, tmp.matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
  }

  begin();
  return { update, blockPick: true };
}
