// 3D 校園小遊戲的共用介面：開場說明、上方計時列、結算畫面、回到群島、寫入群島彩蛋。
// 群島網站和 3D 地圖在同一個網域（hs14294hs13961.github.io），localStorage 共用，
// 過關時直接把 `egg:<id>` 寫進群島的訪客進度，回到群島分頁就會跳出彩蛋卡。

const SAVE_KEY = 'tpes-islands-save-v1';
const SLOT_COUNT = 3;

/** 寫入群島彩蛋，回傳是不是第一次拿到。 */
export function awardEgg(id) {
  try {
    let s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !Array.isArray(s.slots) || s.slots.length !== SLOT_COUNT || !s.slots[s.slot]) {
      s = { slot: 0, quiet: false, slots: Array.from({ length: SLOT_COUNT }, () => ({})) };
    }
    const slot = s.slots[s.slot];
    if (`egg:${id}` in slot) return false;
    slot[`egg:${id}`] = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // 無痕模式存不了：照樣能玩，只是不記彩蛋
  }
}

/** 群島網站的網址（本機開發、預覽版、正式版各自對應）。 */
export function islandsUrl() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:5180/';
  return new URL(location.pathname.includes('/preview/') ? '../../tpes-islands/preview/' : '../tpes-islands/', location.href).href;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, cls, onClick) {
  const b = el('button', `btn ${cls || ''}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// 從群島頁面上的全螢幕框打開的（群島 ui/gameOverlay.js）：離開時通知群島把框收起來
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window && params.get('embed') === '1';

function backToIslands() {
  if (embedded) {
    window.parent.postMessage({ type: 'tpes-game', action: 'close' }, new URL(islandsUrl()).origin);
    return;
  }
  location.href = islandsUrl();
}

/** 離開遊戲：在群島裡就收起來，不然回到一般的 3D 校園地圖。 */
function leave() {
  if (embedded) backToIslands();
  else location.href = location.pathname;
}

export function createGameUi({ icon, title }) {
  document.body.classList.add('gaming');
  const fromIslands = params.get('from') === 'islands';

  const bar = el('div', 'game-bar');
  const name = el('div', 'game-name', `${icon} ${title}`);
  const stats = el('div', 'game-stats');
  const exit = button('✕', 'game-exit', leave);
  exit.setAttribute('aria-label', embedded ? '離開小遊戲、回到群島' : '離開小遊戲');
  bar.append(name, stats, exit);

  const panel = el('div', 'game-panel');
  panel.hidden = true;
  const big = el('div', 'game-big');
  big.hidden = true;
  big.setAttribute('aria-live', 'assertive');
  document.body.append(bar, panel, big);

  const statEls = {};
  function setStat(key, label, value) {
    if (!statEls[key]) {
      const s = el('div', 'game-stat');
      s.append(el('span', 'game-stat-label', label), el('b', 'game-stat-value'));
      stats.append(s);
      statEls[key] = s;
    }
    statEls[key].querySelector('b').textContent = value;
  }

  function show(children) {
    const box = el('div', 'game-card');
    box.append(...children);
    panel.replaceChildren(box);
    panel.hidden = false;
    box.querySelector('.btn.primary')?.focus();
  }

  /** 開場說明：按「開始」才會 resolve。 */
  function intro({ lead, rules, startLabel = '開始！' }) {
    return new Promise((done) => {
      const list = el('ul', 'game-rules');
      rules.forEach((r) => list.append(el('li', '', r)));
      show([
        el('div', 'game-kicker', `${icon} 太平小遊戲`),
        el('h2', 'game-title', title),
        el('p', 'game-lead', lead),
        list,
        el('div', 'game-btns', ''),
      ]);
      panel.querySelector('.game-btns').append(
        button(startLabel, 'primary', () => { panel.hidden = true; done(); }),
        button('離開', '', leave),
      );
    });
  }

  /** 結算畫面。win：過關；egg：這次是不是第一次拿到彩蛋。 */
  function result({ win, heading, lines, egg, onRetry }) {
    const kids = [
      el('div', 'game-kicker', win ? '🎉 過關！' : '⏰ 再試一次'),
      el('h2', 'game-title', heading),
      ...lines.map((l) => el('p', 'game-lead', l)),
    ];
    if (win) {
      kids.push(el('p', 'game-egg', egg
        ? (fromIslands ? '🥚 你拿到一顆太平小彩蛋！按「回到群島」就能打開它。' : '🥚 你拿到一顆太平小彩蛋！到「太平群島」網站就能打開它。')
        : '🥚 這顆彩蛋你已經收過囉，再挑戰看看能不能更快！'));
    }
    const btns = el('div', 'game-btns');
    btns.append(button('再玩一次', win ? '' : 'primary', () => { panel.hidden = true; onRetry(); }));
    btns.append(button(fromIslands ? '回到群島' : '去太平群島', win ? 'primary' : '', backToIslands));
    if (!embedded) btns.append(button('逛校園', '', leave)); // 在群島裡玩的就不換到整個校園
    kids.push(btns);
    show(kids);
  }

  /** 畫面中間的大字（倒數、「完美接棒！」）。 */
  let bigTimer = 0;
  function flash(text, ms = 900, tone = '') {
    big.textContent = text;
    big.className = `game-big ${tone}`;
    big.hidden = false;
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => (big.hidden = true), ms);
  }

  return { setStat, intro, result, flash, el, button, root: document.body };
}
