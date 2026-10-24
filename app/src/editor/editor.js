// 編輯模式（網址加 ?edit=1）：點選物件、拖曳移動／旋轉、直接改數字，
// 再按「儲存」寫回 campus.json（本機預覽伺服器）或下載 JSON。
import * as THREE from 'three';
import { TransformControls } from 'three/addons/TransformControls.js';

const COLLECTION_NAMES = {
  buildings: '建築', rooms: '教室', stairs: '樓梯', outdoor: '戶外', sports: '運動場',
  safety: '防災點', trees: '樹', reference: '空拍底圖',
};

// 各欄位的中文名稱與步進值
const FIELDS = [
  ['name', '名稱', 'text'],
  ['x', 'X (m)', 0.1],
  ['z', 'Z (m)', 0.1],
  ['w', '寬 (m)', 0.1],
  ['d', '深 (m)', 0.1],
  ['h', '高 (m)', 0.1],
  ['r', '半徑 (m)', 0.1],
  ['rot', '旋轉 (°)', 1],
  ['floor', '樓層', 1],
  ['opacity', '透明度', 0.05],
  ['description', '說明', 'textarea'],
  ['desc', '說明', 'textarea'],
  ['needsCheck', '待確認', 'text'],
];

const round = (v, step = 0.1) => Math.round(v / step) * step;
const fmt = v => Number(v.toFixed(2));

export function createEditor(ctx) {
  const { data, scene, renderer, getCamera, getControls, rebuild, getGroup, findItem, state } = ctx;

  // ---------- 狀態 ----------
  let selected = null; // ref
  let dirty = false;
  const history = [];
  const snapshot = () => {
    history.push(JSON.stringify(data));
    if (history.length > 100) history.shift();
    undoBtn.disabled = false;
  };

  // ---------- 拖曳工具 ----------
  const gizmo = new TransformControls(getCamera(), renderer.domElement);
  gizmo.showY = false;
  gizmo.setTranslationSnap(0.1);
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(5));
  gizmo.setSpace('world');
  gizmo.size = 1.4; // 箭頭放大，比較好抓
  scene.add(gizmo.getHelper());

  gizmo.addEventListener('dragging-changed', e => {
    getControls().enabled = !e.value;
    if (e.value) {
      snapshot();
      return;
    }
    // 拖完：把位置寫回資料
    const item = findItem(selected);
    const g = gizmo.object;
    if (!item || !g) return;
    item.x = fmt(round(g.position.x));
    item.z = fmt(round(g.position.z));
    if ('rot' in item || gizmo.mode === 'rotate') item.rot = fmt(round(-THREE.MathUtils.radToDeg(g.rotation.y), 1));
    markDirty();
    renderFields();
  });
  gizmo.addEventListener('objectChange', () => {
    const g = gizmo.object;
    if (g) coordsEl.textContent = `x ${g.position.x.toFixed(1)}  z ${g.position.z.toFixed(1)}`;
  });

  // ---------- 面板 ----------
  const panel = document.createElement('aside');
  panel.className = 'editor';
  panel.innerHTML = `
    <h3>編輯模式</h3>
    <div class="row">
      <button data-mode="translate" class="on">移動 (T)</button>
      <button data-mode="rotate">旋轉 (R)</button>
      <button data-act="undo" disabled>復原</button>
    </div>
    <div class="row">
      <button data-act="save" class="primary">儲存</button>
      <button data-act="download">下載 JSON</button>
      <button data-act="ref">調整底圖</button>
    </div>
    <div class="row">
      <span class="muted">底圖透明度</span>
      <input type="range" min="0" max="1" step="0.05" data-act="opacity" style="flex:1">
    </div>
    <div class="status" data-el="status"></div>
    <div class="muted">游標位置：<span class="coords" data-el="coords">—</span></div>
    <hr>
    <input type="text" data-act="find" placeholder="找物件：輸入名稱，例如 雞舍">
    <div class="objlist" data-el="list"></div>
    <hr>
    <div class="nudge" data-el="nudge" hidden>
      <span class="muted">微調位置</span>
      <div class="nudge-pad">
        <button data-nudge="0,-1" title="往平面圖上方">↑</button>
        <button data-nudge="-1,0" title="往左">←</button>
        <button data-nudge="1,0" title="往右">→</button>
        <button data-nudge="0,1" title="往平面圖下方">↓</button>
      </div>
      <select data-act="step">
        <option value="0.2">每次 0.2 m</option>
        <option value="1" selected>每次 1 m</option>
        <option value="5">每次 5 m</option>
      </select>
    </div>
    <div data-el="fields"><p class="muted">從上面清單點選，或點畫面上的物件、標籤開始編輯。</p></div>
  `;
  document.body.appendChild(panel);
  const q = sel => panel.querySelector(sel);
  const statusEl = q('[data-el="status"]');
  const coordsEl = q('[data-el="coords"]');
  const fieldsEl = q('[data-el="fields"]');
  const undoBtn = q('[data-act="undo"]');
  const opacityEl = q('[data-act="opacity"]');
  opacityEl.value = data.reference?.opacity ?? 0.85;

  const setStatus = (msg, warn = false) => {
    statusEl.textContent = msg;
    statusEl.className = `status ${warn ? 'warn' : ''}`;
  };
  function markDirty() {
    dirty = true;
    setStatus('有尚未儲存的修改', true);
  }

  panel.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function setMode(mode) {
    gizmo.setMode(mode);
    gizmo.showX = mode === 'translate';
    gizmo.showZ = mode === 'translate';
    gizmo.showY = mode === 'rotate';
    panel.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  }

  undoBtn.addEventListener('click', undo);
  q('[data-act="save"]').addEventListener('click', save);
  q('[data-act="download"]').addEventListener('click', download);
  q('[data-act="ref"]').addEventListener('click', () => {
    state.reference = true;
    ctx.syncButtons();
    ctx.applyVisibility();
    select({ collection: 'reference', id: 'aerial' });
  });
  opacityEl.addEventListener('input', () => {
    if (!data.reference) return;
    data.reference.opacity = Number(opacityEl.value);
    const g = getGroup({ collection: 'reference', id: 'aerial' });
    g?.traverse(o => o.material && (o.material.opacity = data.reference.opacity));
    markDirty();
  });

  // ---------- 物件清單（不必在 3D 畫面裡找，直接點名稱選取） ----------
  const listEl = q('[data-el="list"]');
  const findEl = q('[data-act="find"]');
  function allItems() {
    const out = [];
    for (const col of ['buildings', 'rooms', 'stairs', 'outdoor', 'sports', 'safety']) {
      for (const it of data[col] || []) {
        const floor = col === 'rooms' ? `${it.floor}F ` : '';
        out.push({ ref: { collection: col, id: it.id }, text: `${floor}${it.name}`, group: COLLECTION_NAMES[col] });
      }
    }
    (data.trees || []).forEach((t, i) => out.push({ ref: { collection: 'trees', id: i }, text: `樹 #${i}`, group: '樹' }));
    return out;
  }
  function renderList() {
    const kw = findEl.value.trim();
    const items = allItems().filter(it => !kw || it.text.includes(kw) || it.group.includes(kw));
    listEl.replaceChildren(
      ...items.slice(0, 60).map(it => {
        const b = document.createElement('button');
        b.className = 'objitem';
        if (selected && selected.collection === it.ref.collection && selected.id === it.ref.id) b.classList.add('on');
        b.innerHTML = `<span class="muted">${it.group}</span> ${it.text}`;
        b.addEventListener('click', () => select(it.ref));
        return b;
      })
    );
  }
  findEl.addEventListener('input', renderList);

  // ---------- 微調按鈕 ----------
  const nudgeEl = q('[data-el="nudge"]');
  const stepEl = q('[data-act="step"]');
  panel.querySelectorAll('[data-nudge]').forEach(b =>
    b.addEventListener('click', () => {
      const [dx, dz] = b.dataset.nudge.split(',').map(Number);
      nudge(dx, dz, Number(stepEl.value));
    })
  );
  function nudge(dx, dz, step) {
    const item = findItem(selected);
    if (!item || !('x' in item)) return;
    snapshot();
    item.x = fmt(item.x + dx * step);
    item.z = fmt(item.z + dz * step);
    markDirty();
    refresh();
  }

  // ---------- 選取 ----------
  function select(ref) {
    selected = ref;
    // 選到看不見的樓層時，自動切到該樓層
    const item = findItem(ref);
    let want = state.floor;
    if (ref?.collection === 'rooms') want = item.floor;
    else if (ref?.collection === 'stairs' && state.floor === 'all') want = 1;
    else if (ref?.collection === 'safety' && state.floor !== 'all' && item.floor !== state.floor) want = item.floor;
    if (ref?.collection === 'reference') state.reference = true;
    if (want !== state.floor || ref?.collection === 'reference') {
      state.floor = want;
      ctx.syncButtons();
      ctx.applyVisibility();
    }
    const g = ref && getGroup(ref);
    if (g) gizmo.attach(g);
    else gizmo.detach();
    nudgeEl.hidden = !g;
    renderFields();
    renderList();
  }

  function renderFields() {
    const item = findItem(selected);
    if (!item) {
      fieldsEl.innerHTML = '<p class="muted">從上面清單點選，或點畫面上的物件、標籤開始編輯。</p>';
      return;
    }
    const title = document.createElement('div');
    title.innerHTML = `<b>${COLLECTION_NAMES[selected.collection] || selected.collection}</b> <span class="muted">${
      selected.collection === 'trees' ? `#${selected.id}` : selected.id
    }</span>`;
    const nodes = [title];
    for (const [key, labelText, type] of FIELDS) {
      if (!(key in item)) continue;
      const row = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = labelText;
      let input;
      if (type === 'textarea') {
        input = document.createElement('textarea');
        input.value = item[key] ?? '';
      } else {
        input = document.createElement('input');
        input.type = type === 'text' ? 'text' : 'number';
        if (type !== 'text') input.step = type;
        input.value = item[key] ?? '';
      }
      input.addEventListener('change', () => {
        snapshot();
        item[key] = input.type === 'number' ? Number(input.value) : input.value;
        markDirty();
        refresh();
      });
      row.append(span, input);
      nodes.push(row);
    }
    fieldsEl.replaceChildren(...nodes);
  }

  // 重畫整個場景並保持選取
  function refresh() {
    const keep = selected;
    gizmo.detach();
    rebuild();
    select(keep);
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    const parsed = JSON.parse(prev);
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, parsed);
    undoBtn.disabled = history.length === 0;
    opacityEl.value = data.reference?.opacity ?? 0.85;
    markDirty();
    refresh();
  }

  // ---------- 儲存 ----------
  async function save() {
    try {
      const res = await fetch('./api/save-campus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || '儲存失敗');
      dirty = false;
      setStatus(`已儲存（舊版備份：${out.backup}）`);
    } catch (err) {
      setStatus('無法直接儲存（不是用本機預覽開啟？），改為下載 JSON', true);
      download();
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'campus.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 鍵盤與游標座標 ----------
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key] && selected) {
      e.preventDefault();
      nudge(...arrows[e.key], e.shiftKey ? 5 : Number(stepEl.value));
      return;
    }
    if (e.key === 't' || e.key === 'T') setMode('translate');
    if (e.key === 'r' || e.key === 'R') setMode('rotate');
    if (e.key === 'Escape') select(null);
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });

  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const p = new THREE.Vector2();
  const hitPt = new THREE.Vector3();
  renderer.domElement.addEventListener('pointermove', e => {
    if (gizmo.dragging) return;
    p.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(p, getCamera());
    if (ray.ray.intersectPlane(ground, hitPt)) coordsEl.textContent = `x ${hitPt.x.toFixed(1)}  z ${hitPt.z.toFixed(1)}`;
  });

  window.addEventListener('beforeunload', e => {
    if (dirty) e.preventDefault();
  });

  setMode('translate');
  renderList();
  fetch('./api/ping')
    .then(r => r.json())
    .then(() => setStatus('本機預覽：按「儲存」會直接寫回 campus.json'))
    .catch(() => setStatus('目前只能「下載 JSON」，請用本機預覽開啟才能直接儲存', true));

  return {
    select,
    isGizmoActive: () => gizmo.dragging || gizmo.axis !== null,
    setCamera(cam) {
      gizmo.camera = cam;
    },
  };
}
