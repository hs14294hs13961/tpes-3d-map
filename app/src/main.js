import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js';
import { buildCampus } from './scene/build.js';
import { createHud } from './ui/hud.js';
import { buildCollision } from './player/collision.js';
import { createJoystick } from './player/joystick.js';
import { createWalk } from './player/walk.js';
import { createNav } from './nav/nav.js';
import { createPathLine } from './nav/pathline.js';

const params = new URLSearchParams(location.search);
const isEdit = params.has('edit');
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 600;

const data = await fetch('./src/data/campus.json', { cache: 'no-store' }).then(r => r.json());

const state = {
  view: 'bird',
  floor: 'all',
  safety: true,
  labels: true,
  reference: isEdit,
  char: 'boy',
};

// ---------- 渲染器、場景、燈光 ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const labelsRoot = document.getElementById('labels');
const labelRenderer = new CSS2DRenderer({ element: labelsRoot });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfeaf2);
scene.fog = new THREE.Fog(0xdfeaf2, 220, 420);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-60, 120, 50);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(isSmall ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 80, bottom: -80, near: 10, far: 300 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------- 相機：鳥瞰（透視）與俯視（正交） ----------
const CENTER = new THREE.Vector3(6, 0, -6);
const CAMPUS_WIDTH = 140; // 校園東西寬約 125 m（加邊界），初始畫面盡量放得下
const BIRD_DIR = new THREE.Vector3(-0.05, 0.68, 0.73).normalize();

const birdCam = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 1000);
function homeDistance() {
  const aspect = window.innerWidth / window.innerHeight;
  const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(birdCam.fov / 2)) * aspect);
  // 直式手機放不下整個校園寬度，改成看操場與大樓為主，其餘用手指拖曳
  const max = aspect < 0.8 ? 165 : 220;
  return THREE.MathUtils.clamp(CAMPUS_WIDTH / 2 / Math.tan(hHalf), 110, max);
}
// 直式手機畫面窄，中心往教學大樓那側移，讓操場和教室都入鏡
function homeTarget() {
  return window.innerWidth / window.innerHeight < 0.8 ? new THREE.Vector3(18, 0, -4) : CENTER.clone();
}
birdCam.position.copy(homeTarget()).addScaledVector(BIRD_DIR, homeDistance());
const birdControls = new OrbitControls(birdCam, renderer.domElement);
birdControls.target.copy(homeTarget());
birdControls.enableDamping = true;
birdControls.maxPolarAngle = Math.PI * 0.47;
birdControls.minDistance = 8;
birdControls.maxDistance = 260;

const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
topCam.position.set(CENTER.x, 300, CENTER.z + 0.001);
const topControls = new OrbitControls(topCam, renderer.domElement);
topControls.target.copy(CENTER);
topControls.enableRotate = false;
topControls.screenSpacePanning = true;
topControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
topControls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
topControls.minZoom = 0.5;
topControls.maxZoom = 12;
topControls.enabled = false;

// 走路模式：同一台透視相機，鏡頭繞著人物轉
const walkControls = new OrbitControls(birdCam, renderer.domElement);
walkControls.enableDamping = true;
walkControls.enablePan = false;
walkControls.minDistance = 2.5;
walkControls.maxDistance = 22;
walkControls.minPolarAngle = 0.35;
walkControls.maxPolarAngle = 1.45;
walkControls.enabled = false;

function resizeTopCam() {
  // 俯視畫面高度（公尺）：橫向至少放得下大半個校園，直式手機上限 200 m
  const aspect = window.innerWidth / window.innerHeight;
  const h = THREE.MathUtils.clamp(CAMPUS_WIDTH / aspect, 110, 200) / 2;
  Object.assign(topCam, { left: -h * aspect, right: h * aspect, top: h, bottom: -h });
  topCam.updateProjectionMatrix();
}
resizeTopCam();

const active = () => {
  if (state.view === 'top') return { camera: topCam, controls: topControls };
  if (state.view === 'walk') return { camera: birdCam, controls: walkControls };
  return { camera: birdCam, controls: birdControls };
};

// ---------- 鏡頭平滑移動 ----------
let fly = null;
// lift：目標往畫面上方移的比例（手機資訊卡在下方，避免擋住目標）
function flyTo(target, distance, lift = 0) {
  const { camera, controls } = active();
  const from = { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom };
  let toTarget = target.clone();
  let toPos;
  let toZoom = camera.zoom;
  if (camera === birdCam) {
    // 鏡頭盡量從操場那側看過去（大樓在校園東緣，從操場看才不會被擋住）
    const cur = camera.position.clone().sub(controls.target);
    const toward = new THREE.Vector3(cur.x, 0, cur.z).normalize();
    const fromField = new THREE.Vector3(CENTER.x - target.x, 0, CENTER.z - target.z);
    if (fromField.length() > 10) toward.lerp(fromField.normalize(), 0.7).normalize();
    const dir = toward.clone().multiplyScalar(0.7).setY(1).normalize(); // 俯角約 55 度
    toTarget.addScaledVector(toward, distance * lift);
    toPos = toTarget.clone().addScaledVector(dir, distance);
  } else {
    toZoom = distance ? THREE.MathUtils.clamp(110 / distance, 1, 6) : 1;
    toTarget.z += ((topCam.top - topCam.bottom) / toZoom) * lift;
    toPos = new THREE.Vector3(toTarget.x, 300, toTarget.z + 0.001);
  }
  fly = { camera, controls, from, to: { target: toTarget, pos: toPos, zoom: toZoom }, t0: performance.now(), dur: 900 };
}
function stepFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.dur);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  fly.controls.target.lerpVectors(fly.from.target, fly.to.target, e);
  fly.camera.position.lerpVectors(fly.from.pos, fly.to.pos, e);
  if (fly.camera.isOrthographicCamera) {
    fly.camera.zoom = THREE.MathUtils.lerp(fly.from.zoom, fly.to.zoom, e);
    fly.camera.updateProjectionMatrix();
  }
  if (k >= 1) fly = null;
}
// 使用者自己拖動畫面時，取消自動移動
for (const c of [birdControls, topControls]) c.addEventListener('start', () => (fly = null));

function goHome() {
  if (state.view === 'bird') flyTo(homeTarget(), homeDistance());
  else flyTo(homeTarget(), 0);
}

// ---------- 校園 ----------
let labelsDirty = true; // 標籤需要重新檢查重疊
let lastDeclutter = 0;
const loader = new THREE.TextureLoader();
let campus = null;

function findItem(ref) {
  if (!ref) return null;
  if (ref.collection === 'reference') return data.reference;
  if (ref.collection === 'trees') return data.trees[ref.id];
  return (data[ref.collection] || []).find(it => it.id === ref.id) || null;
}

function findById(id) {
  for (const col of ['rooms', 'outdoor', 'stairs', 'safety', 'sports', 'buildings']) {
    const item = (data[col] || []).find(it => it.id === id);
    if (item) return { collection: col, id };
  }
  return null;
}

function itemFloor(ref, item) {
  if (ref.collection === 'rooms' || ref.collection === 'safety') return item.floor || 1;
  return 1;
}

function itemPosition(ref, item) {
  const { buildingBase: base, floorHeight: fh } = data.settings;
  const floor = itemFloor(ref, item);
  const y = ref.collection === 'rooms' || (ref.collection === 'safety' && floor > 1) ? base + (floor - 1) * fh : 0;
  return new THREE.Vector3(item.x, y, item.z);
}

function rebuild() {
  if (campus) {
    scene.remove(campus.root);
    campus.root.traverse(o => {
      if (o.isCSS2DObject) o.element.remove();
      if (o.geometry) o.geometry.dispose();
      // 共用的材質（照片、外牆）會留著重用，只釋放每次重畫都新做的貼圖（跑道、球場）
      if (!Array.isArray(o.material) && o.material?.userData.disposable) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
  occluded.clear();
  campus = buildCampus(data, { loader, onLabelClick: ref => handlePick(ref) });
  scene.add(campus.root);
  applyVisibility();
  markSelectedLabel();
  return campus;
}

function isVisible({ type, floor }) {
  const fm = state.floor;
  switch (type) {
    case 'always': return true;
    case 'reference': return state.reference;
    case 'roof': return fm === 'all';
    case 'shell': return fm === 'all' || floor < fm;
    case 'room': return fm === floor;
    case 'slab': return fm === 'all' || floor <= fm;
    case 'stair': return fm !== 'all';
    case 'safety': return state.safety && (fm === 'all' ? floor === 1 : floor === fm);
    default: return true;
  }
}

function applyVisibility() {
  for (const { obj, vis } of campus.registry) {
    obj.visible = isVisible(vis) && !occluded.has(obj);
    if (obj.visible && vis.type === 'reference') obj.traverse(o => o.userData.load?.());
  }
  labelsDirty = true;
}

// 走路時擋在鏡頭和人物之間的牆、屋頂、樓板先藏起來
const occluded = new Set();
const occRay = new THREE.Raycaster();
const OCCLUDER_TYPES = new Set(['shell', 'roof', 'slab']);
let lastOcc = 0;
function updateOccluders(now) {
  if (now - lastOcc < 120) return;
  lastOcc = now;
  const next = new Set();
  if (state.view === 'walk') {
    const from = walkControls.target;
    const dir = birdCam.position.clone().sub(from);
    occRay.set(from, dir.clone().normalize());
    occRay.far = dir.length();
    const candidates = campus.registry.filter(r => OCCLUDER_TYPES.has(r.vis.type) && isVisible(r.vis));
    for (const hit of occRay.intersectObjects(candidates.map(c => c.obj), true)) {
      const owner = candidates.find(c => {
        for (let p = hit.object; p; p = p.parent) if (p === c.obj) return true;
        return false;
      });
      if (owner) next.add(owner.obj);
    }
  }
  const same = next.size === occluded.size && [...next].every(o => occluded.has(o));
  if (same) return;
  occluded.clear();
  for (const o of next) occluded.add(o);
  applyVisibility();
}

// ---------- 選取：資訊卡、光圈、網址 ----------
let selected = null;
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x0d9488, transparent: true, opacity: 0.9, depthWrite: false })
);
ring.renderOrder = 10;
ring.visible = false;
scene.add(ring);

function markSelectedLabel() {
  const key = selected ? `${selected.collection}:${selected.id}` : '';
  labelsRoot.querySelectorAll('.lbl.selected').forEach(n => n.classList.remove('selected'));
  if (key) labelsRoot.querySelectorAll(`.lbl[data-key="${CSS.escape(key)}"]`).forEach(n => n.classList.add('selected'));
  labelsDirty = true;
}

function nearbySafety(ref, item) {
  if (ref.collection === 'safety') return [];
  const floor = itemFloor(ref, item);
  return (data.safety || [])
    .filter(s => s.type !== 'assembly' && (s.floor || 1) === floor)
    .map(s => ({ item: s, dist: Math.hypot(s.x - item.x, s.z - item.z) }))
    .filter(n => n.dist <= 30)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
}

function selectRef(ref, { fly: doFly = true, updateHash = true } = {}) {
  const item = findItem(ref);
  if (!ref || !item || ref.collection === 'trees' || ref.collection === 'reference') {
    selected = null;
    ring.visible = false;
    hud.hideInfo();
    markSelectedLabel();
    if (!walk.following) pathLine.clear(); // 例如關掉演練結果卡時，順便收起導引線
    if (updateHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  selected = ref;

  // 看不到的東西：切到它所在的樓層、打開防災圖層
  const floor = itemFloor(ref, item);
  let changed = false;
  if (ref.collection === 'rooms' && state.floor !== floor) (state.floor = floor), (changed = true);
  if (ref.collection === 'stairs' && state.floor === 'all') (state.floor = 1), (changed = true);
  if (ref.collection === 'safety') {
    if (!state.safety) (state.safety = true), (changed = true);
    const want = floor > 1 ? floor : state.floor === 'all' ? 'all' : 1;
    if (state.floor !== want) (state.floor = want), (changed = true);
  }
  if (changed) {
    hud.syncButtons();
    applyVisibility();
  }

  const pos = itemPosition(ref, item);
  const size = Math.max(item.w || 0, item.d || 0, (item.innerRadius || 0) * 2, 3);
  ring.scale.setScalar(size / 2 + 1.2);
  ring.position.set(pos.x, pos.y + 0.12, pos.z);
  ring.visible = true;

  hud.showInfo(ref, item, nearbySafety(ref, item));
  markSelectedLabel();
  const mobileCard = window.innerWidth < 900;
  if (doFly && state.view !== 'walk') flyTo(pos, THREE.MathUtils.clamp(size * 3, 55, 110), mobileCard ? 0.22 : 0);
  if (updateHash && ref.id) history.replaceState(null, '', `#${encodeURIComponent(ref.id)}`);
}

// ---------- 點選 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
let editor = null;

function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

// 回傳點到的資料項目（ref）與點到的位置（point）
function pickHit(clientX, clientY) {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, active().camera);
  for (const hit of raycaster.intersectObject(campus.root, true)) {
    if (!visibleChain(hit.object)) continue;
    for (let p = hit.object; p; p = p.parent) {
      if (p.userData.noPick) break;
      if (p.userData.ref) return { ref: p.userData.ref, point: hit.point };
    }
    return { ref: null, point: hit.point };
  }
  return { ref: null, point: null };
}
const pickAt = (x, y) => pickHit(x, y).ref;

// 走路模式下點到這些地方＝走過去，而不是打開介紹
const WALKABLE_KINDS = new Set(['turf', 'lawn', 'paving', 'farm', 'paddy', 'deck']);
function isWalkable(ref) {
  if (!ref) return true;
  if (ref.collection === 'sports') return true;
  return ref.collection === 'outdoor' && WALKABLE_KINDS.has(findItem(ref)?.kind);
}

function handlePick(ref) {
  if (editor) return editor.select(ref);
  // 一般模式點到樹或空地：關閉資訊卡；點到建築外殼時不飛走，避免畫面亂跳
  selectRef(ref?.collection === 'trees' ? null : ref, { fly: ref?.collection !== 'buildings' });
}

renderer.domElement.addEventListener('pointerdown', e => (downAt = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  if (editor?.isGizmoActive()) return;
  if (state.view === 'walk') {
    const { ref, point } = pickHit(e.clientX, e.clientY);
    if (!isWalkable(ref)) return handlePick(ref);
    if (!point || drill) return;
    stopGoTo();
    walk.cancel();
    // 有路線就照路線走（會自己繞路、上下樓梯），沒有就直走
    const from = { x: walk.position.x, z: walk.position.z, y: walk.position.y };
    const pts = getNav().route(from, { x: point.x, z: point.z, y: collision.heightAt(point.x, point.z, point.y) });
    if (pts && pts.length > 2) {
      pathLine.show(pts);
      walk.follow(pts, { speed: 2.2, onDone: () => pathLine.clear(), onCancel: () => pathLine.clear() });
    } else {
      pathLine.clear();
      walk.setTarget(point.x, point.z);
    }
    return;
  }
  handlePick(pickAt(e.clientX, e.clientY));
});

// ---------- 介面 ----------
function applyView() {
  fly = null;
  birdControls.enabled = state.view === 'bird';
  topControls.enabled = state.view === 'top';
  walkControls.enabled = state.view === 'walk';
  if (state.view === 'walk' && !walk.active) {
    walk.enter();
    hud.toast(coarse ? '用左下搖桿移動，拖曳畫面轉視角' : 'WASD／方向鍵移動，按住 Shift 跑步，拖曳轉視角');
  } else if (state.view !== 'walk' && walk.active) {
    stopDrill();
    stopGoTo();
    walk.exit();
    // 回到鳥瞰時，從人物所在位置往外看
    birdControls.target.copy(walk.position);
    if (state.floor !== 'all') state.floor = 'all';
    hud.syncButtons();
  }
  editor?.setCamera(active().camera);
}

function enterWalk() {
  if (state.view === 'walk') return;
  state.view = 'walk';
  hud.syncButtons();
  applyView();
  applyVisibility();
}

const hud = createHud({
  state,
  data,
  onSelect: ref => selectRef(ref),
  onGo: ref => goTo(ref),
  onDrill: roomId => startDrill(roomId),
  onDrillControl: drillControl,
  onChange(key) {
    if (key === 'view') applyView();
    if (key === 'char') return walk.setKind(state.char);
    if (key === 'home') return state.view === 'walk' ? walk.placeCamera() : goHome();
    applyVisibility();
  },
});

rebuild();

const coarse = window.matchMedia('(pointer: coarse)').matches;
const collision = buildCollision(data);
const walk = createWalk({
  scene,
  camera: birdCam,
  controls: walkControls,
  collision,
  joystick: createJoystick(document.getElementById('joystick')),
  // 走進室內自動切到所在樓層的剖面，走出去再恢復全棟，鏡頭才不會被樓上擋住
  onLevelChange(level) {
    if (state.view !== 'walk') return;
    state.floor = level;
    hud.syncButtons();
    applyVisibility();
  },
});
walk.setKind(state.char);

// ---------- 路網（第一次用到才建立，約 0.3 秒） ----------
let nav = null;
const getNav = () => (nav ??= createNav(data, collision));
const pathLine = createPathLine(scene);

// ---------- 帶我去：從人物目前位置走到某個地點 ----------
let goingTo = null;
function goTo(ref) {
  const item = findItem(ref);
  if (!item) return;
  stopDrill();
  enterWalk();
  const pts = getNav().routeTo({ x: walk.position.x, z: walk.position.z, y: walk.position.y }, ref.collection, item);
  if (!pts) return hud.toast('找不到可以走過去的路線');
  hud.hideInfo();
  walk.cancel(); // 先結束上一段路線，免得它收尾時把新的導引線清掉
  goingTo = ref;
  pathLine.show(pts);
  hud.toast(`前往「${item.name}」，搖桿一動就會停下`);
  walk.follow(pts, {
    speed: 2.2,
    onDone() {
      pathLine.clear();
      goingTo = null;
      selectRef(ref, { fly: false });
    },
    onCancel(reason) {
      if (goingTo !== ref) return;
      goingTo = null;
      pathLine.clear();
      if (reason === 'stuck') hud.toast('被擋住了，請用搖桿繞過去');
    },
  });
}
function stopGoTo() {
  if (!goingTo) return;
  walk.cancel();
}

// ---------- 疏散演練 ----------
const KID_SPEED = 1.2; // 估算用：學生疏散步行約每秒 1.2 公尺
let drill = null;
function startDrill(roomId) {
  const room = (data.rooms || []).find(r => r.id === roomId);
  const pts = room && getNav().evacuation(roomId);
  if (!pts) return hud.toast('找不到這間教室的疏散路線');
  stopGoTo();
  enterWalk();
  selected = null;
  ring.visible = false;
  markSelectedLabel();
  const stair = (data.stairs || []).find(st => st.id === room.evacuation.stair);
  const total = getNav().length(pts);
  drill = { room, stair, total, paused: false, fast: false };
  walk.cancel();
  walk.teleport(pts[0], pts[1]);
  pathLine.show(pts);
  const route = [room.name, stair?.name, '操場中央'].filter(Boolean).join(' → ');
  hud.showDrill({ title: `🚨 ${route}`, sub: `全程約 ${Math.round(total)} 公尺` });
  walk.follow(pts, {
    speed: 1.6,
    cam: true,
    paused: () => drill?.paused,
    mul: () => (drill?.fast ? 2 : 1),
    onProgress(rest) {
      hud.updateDrill(1 - rest / total, `剩下約 ${Math.max(0, Math.round(rest))} 公尺`);
    },
    onDone() {
      const d = drill;
      drill = null;
      hud.hideDrill();
      const sec = Math.round(d.total / KID_SPEED);
      const time = sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`;
      hud.showMessage({
        kicker: '🚩 抵達集合點',
        title: '操場中央集合點',
        desc: `從${d.room.name}出發${d.stair ? `，經${d.stair.name}` : ''}，全程約 ${Math.round(d.total)} 公尺，用平常走路的速度大約 ${time}。到達後依班級排好，等老師點名。`,
        tags: ['不推', '不跑', '不語', '不回頭'],
      });
    },
    onCancel() {
      if (!drill) return;
      drill = null;
      hud.hideDrill();
      pathLine.clear();
      hud.toast('已結束演練');
    },
  });
}
function stopDrill() {
  if (drill) walk.cancel('stop');
}
function drillControl(cmd) {
  if (!drill) return false;
  if (cmd === 'pause') return (drill.paused = !drill.paused);
  if (cmd === 'speed') return (drill.fast = !drill.fast);
  if (cmd === 'stop') stopDrill();
  return false;
}

if (isEdit) {
  document.body.classList.add('editing');
  const { createEditor } = await import('./editor/editor.js');
  editor = createEditor({
    data,
    scene,
    renderer,
    getCamera: () => active().camera,
    getControls: () => active().controls,
    rebuild,
    getGroup: ref => campus.groups.get(`${ref.collection}:${ref.id}`),
    findItem,
    state,
    applyVisibility,
    syncButtons: () => hud.syncButtons(),
  });
}

// 分享連結：網址 #教室代碼 直接開到那個地點
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const ref = id && findById(id);
  if (ref) selectRef(ref, { updateHash: false });
}
window.addEventListener('hashchange', openFromHash);

document.getElementById('loading').hidden = true;
if (location.hash) openFromHash();
else if (!isEdit) hud.maybeShowHelp();

// ---------- 標籤避免重疊：優先度高的先放，蓋到別人的就先藏起來 ----------
function declutter(now) {
  if (now - lastDeclutter < 150 && !labelsDirty) return;
  lastDeclutter = now;
  labelsDirty = false;
  const els = [...labelsRoot.querySelectorAll('.lbl')];
  const items = [];
  for (const n of els) {
    if (n.style.display === 'none') continue;
    const r = n.getBoundingClientRect();
    if (r.width === 0) continue;
    const pri = n.classList.contains('selected') ? 1000 : Number(n.dataset.pri || 0);
    items.push({ n, r, pri });
  }
  items.sort((a, b) => b.pri - a.pri);
  const placed = [];
  const pad = 2;
  for (const it of items) {
    const { r } = it;
    const hit = placed.some(p => r.left < p.right + pad && r.right > p.left - pad && r.top < p.bottom + pad && r.bottom > p.top - pad);
    it.n.classList.toggle('culled', hit);
    if (!hit) placed.push(r);
  }
}

// ---------- 指北針：把真實北方投影到畫面上 ----------
const northDeg = data.meta.northAngleDeg ?? 0; // 北方相對平面圖「上方」往左轉幾度
const northDir = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(northDeg)), 0, -Math.cos(THREE.MathUtils.degToRad(northDeg)));
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
function updateCompass() {
  const { camera, controls } = active();
  _a.copy(controls.target).project(camera);
  _b.copy(controls.target).addScaledVector(northDir, 10).project(camera);
  const deg = THREE.MathUtils.radToDeg(Math.atan2((_b.x - _a.x) * window.innerWidth, (_b.y - _a.y) * window.innerHeight));
  hud.setCompass(deg);
}

window.addEventListener('resize', () => {
  birdCam.aspect = window.innerWidth / window.innerHeight;
  birdCam.updateProjectionMatrix();
  resizeTopCam();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelsDirty = true;
});

let lastFrame = performance.now();
renderer.setAnimationLoop(now => {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  const { camera, controls } = active();
  stepFly(now);
  walk.update(dt);
  updateOccluders(now);
  controls.update();
  if (ring.visible) ring.material.opacity = 0.55 + 0.35 * Math.sin(now / 250);
  updateCompass();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  declutter(now);
});
