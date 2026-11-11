// 總務主任的接力賽：五隊在 PU 跑道第 1～5 道跑一圈，一棒跑四分之一圈；每場隨機分道。
// 左右輪流按（← → 或畫面左右兩顆鍵）讓跑者加速；進入接力區後，指針跑進綠色區時按「接棒」才能順利交棒。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { createGameUi, awardEgg } from './common.js';

const LEGS = 4;
const ZONE = 0.1; // 每一棒最後這段（佔一圈的比例，約 13 公尺）是接力區
const MAX_SPEED = 8.6; // 公尺／秒
const TAP_GAIN = 0.95;
const DECAY = 0.85;
const TEAMS = [
  { name: '太平隊', color: 0x14b8a6, me: true },
  { name: '紅隊', color: 0xe0533f, base: 5.2 },
  { name: '黃隊', color: 0xe7b416, base: 5.4 },
  { name: '藍隊', color: 0x3b82f6, base: 5.0 },
  { name: '紫隊', color: 0x8b5cf6, base: 5.1 },
];
const LANES = [0, 1, 2, 3, 4]; // 第 1～5 道（從內圈算 0 起），每場重新抽

export function startGame({ scene, camera, birdControls, data, createCharacter }) {
  const track = data.sports.find((s) => s.kind === 'track');
  const { innerRadius: R, halfStraight: HS, laneWidth: LW } = track;
  const ui = createGameUi({ icon: '🏃', title: '總務主任的接力賽' });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const root = new THREE.Group();
  scene.add(root);
  birdControls.enabled = false;

  // 跑道中心線上的位置：f＝0～1（一圈），逆時針跑。
  // 起點在共融遊戲區那一側直道的西端（地上畫有起跑線和 1～6 道的數字），所有道次從同一條線出發
  const START_X = track.startX ?? -HS;
  function lanePoint(f, lane, out = new THREE.Vector3()) {
    const r = R + LW * (lane + 0.5);
    const L = 4 * HS + 2 * Math.PI * r;
    const s0 = 2 * HS + Math.PI * r + (HS - START_X); // 起跑線在第三段（z 負向直道）上的位置
    let s = ((((f % 1) + 1) % 1) * L + s0) % L;
    const straight = 2 * HS;
    const arc = Math.PI * r;
    if (s < straight) return out.set(-HS + s, 0, r);
    s -= straight;
    if (s < arc) { const a = s / r; return out.set(HS + r * Math.sin(a), 0, r * Math.cos(a)); }
    s -= arc;
    if (s < straight) return out.set(HS - s, 0, -r);
    s -= straight;
    const a = s / r;
    return out.set(-HS - r * Math.sin(a), 0, -r * Math.cos(a));
  }
  // 進度一律用同一個圈長換算：外圈的人跑得比較遠，但大家公平（就像真的比賽有梯形起跑）
  const LAP = 4 * HS + 2 * Math.PI * (R + LW * 2);
  const laneLength = () => LAP;

  // 起跑線與每一棒的接力區（地上畫線）
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.55, depthWrite: false });
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let leg = 0; leg < LEGS; leg++) {
    for (const lane of LANES) {
      for (const [f, mat, w] of [[leg / LEGS, lineMat, 0.12], [(leg + 1) / LEGS - ZONE, zoneMat, 0.12]]) {
        lanePoint(f, lane, a);
        lanePoint(f + 0.001, lane, b);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(LW * 0.95, w).rotateX(-Math.PI / 2), mat);
        m.position.set(a.x, 0.1, a.z);
        m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        m.renderOrder = 8;
        root.add(m);
      }
    }
  }

  // 每隊四位跑者，站在各自那一棒的起點；腳下光圈換成隊伍顏色
  const batonGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 10).rotateX(Math.PI / 2);
  const teams = TEAMS.map((t, i) => {
    const lane = LANES[i];
    const runners = Array.from({ length: LEGS }, (_, k) => {
      const c = createCharacter(k % 2 ? 'girl' : 'boy');
      c.root.traverse((o) => {
        if (o.geometry?.type === 'RingGeometry') o.material = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.9, depthWrite: false });
      });
      root.add(c.root);
      return c;
    });
    const baton = new THREE.Mesh(batonGeo, new THREE.MeshLambertMaterial({ color: t.me ? 0xf59e0b : t.color }));
    baton.position.set(0.28, 0.55, 0.12);
    let tag = null;
    if (t.me) {
      const e = document.createElement('div');
      e.className = 'game-tag';
      e.textContent = '你';
      tag = new CSS2DObject(e);
      tag.position.set(0, 1.75, 0);
    }
    return { ...t, lane, runners, baton, tag, f: 0, leg: 0, speed: 0, wait: 0, done: false, time: 0, handed: false };
  });
  const me = teams[0];

  // 操作：左右輪流按
  const pad = ui.el('div', 'game-pad');
  const left = ui.button('左腳', 'game-key', () => tap('L'));
  const pass = ui.button('接棒！', 'game-key pass', () => tryPass());
  const right = ui.button('右腳', 'game-key', () => tap('R'));
  pad.append(left, pass, right);
  for (const btn of [left, pass, right]) {
    // 手機連點：按下去就算，不等 click 的延遲；真正的 click 擋掉免得算兩次（鍵盤 Enter 的 click 照樣有效）
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.click(); });
    btn.addEventListener('click', (e) => { if (e.detail !== 0) e.stopImmediatePropagation(); }, true);
  }
  const gauge = ui.el('div', 'game-gauge');
  gauge.innerHTML = '<div class="gauge-zone"></div><div class="gauge-needle"></div><div class="gauge-label">指針在綠色區時按「接棒」（空白鍵）</div>';
  gauge.hidden = true;
  document.body.append(pad, gauge);
  pad.hidden = true;
  const needleEl = gauge.querySelector('.gauge-needle');
  const zoneEl = gauge.querySelector('.gauge-zone');

  let lastKey = '';
  let taps = 0;
  window.addEventListener('keydown', (e) => {
    if (state !== 'play' || e.repeat || ui.paused) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'f') { e.preventDefault(); tap('L'); }
    if (k === 'arrowright' || k === 'd' || k === 'j') { e.preventDefault(); tap('R'); }
    if (k === ' ' || k === 'arrowup' || k === 'enter') { e.preventDefault(); tryPass(); }
  });

  function tap(side) {
    if (state !== 'play' || ui.paused || me.done || me.wait > 0) return;
    me.speed = Math.min(MAX_SPEED, me.speed + (side !== lastKey ? TAP_GAIN : 0.15));
    lastKey = side;
    taps++;
    (side === 'L' ? left : right).classList.add('hit');
    setTimeout(() => (side === 'L' ? left : right).classList.remove('hit'), 90);
  }

  // 接棒指針：0～1 來回擺，綠區在中間偏後
  let needle = 0;
  let needleDir = 1;
  const GREEN = [0.55, 0.82];
  const YELLOW = [0.4, 0.92];

  const zoneStart = (t) => (t.leg + 1) / LEGS - ZONE;
  const inZone = (t) => t.leg < LEGS - 1 && t.f >= zoneStart(t);
  // 下一棒的位置：在接力區起點等，同隊跑進接力區後先往前跑、保持在前面 1.2 公尺
  const nextF = (t) => Math.max(zoneStart(t), inZone(t) ? t.f + 1.2 / laneLength(t.lane) : 0);

  function tryPass() {
    if (state !== 'play' || ui.paused || me.done || me.wait > 0 || !inZone(me)) return;
    handOff(me, needle >= GREEN[0] && needle <= GREEN[1] ? 'perfect' : needle >= YELLOW[0] && needle <= YELLOW[1] ? 'ok' : 'drop');
  }

  function handOff(t, quality) {
    const prev = t.runners[t.leg];
    setTimeout(() => { prev.root.visible = false; }, 1000); // 交完棒的人一秒後走出跑道，不擋鏡頭
    t.f = nextF(t); // 新的一棒從他接到棒的地方接著跑
    t.leg++;
    prev.root.remove(t.baton);
    if (t.tag) prev.root.remove(t.tag);
    t.runners[t.leg].root.add(t.baton);
    if (t.tag) t.runners[t.leg].root.add(t.tag);
    t.passAt = 0.3 + Math.random() * 0.45;
    if (quality === 'perfect') t.speed = Math.min(MAX_SPEED, t.speed + 0.8);
    if (quality === 'ok') t.speed *= 0.7;
    if (quality === 'drop') { t.speed = 0; t.wait = 1.6; }
    if (quality === 'late') { t.speed = 0; t.wait = 2.2; }
    if (t.me) {
      const text = { perfect: '完美接棒！', ok: '接到了，有點慢', drop: '掉棒了！快撿起來', late: '太晚了！超出接力區' }[quality];
      ui.flash(text, 900, quality === 'perfect' ? 'good' : quality === 'ok' ? '' : 'bad');
      gauge.hidden = true;
    }
  }

  let state = 'intro';
  let clock = 0;
  let countdown = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  function put(c, f, lane) {
    lanePoint(f, lane, tmpV);
    lanePoint(f + 0.003, lane, tmpN);
    c.root.position.copy(tmpV);
    c.root.rotation.y = Math.atan2(tmpN.x - tmpV.x, tmpN.z - tmpV.z);
  }

  function reset() {
    // 每場重新抽道次
    const lanes = [...LANES].sort(() => Math.random() - 0.5);
    teams.forEach((t, i) => { t.lane = lanes[i]; });
    me.tag.element.textContent = `你・第 ${me.lane + 1} 道`;
    ui.setStat('lane', '道次', `第 ${me.lane + 1} 道`);
    for (const t of teams) {
      t.runners.forEach((c) => { c.root.remove(t.baton); if (t.tag) c.root.remove(t.tag); c.root.visible = true; });
      Object.assign(t, { f: 0, leg: 0, speed: 0, wait: 0, done: false, time: 0, passAt: 0.3 + Math.random() * 0.45 });
      t.runners[0].root.add(t.baton);
      if (t.tag) t.runners[0].root.add(t.tag);
      t.runners.forEach((c, k) => put(c, k ? k / LEGS - ZONE : 0, t.lane)); // 後三棒站在各自接力區的起點
      t.form = 0.92 + Math.random() * 0.12; // 今天狀況好不好
    }
    clock = 0;
    taps = 0;
    lastKey = '';
    gauge.hidden = true;
    ui.setStat('leg', '棒次', `1／${LEGS}`);
    ui.setStat('rank', '名次', '—');
    ui.setStat('time', '時間', '0.0');
    snapCamera();
  }

  async function begin() {
    reset();
    state = 'intro';
    pad.hidden = true;
    await ui.intro({
      lead: `莊主任說：「運動會的接力賽要開始了！這次太平隊抽到第 ${me.lane + 1} 道，能不能跑第一，就看你了！」`,
      rules: [
        coarse ? '左右兩顆鍵輪流按，按越快跑越快（同一邊連按沒有用）。' : '← → 方向鍵（或 A／D）輪流按，按越快跑越快（同一邊連按沒有用）。',
        '跑到黃線後的接力區，下方會出現指針；指針在綠色區時按「接棒」' + (coarse ? '' : '（空白鍵）') + '。',
        '太早或太晚按會掉棒、要停下來撿，跑過接力區還沒交棒也會被罰停。',
        '五隊從遊戲區旁的起跑線出發，四棒跑完一圈，拿第一名就過關！',
      ],
      startLabel: '各就各位',
    });
    pad.hidden = false;
    state = 'count';
    countdown = 3;
    ui.flash('3', 900);
  }

  function rankOf(t) {
    const prog = (x) => (x.done ? 10 - x.time / 1000 : x.f);
    return teams.filter((o) => prog(o) > prog(t)).length + 1;
  }

  function finish() {
    state = 'over';
    pad.hidden = true;
    gauge.hidden = true;
    const order = [...teams].sort((x, y) => x.time - y.time);
    const rank = order.indexOf(me) + 1;
    const win = rank === 1;
    const egg = win && awardEgg('relay-baton');
    ui.result({
      win,
      heading: win ? '太平隊第一名！' : `太平隊第 ${rank} 名`,
      lines: [
        order.map((t, i) => `${i + 1}. ${t.name} ${t.time.toFixed(1)} 秒`).join('　'),
        win ? '莊主任說：「跑得好，接棒也接得漂亮！」' : '左右手指輪流按更快喔；接棒時看準指針進綠色區再按。',
      ],
      egg,
      onRetry: begin,
    });
  }

  function runnerUpdate(t, dt) {
    if (t.done) return;
    if (t.wait > 0) {
      t.wait -= dt;
      if (t.wait <= 0) t.wait = 0;
    } else if (!t.me) {
      // 電腦隊：速度有一點起伏，接棒偶爾失誤
      const target = t.base * t.form * (0.96 + Math.sin(clock * 1.7 + t.lane) * 0.04);
      t.speed += (target - t.speed) * Math.min(1, dt * 1.6);
      if (inZone(t) && (t.f - zoneStart(t)) / ZONE > t.passAt) handOff(t, Math.random() < 0.18 ? 'ok' : 'perfect');
    } else {
      t.speed *= Math.exp(-DECAY * dt);
    }
    t.f += (t.speed / laneLength(t.lane)) * dt;
    // 跑過接力區還沒交棒：強制交棒並罰停
    if (t.leg < LEGS - 1 && t.f >= (t.leg + 1) / LEGS) handOff(t, 'late');
    if (t.f >= 1) {
      t.f = 1;
      t.done = true;
      t.time = clock;
      if (t.me) ui.flash(`抵達終點！${t.time.toFixed(1)} 秒`, 1200, 'good');
    }
    const c = t.runners[t.leg];
    put(c, t.f, t.lane);
    c.animate(t.done ? 0 : t.speed, dt);
    // 下一棒在接力區裡先起跑；跑完的停下來喘口氣
    const next = t.runners[t.leg + 1];
    if (next) {
      put(next, nextF(t), t.lane);
      next.animate(inZone(t) ? t.speed : 0, dt);
    }
    for (let k = 0; k < t.leg; k++) t.runners[k].animate(0, dt);
  }

  function snapCamera() {
    cameraTarget();
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    birdControls.target.copy(camLook);
  }

  function cameraTarget() {
    const r = me.runners[me.leg].root.position;
    lanePoint(me.f + 0.04, me.lane, tmpN); // 前方
    const fwd = tmpN.clone().sub(r).setY(0).normalize();
    const out = new THREE.Vector3(fwd.z, 0, -fwd.x); // 跑道外側（逆時針跑，右手邊是外側）
    camPos.copy(r).addScaledVector(fwd, -4.2).addScaledVector(out, 2.2).setY(3);
    camLook.copy(r).addScaledVector(fwd, 2.5).setY(0.9);
  }

  function update(dt) {
    if (ui.paused) return;
    dt = Math.min(dt, 0.05);
    if (state === 'count') {
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== Math.ceil(countdown + dt)) ui.flash(n > 0 ? `${n}` : '開跑！', n > 0 ? 900 : 700, n > 0 ? '' : 'good');
      if (countdown <= 0) state = 'play';
    }
    if (state === 'play') {
      clock += dt;
      teams.forEach((t) => runnerUpdate(t, dt));
      ui.setStat('time', '時間', clock.toFixed(1));
      ui.setStat('leg', '棒次', `${Math.min(LEGS, me.leg + 1)}／${LEGS}`);
      ui.setStat('rank', '名次', `第 ${rankOf(me)} 名`);
      // 接棒指針
      const showGauge = inZone(me) && !me.handed && !me.done;
      if (showGauge && gauge.hidden) {
        gauge.hidden = false;
        needle = 0;
        needleDir = 1;
        zoneEl.style.left = `${GREEN[0] * 100}%`;
        zoneEl.style.width = `${(GREEN[1] - GREEN[0]) * 100}%`;
      }
      if (!showGauge) gauge.hidden = true;
      if (showGauge) {
        needle += needleDir * dt * 0.85; // 慢一點，大家才反應得過來
        if (needle > 1) { needle = 1; needleDir = -1; }
        if (needle < 0) { needle = 0; needleDir = 1; }
        needleEl.style.left = `${needle * 100}%`;
      }
      // 別隊都跑完 15 秒了自己還沒到（放著沒按）：直接結算，不然這一場永遠不會結束
      const rivals = teams.filter((t) => !t.me);
      const stuck = !me.done && rivals.every((t) => t.done) && clock > Math.max(...rivals.map((t) => t.time)) + 15;
      if (teams.every((t) => t.done) || (me.done && clock > me.time + 4) || stuck) {
        teams.filter((t) => !t.done).forEach((t) => { t.done = true; t.time = clock + (1 - t.f) * laneLength(t.lane) / 5; });
        finish();
      }
    } else {
      teams.forEach((t) => t.runners[t.leg].animate(0, dt));
    }
    cameraTarget();
    const k = Math.min(1, dt * 6);
    camera.position.lerp(camPos, k);
    birdControls.target.lerp(camLook, k);
    camera.lookAt(birdControls.target);
  }

  begin();
  ui.setRestart(begin);
  return { update, ownsCamera: true, blockPick: true, get paused() { return ui.paused; } };
}
