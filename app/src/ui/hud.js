// 使用者介面：右側快捷鍵、搜尋、資訊卡、選單抽屜、操作說明、指北針。
import { ROOM_COLORS, SAFETY_ICONS } from '../scene/build.js';

const CATEGORY_NAMES = {
  class: '一般教室',
  admin: '行政空間',
  special: '專科教室',
  support: '特教／輔導',
  other: '其他空間',
  wc: '廁所',
};
const CATEGORY_ICONS = { class: '🏫', admin: '🗂️', special: '🔬', support: '🌱', other: '📦', wc: '🚻' };
const OUTDOOR_ICONS = {
  stage: '🎤', turf: '🛝', farm: '🌱', lawn: '🏓', pingpong: '🏓', paving: '🅿️', carport: '🚗', pond: '💧',
  gate: '🚪', hut: '🏠', treehouse: '🌳', deck: '🪵', bars: '🤸', paddy: '🌾', rice: '🌾', shed: '🧯',
  clinic: '🏥', center: '🏛️', goal: '⚽', hoop: '🏀', swing: '🛝', seesaw: '🛝',
};
const COLLECTION_NAMES = { outdoor: '戶外', stairs: '樓梯', safety: '防災設施', sports: '運動場', buildings: '建築' };
const SAFETY_TYPE_NAMES = {
  assembly: '集合點', cmd: '指揮中心', med: '急救站', shelter: '避難所', aed: 'AED', comm: '通訊設備',
  food: '物資儲備', tool: '救援器材', pickup: '家長接送', hydrant: '消防栓', extinguisher: '滅火器',
};
const HELP_KEY = 'tpes3d-help-seen';
const CHAR_KEY = 'tpes3d-char';
const DIGITS = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function describe(collection, item) {
  if (collection === 'rooms') {
    return { icon: CATEGORY_ICONS[item.category] || '🏫', kicker: `${item.floor}F・${CATEGORY_NAMES[item.category] || ''}` };
  }
  if (collection === 'safety') {
    const fl = item.floor > 1 ? `${item.floor}F・` : '';
    return { icon: SAFETY_ICONS[item.type] || '⚠️', kicker: `${fl}防災設施` };
  }
  if (collection === 'outdoor') return { icon: OUTDOOR_ICONS[item.kind] || '📍', kicker: '戶外' };
  if (collection === 'stairs') return { icon: '🪜', kicker: '樓梯' };
  if (collection === 'buildings') return { icon: '🏢', kicker: '建築' };
  if (collection === 'sports') return { icon: '🏃', kicker: '運動場' };
  return { icon: '📍', kicker: COLLECTION_NAMES[collection] || '' };
}

export function createHud({ state, data, onChange, onSelect, onGo, onDrill, onDrillControl }) {
  // ---------- 右側快捷鍵 ----------
  const viewBtn = $('#btn-view');
  const floorBtn = $('#btn-floor');
  const safetyBtn = $('#btn-safety');
  const walkBtn = $('#btn-walk');
  viewBtn.addEventListener('click', () => {
    state.view = state.view === 'bird' ? 'top' : 'bird'; // 走路中按下＝回到鳥瞰
    syncButtons();
    onChange('view');
  });
  walkBtn.addEventListener('click', () => {
    state.view = state.view === 'walk' ? 'bird' : 'walk';
    syncButtons();
    onChange('view');
  });
  floorBtn.addEventListener('click', () => {
    state.floor = state.floor === 'all' ? 1 : state.floor === 1 ? 2 : 'all';
    syncButtons();
    onChange('floor');
  });
  safetyBtn.addEventListener('click', () => {
    state.safety = !state.safety;
    syncButtons();
    onChange('safety');
  });
  $('#btn-home').addEventListener('click', () => onChange('home'));

  function syncButtons() {
    viewBtn.querySelector('.rail-icon').textContent = state.view === 'top' ? '🗺️' : '🛰️';
    viewBtn.querySelector('.rail-text').textContent = state.view === 'top' ? '俯視' : '鳥瞰';
    walkBtn.classList.toggle('on', state.view === 'walk');
    walkBtn.querySelector('.rail-text').textContent = state.view === 'walk' ? '離開' : '走走看';
    document.body.classList.toggle('walking', state.view === 'walk');
    $('#joystick').hidden = state.view !== 'walk';
    floorBtn.querySelector('.rail-text').textContent = state.floor === 'all' ? '全棟' : `${state.floor}F`;
    floorBtn.classList.toggle('on', state.floor !== 'all');
    safetyBtn.classList.toggle('on', state.safety);
    $('#opt-labels').checked = state.labels;
    $('#opt-reference').checked = state.reference;
    document.body.classList.toggle('hide-labels', !state.labels);
    document.body.classList.toggle('hide-safety', !state.safety);
  }

  // ---------- 選單抽屜 ----------
  const drawer = $('#drawer');
  const mask = $('#drawer-mask');
  const siteUrl = `${location.origin}${location.pathname}`;
  const openDrawer = () => {
    drawer.hidden = mask.hidden = false;
    // 第一次打開選單才產生 QR Code
    const box = $('#site-qr');
    if (!box.firstChild && window.qrcode) {
      const qr = window.qrcode(0, 'M');
      qr.addData(siteUrl);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }
  };
  $('#site-url').textContent = siteUrl;
  $('#copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      toast('已複製網址');
    } catch {
      toast(siteUrl);
    }
  });
  const closeDrawer = () => (drawer.hidden = mask.hidden = true);
  $('#menu-open').addEventListener('click', openDrawer);
  $('#menu-close').addEventListener('click', closeDrawer);
  mask.addEventListener('click', closeDrawer);

  const contacts = $('#contacts');
  let lastGroup = null;
  for (const c of data.contacts || []) {
    if (c.group !== lastGroup) {
      contacts.append(el('div', 'contact-group', c.group));
      lastGroup = c.group;
    }
    const a = el('a', 'contact');
    a.href = `tel:${c.tel.replace(/[^\d]/g, '')}${c.ext ? `,${c.ext}` : ''}`;
    const info = el('div');
    info.append(el('div', 'contact-name', c.name), el('div', 'contact-tel', c.ext ? `${c.tel} 轉 ${c.ext}` : c.tel));
    a.append(info, el('span', 'contact-call', '📞'));
    contacts.append(a);
  }

  const legend = $('#legend');
  for (const [cat, name] of Object.entries(CATEGORY_NAMES)) {
    const item = el('div', 'legend-item');
    const sw = el('span', 'legend-swatch');
    sw.style.background = `#${ROOM_COLORS[cat].toString(16).padStart(6, '0')}`;
    item.append(sw, el('span', null, name));
    legend.append(item);
  }
  for (const [type, name] of Object.entries(SAFETY_TYPE_NAMES)) {
    legend.append(el('div', 'legend-item', `${SAFETY_ICONS[type]} ${name}`));
  }

  $('#opt-labels').addEventListener('change', e => {
    state.labels = e.target.checked;
    syncButtons();
    onChange('labels');
  });
  $('#opt-reference').addEventListener('change', e => {
    state.reference = e.target.checked;
    syncButtons();
    onChange('reference');
  });
  // 走路角色（記在這台裝置）
  try {
    const saved = localStorage.getItem(CHAR_KEY);
    if (saved === 'boy' || saved === 'girl') state.char = saved;
  } catch {}
  document.querySelectorAll('input[name="char"]').forEach(r => {
    r.checked = r.value === state.char;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      state.char = r.value;
      try {
        localStorage.setItem(CHAR_KEY, r.value);
      } catch {}
      onChange('char');
    });
  });
  $('#data-version').textContent = `資料版本：${data.meta.mapVersion || ''}`;

  // ---------- 操作說明 ----------
  const help = $('#help');
  const showHelp = () => {
    closeDrawer();
    help.hidden = false;
  };
  $('#help-open').addEventListener('click', showHelp);
  $('#help-close').addEventListener('click', () => {
    help.hidden = true;
    try {
      localStorage.setItem(HELP_KEY, '1');
    } catch {}
  });
  function maybeShowHelp() {
    let seen = false;
    try {
      seen = localStorage.getItem(HELP_KEY) === '1';
    } catch {}
    if (!seen) help.hidden = false;
  }

  // ---------- 搜尋 ----------
  const input = $('#search-input');
  const results = $('#search-results');
  const clearBtn = $('#search-clear');
  const index = buildIndex(data);
  const SUGGEST = ['assembly-center', 'room-1f-health', 'safe-aed', 'room-1f-wc', 'zone-gate'];
  let activeIdx = -1;
  let shown = [];

  function renderResults() {
    const kw = normalize(input.value.trim());
    clearBtn.hidden = !input.value;
    shown = kw
      ? index.filter(e => e.search.includes(kw)).slice(0, 12)
      : SUGGEST.map(id => index.find(e => e.ref.id === id)).filter(Boolean);
    activeIdx = -1;
    results.replaceChildren(
      ...(shown.length
        ? shown.map((e, i) => {
            const li = el('li');
            li.setAttribute('role', 'option');
            li.append(el('span', 'r-icon', e.icon), el('span', 'r-name', e.name), el('span', 'r-meta', e.kicker));
            li.addEventListener('pointerdown', ev => ev.preventDefault()); // 避免先失焦關掉清單
            li.addEventListener('click', () => choose(i));
            return li;
          })
        : [el('li', 'r-empty', '找不到符合的地點')])
    );
    results.hidden = false;
  }
  function choose(i) {
    const e = shown[i];
    if (!e) return;
    input.value = e.name;
    clearBtn.hidden = false;
    results.hidden = true;
    input.blur();
    onSelect(e.ref);
  }
  input.addEventListener('focus', renderResults);
  input.addEventListener('input', renderResults);
  input.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      [...results.children].forEach((li, i) => li.classList.toggle('active', i === activeIdx));
    } else if (e.key === 'Enter') {
      choose(activeIdx >= 0 ? activeIdx : 0);
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    input.focus();
  });

  // ---------- 資訊卡 ----------
  const card = $('#info-card');
  let current = null;
  $('#info-close').addEventListener('click', () => {
    hideInfo();
    input.value = '';
    clearBtn.hidden = true;
    onSelect(null);
  });

  function showInfo(ref, item, nearby = []) {
    if (!item) return;
    current = ref;
    $('#info-go').hidden = false;
    $('#info-share').hidden = false;
    $('#info-drill').hidden = !(ref.collection === 'rooms' && item.evacuation);
    const { kicker } = describe(ref.collection, item);
    $('#info-kicker').textContent = kicker;
    $('#info-title').textContent = item.name || '';
    $('#info-desc').textContent = item.description || item.desc || '';
    $('#info-tags').replaceChildren(...(item.safetyItems || []).map(t => el('li', null, t)));
    const nb = $('#info-nearby');
    nb.hidden = nearby.length === 0;
    $('#info-nearby-list').replaceChildren(
      ...nearby.map(n => {
        const li = el('li');
        li.append(el('span', null, SAFETY_ICONS[n.item.type] || '⚠️'), el('span', null, n.item.name), el('span', 'dist', `約 ${Math.round(n.dist)} 公尺`));
        li.addEventListener('click', () => onSelect({ collection: 'safety', id: n.item.id }));
        return li;
      })
    );
    card.hidden = false;
    card.scrollTop = 0;
    document.body.classList.add('card-open');
  }
  // 不屬於任何地點的訊息（例如演練結果）
  function showMessage({ kicker = '', title = '', desc = '', tags = [] }) {
    current = null;
    $('#info-kicker').textContent = kicker;
    $('#info-title').textContent = title;
    $('#info-desc').textContent = desc;
    $('#info-tags').replaceChildren(...tags.map(t => el('li', null, t)));
    $('#info-nearby').hidden = true;
    $('#info-go').hidden = true;
    $('#info-drill').hidden = true;
    $('#info-share').hidden = true;
    card.hidden = false;
    card.scrollTop = 0;
    document.body.classList.add('card-open');
  }

  $('#info-go').addEventListener('click', () => current && onGo?.(current));
  $('#info-drill').addEventListener('click', () => current && onDrill?.(current.id));

  // ---------- 疏散演練 ----------
  const picker = $('#drill-picker');
  const stairName = id => (data.stairs || []).find(st => st.id === id)?.name;
  const drillRooms = (data.rooms || [])
    .filter(r => r.evacuation)
    .sort((a, b) => b.floor - a.floor || a.name.localeCompare(b.name, 'zh-Hant'));
  $('#drill-list').replaceChildren(
    ...drillRooms.map(r => {
      const b = el('button');
      b.append(el('b', null, r.name), el('span', null, `${r.floor}F・${r.evacuation.stair ? `走${stairName(r.evacuation.stair)}` : '直接到操場'}`));
      b.addEventListener('click', () => {
        picker.hidden = true;
        onDrill?.(r.id);
      });
      return b;
    })
  );
  const openPicker = () => {
    closeDrawer();
    picker.hidden = false;
  };
  $('#btn-drill').addEventListener('click', openPicker);
  $('#drawer-drill').addEventListener('click', openPicker);
  $('#drill-cancel').addEventListener('click', () => (picker.hidden = true));

  const drillbar = $('#drillbar');
  function showDrill({ title, sub }) {
    hideInfo();
    $('#drill-title').textContent = title;
    $('#drill-sub').textContent = sub;
    $('#drill-progress-bar').style.width = '0%';
    $('#drill-pause').textContent = '⏸ 暫停';
    $('#drill-speed').textContent = '⏩ 2 倍速';
    drillbar.hidden = false;
    document.body.classList.add('drilling');
  }
  function updateDrill(fraction, sub) {
    $('#drill-progress-bar').style.width = `${Math.round(fraction * 100)}%`;
    if (sub) $('#drill-sub').textContent = sub;
  }
  function hideDrill() {
    drillbar.hidden = true;
    document.body.classList.remove('drilling');
  }
  $('#drill-pause').addEventListener('click', e => {
    const paused = onDrillControl?.('pause');
    e.currentTarget.textContent = paused ? '▶ 繼續' : '⏸ 暫停';
  });
  $('#drill-speed').addEventListener('click', e => {
    const fast = onDrillControl?.('speed');
    e.currentTarget.textContent = fast ? '⏩ 正常速度' : '⏩ 2 倍速';
  });
  $('#drill-stop').addEventListener('click', () => onDrillControl?.('stop'));

  function hideInfo() {
    card.hidden = true;
    current = null;
    document.body.classList.remove('card-open');
  }

  $('#info-share').addEventListener('click', async () => {
    if (!current) return;
    const url = `${location.origin}${location.pathname}#${encodeURIComponent(current.id)}`;
    const title = `${$('#info-title').textContent}｜太平國小 3D 校園`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('已複製連結');
    } catch (err) {
      if (err?.name !== 'AbortError') toast(url);
    }
  });

  // ---------- 小提示 ----------
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
  }

  const needle = $('#compass .compass-needle');
  const setCompass = deg => (needle.style.transform = `rotate(${deg}deg)`);

  syncButtons();
  return { showInfo, showMessage, hideInfo, setCompass, syncButtons, maybeShowHelp, toast, showDrill, updateDrill, hideDrill };
}

// 「5甲」也能找到「五甲教室」
function normalize(s) {
  return s.replace(/[1-6]/g, d => DIGITS[d]).replace(/\s+/g, '').toLowerCase();
}

function buildIndex(data) {
  const out = [];
  const add = (collection, item, extra = '') => {
    const { icon, kicker } = describe(collection, item);
    out.push({
      ref: { collection, id: item.id },
      name: item.name,
      icon,
      kicker,
      search: normalize(`${item.name}${(item.aliases || []).join('')}${kicker}${extra}`),
    });
  };
  for (const r of data.rooms || []) add('rooms', r, r.category === 'class' ? '教室班級' : '');
  for (const s of data.stairs || []) add('stairs', s);
  for (const o of data.outdoor || []) if (!o.noLabel && o.kind !== 'context') add('outdoor', o);
  for (const s of data.safety || []) add('safety', s, SAFETY_TYPE_NAMES[s.type] || '');
  for (const sp of data.sports || []) add('sports', sp, '操場');
  return out;
}
