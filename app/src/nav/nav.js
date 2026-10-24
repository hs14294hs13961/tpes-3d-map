// 路網與找路：自動從建物、樓梯、教室資料產生，不必手動畫節點。
// - 每棟走廊（1F、2F）沿中線放節點，教室門口、樓梯口、走廊交會處都會是節點
// - 樓梯內部：第一段→平台→第二段
// - 戶外：走廊柱子之間的出入口、障礙物轉角、集合點，彼此「走得過去」就連線
// 「走得過去」一律用人物碰撞實際模擬，所以路線一定走得通。
import { wingLayout, stairLayout, rcx, rcz, toWorld } from '../scene/layout.js';

const RADIUS = 0.3;

export function createNav(data, collision) {
  const { buildingBase: base, floorHeight: fh } = data.settings;
  const nodes = [];
  const adj = new Map();
  const doorNode = new Map(); // roomId → node
  const stairTop = new Map(); // stairId → 二樓那一端的節點
  const assemblyNode = new Map(); // safety id → node

  const addNode = (x, z, y, kind, extra = {}) => {
    const n = { id: nodes.length, x, z, y, kind, ...extra };
    nodes.push(n);
    adj.set(n.id, []);
    return n;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y - b.y) * 2);
  const link = (a, b) => {
    if (a === b) return;
    const c = dist(a, b);
    adj.get(a.id).push({ to: b.id, cost: c });
    adj.get(b.id).push({ to: a.id, cost: c });
  };

  // 模擬人物從 a 直走到 b，途中被推開或站不住就算走不通
  function walkTest(a, b) {
    let { x, z, y } = a;
    const total = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(total / 0.35));
    for (let i = 1; i <= n; i++) {
      const tx = a.x + ((b.x - a.x) * i) / n;
      const tz = a.z + ((b.z - a.z) * i) / n;
      const r = collision.move(x, z, y, tx, tz, RADIUS);
      if (r.blocked || Math.hypot(r.x - tx, r.z - tz) > 0.2) return false;
      ({ x, z, y } = r);
    }
    return Math.abs(y - b.y) < 0.6;
  }

  // ---------- 走廊中線 ----------
  const lines = [];
  for (const w of data.buildings || []) {
    const L = wingLayout(w, data.buildings);
    if (!L.corr) continue;
    const c = L.corr;
    const la = L.alongX ? { x: c.x0 + 0.5, z: rcz(c) } : { x: rcx(c), z: c.z0 + 0.5 };
    const lb = L.alongX ? { x: c.x1 - 0.5, z: rcz(c) } : { x: rcx(c), z: c.z1 - 0.5 };
    const a = toWorld(w, la.x, la.z);
    const b = toWorld(w, lb.x, lb.z);
    for (let f = 1; f <= w.floors; f++) {
      lines.push({ wing: w, layout: L, floor: f, y: base + (f - 1) * fh, a, b, len: Math.hypot(b.x - a.x, b.z - a.z), extras: [] });
    }
  }
  const project = (line, x, z) => {
    const vx = (line.b.x - line.a.x) / line.len;
    const vz = (line.b.z - line.a.z) / line.len;
    const t = Math.max(0, Math.min(line.len, (x - line.a.x) * vx + (z - line.a.z) * vz));
    const px = line.a.x + vx * t;
    const pz = line.a.z + vz * t;
    return { t, x: px, z: pz, d: Math.hypot(x - px, z - pz) };
  };
  const nearestLine = (x, z, floor) => {
    let best = null;
    for (const line of lines) {
      if (line.floor !== floor) continue;
      const p = project(line, x, z);
      if (!best || p.d < best.p.d) best = { line, p };
    }
    return best;
  };
  const addExtra = (line, t, info) => line.extras.push({ t, ...info });

  // 教室門口：教室中心投影到同樓層最近的走廊
  for (const r of data.rooms || []) {
    const hit = nearestLine(r.x, r.z, r.floor);
    if (hit && hit.p.d < 16) addExtra(hit.line, hit.p.t, { door: r.id });
  }

  // 樓梯：內部節點＋上下兩個出入口接到走廊
  const stairLinks = [];
  for (const st of data.stairs || []) {
    const L = stairLayout(st, data.settings);
    const at = (u, v) => {
      const l = L.toLocal(u, v);
      const p = toWorld(st, l.lx, l.lz);
      return { ...p, y: L.heightUV(u, Math.max(0, v)) };
    };
    const q = L.W / 4;
    const chain = [
      at(q, 0.4),
      at(q, L.run - 0.3),
      at(L.W / 2, L.run + L.landing / 2),
      at(3 * q, L.run - 0.3),
      at(3 * q, 0.4),
    ].map((p, i) => addNode(p.x, p.z, p.y, 'stair', { stair: st.id, step: i }));
    for (let i = 0; i < chain.length - 1; i++) link(chain[i], chain[i + 1]);
    stairTop.set(st.id, chain[4]);
    const out1 = toWorld(st, L.toLocal(q, -1.2).lx, L.toLocal(q, -1.2).lz);
    const out2 = toWorld(st, L.toLocal(3 * q, -1.2).lx, L.toLocal(3 * q, -1.2).lz);
    for (const [pt, floor, inner] of [[out1, 1, chain[0]], [out2, 2, chain[4]]]) {
      const hit = nearestLine(pt.x, pt.z, floor);
      if (!hit) continue;
      const key = { stairLink: stairLinks.length };
      stairLinks.push({ inner });
      addExtra(hit.line, hit.p.t, key);
    }
  }

  // 走廊交會：一條走廊的端點靠近另一條走廊中線，就接起來
  const junctions = [];
  for (const A of lines) {
    for (const B of lines) {
      if (A === B || A.floor !== B.floor) continue;
      for (const [end, t] of [[A.a, 0], [A.b, A.len]]) {
        const p = project(B, end.x, end.z);
        if (p.d > 3.2) continue;
        const id = junctions.length;
        junctions.push({ A, tA: t, B, tB: p.t });
        addExtra(A, t, { junction: id, side: 'A' });
        addExtra(B, p.t, { junction: id, side: 'B' });
      }
    }
  }

  // 一樓：柱子之間的出入口（往外 1.2 m 放戶外節點）
  const gapOuts = [];
  for (const line of lines) {
    if (line.floor !== 1) continue;
    const cols = line.layout.columns.map(c => toWorld(line.wing, c.x, c.z));
    for (let i = 0; i < cols.length - 1; i++) {
      if (Math.hypot(cols[i + 1].x - cols[i].x, cols[i + 1].z - cols[i].z) > 6) continue; // 中間是交會口，不是柱距
      const mx = (cols[i].x + cols[i + 1].x) / 2;
      const mz = (cols[i].z + cols[i + 1].z) / 2;
      const p = project(line, mx, mz);
      const ox = mx - p.x;
      const oz = mz - p.z;
      const ol = Math.hypot(ox, oz) || 1;
      const id = gapOuts.length;
      gapOuts.push({ x: mx + (ox / ol) * 1.2, z: mz + (oz / ol) * 1.2 });
      addExtra(line, p.t, { gap: id });
    }
  }

  // 每條中線建節點並依序相連（相距 0.4 m 內的合併）
  const junctionNode = new Map();
  const gapInner = new Map();
  const endNodes = [];
  for (const line of lines) {
    for (let t = 0; t <= line.len; t += 5) addExtra(line, t, {});
    addExtra(line, line.len, {});
    line.extras.sort((p, q) => p.t - q.t);
    let prev = null;
    let first = null;
    let prevT = -99;
    const vx = (line.b.x - line.a.x) / line.len;
    const vz = (line.b.z - line.a.z) / line.len;
    for (const e of line.extras) {
      let n = prev;
      if (!prev || e.t - prevT > 0.4) {
        n = addNode(line.a.x + vx * e.t, line.a.z + vz * e.t, line.y, 'corridor', { floor: line.floor });
        if (prev) link(prev, n);
        first ??= n;
        prev = n;
        prevT = e.t;
      }
      if (e.door) doorNode.set(e.door, n);
      if (e.stairLink !== undefined) stairLinks[e.stairLink].outer = n;
      if (e.junction !== undefined) junctionNode.set(`${e.junction}${e.side}`, n);
      if (e.gap !== undefined) gapInner.set(e.gap, n);
    }
    if (line.floor === 1) {
      endNodes.push({ line, node: first, dir: { x: -vx, z: -vz }, at: line.a });
      endNodes.push({ line, node: prev, dir: { x: vx, z: vz }, at: line.b });
    }
  }

  const problems = [];
  for (const s of stairLinks) {
    if (!s.outer) continue;
    if (walkTest(s.outer, s.inner)) link(s.outer, s.inner);
    else problems.push(`樓梯 ${s.inner.stair}（第 ${s.inner.step} 點）出入口接不到走廊`);
  }
  junctions.forEach((j, id) => {
    const a = junctionNode.get(`${id}A`);
    const b = junctionNode.get(`${id}B`);
    if (a && b && walkTest(a, b)) link(a, b);
  });

  // ---------- 戶外節點 ----------
  const outdoor = [];
  gapOuts.forEach((p, id) => {
    const inner = gapInner.get(id);
    const n = addNode(p.x, p.z, collision.heightAt(p.x, p.z, 0), 'out');
    if (inner && walkTest(inner, n)) {
      link(inner, n);
      outdoor.push(n);
    }
  });
  for (const e of endNodes) {
    if (!e.node) continue;
    const p = { x: e.at.x + e.dir.x * 1.8, z: e.at.z + e.dir.z * 1.8 };
    const n = addNode(p.x, p.z, collision.heightAt(p.x, p.z, 0), 'out');
    if (walkTest(e.node, n)) {
      link(e.node, n);
      outdoor.push(n);
    }
  }
  // 大型障礙物的四個角（往外 1.2 m），讓戶外路線可以繞過去
  const cornerOf = (item, w, d) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = toWorld(item, sx * (w / 2 + 1.2), sz * (d / 2 + 1.2));
      outdoor.push(addNode(p.x, p.z, 0, 'corner'));
    }
  };
  for (const o of data.outdoor || []) {
    if (['stage', 'hut', 'treehouse', 'context'].includes(o.kind)) cornerOf(o, o.w, o.d);
  }
  for (const r of data.rooms || []) {
    // 建物外的一樓空間（例如體育器材室）
    const inWing = lines.some(l => l.floor === 1 && project(l, r.x, r.z).d < 16);
    if (r.floor === 1 && !inWing) cornerOf(r, r.w, r.d);
  }
  for (const s of data.safety || []) {
    if (s.type !== 'assembly') continue;
    const n = addNode(s.x, s.z, 0, 'assembly', { safety: s.id });
    assemblyNode.set(s.id, n);
    outdoor.push(n);
  }
  // 戶外節點兩兩之間走得到就連線（60 m 內）
  for (let i = 0; i < outdoor.length; i++) {
    for (let j = i + 1; j < outdoor.length; j++) {
      const a = outdoor[i];
      const b = outdoor[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 60) continue;
      if (walkTest(a, b)) link(a, b);
    }
  }

  // ---------- A* ----------
  function astar(start, goal) {
    const open = new Set([start.id]);
    const g = new Map([[start.id, 0]]);
    const f = new Map([[start.id, dist(start, goal)]]);
    const from = new Map();
    while (open.size) {
      let cur = null;
      for (const id of open) if (cur === null || f.get(id) < f.get(cur)) cur = id;
      if (cur === goal.id) {
        const path = [nodes[cur]];
        while (from.has(cur)) {
          cur = from.get(cur);
          path.unshift(nodes[cur]);
        }
        return path;
      }
      open.delete(cur);
      for (const { to, cost } of adj.get(cur)) {
        const ng = g.get(cur) + cost;
        if (ng < (g.get(to) ?? Infinity)) {
          from.set(to, cur);
          g.set(to, ng);
          f.set(to, ng + dist(nodes[to], goal));
          open.add(to);
        }
      }
    }
    return null;
  }

  // 暫時把任意一點接進路網（找附近走得到的節點），用完要拿掉
  function withTemp(points, fn) {
    const temps = points.map(p => addNode(p.x, p.z, p.y, 'temp'));
    for (const t of temps) {
      const near = nodes
        .filter(n => n.kind !== 'temp' && Math.abs(n.y - t.y) < 1.2)
        .map(n => ({ n, d: Math.hypot(n.x - t.x, n.z - t.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12);
      let linked = 0;
      for (const { n } of near) {
        if (walkTest(t, n)) {
          link(t, n);
          if (++linked >= 4) break;
        }
      }
    }
    if (temps.length === 2 && walkTest(temps[0], temps[1])) link(temps[0], temps[1]);
    try {
      return fn(...temps);
    } finally {
      for (const t of temps) {
        for (const { to } of adj.get(t.id)) adj.set(to, adj.get(to).filter(e => e.to !== t.id));
        adj.delete(t.id);
      }
      nodes.length -= temps.length;
    }
  }

  const toPoints = path => path && path.map(n => ({ x: n.x, z: n.z, y: n.y }));
  const length = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z, p.y - pts[i - 1].y) : 0), 0);

  // 從某一點走到某一點
  function route(from, to) {
    return withTemp([from, to], (a, b) => toPoints(astar(a, b)));
  }

  // 疏散路線：教室門口 →（指定樓梯）→ 集合點
  function evacuation(roomId) {
    const room = (data.rooms || []).find(r => r.id === roomId);
    const plan = room?.evacuation;
    const door = doorNode.get(roomId);
    const goal = assemblyNode.get(plan?.assembly || 'assembly-center');
    if (!door || !goal) return null;
    let path;
    if (plan.stair && stairTop.has(plan.stair)) {
      const top = stairTop.get(plan.stair);
      const p1 = astar(door, top);
      const p2 = astar(top, goal);
      path = p1 && p2 ? [...p1, ...p2.slice(1)] : null;
    } else {
      path = astar(door, goal);
    }
    return toPoints(path);
  }

  // 某個地點的「目的地」：教室＝門口，樓梯＝一樓入口，其他＝原地（附近走得到的點）
  function destinationOf(collection, item) {
    if (collection === 'rooms' && doorNode.has(item.id)) return doorNode.get(item.id);
    if (collection === 'stairs') {
      const top = stairTop.get(item.id);
      const bottom = nodes.find(n => n.kind === 'stair' && n.stair === item.id && n.step === 0);
      return bottom || top;
    }
    const y = item.floor > 1 ? base + (item.floor - 1) * fh : 0;
    return { x: item.x, z: item.z, y };
  }

  function routeTo(from, collection, item) {
    const dest = destinationOf(collection, item);
    const p = collision.resolve(dest.x, dest.z, RADIUS, dest.y);
    if (Math.hypot(p.x - dest.x, p.z - dest.z) < 0.3) {
      return route(from, { x: p.x, z: p.z, y: collision.heightAt(p.x, p.z, dest.y) });
    }
    // 目的地本身是障礙物（司令台、樹屋…）：改走到旁邊，四邊中點與四角由近到遠試
    const w = (item.w ?? 2) / 2 + 0.8;
    const d = (item.d ?? 2) / 2 + 0.8;
    const spots = [[0, -d], [w, 0], [0, d], [-w, 0], [-w, -d], [w, -d], [w, d], [-w, d]]
      .map(([lx, lz]) => toWorld(item, lx, lz))
      .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    for (const s of spots) {
      const q = collision.resolve(s.x, s.z, RADIUS, dest.y);
      if (Math.hypot(q.x - s.x, q.z - s.z) > 0.3) continue;
      const pts = route(from, { x: q.x, z: q.z, y: collision.heightAt(q.x, q.z, dest.y) });
      if (pts) return pts;
    }
    // 在教室裡面的東西（例如設備室的物資）：走到同樓層最近的走廊節點（門口）
    const near = nodes
      .filter(n => n.kind === 'corridor' && Math.abs(n.y - dest.y) < 1.2)
      .sort((a, b) => Math.hypot(a.x - dest.x, a.z - dest.z) - Math.hypot(b.x - dest.x, b.z - dest.z));
    for (const n of near.slice(0, 3)) {
      const pts = route(from, n);
      if (pts) return pts;
    }
    return null;
  }

  if (problems.length) console.warn('[路網]', problems.join('；'));

  return { route, routeTo, evacuation, length, nodes, doorNode, stairTop };
}
