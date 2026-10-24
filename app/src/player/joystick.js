// 虛擬搖桿：回傳 x（右為正）、y（往前為正），範圍 -1～1。
export function createJoystick(base) {
  const knob = base.querySelector('.joy-knob');
  const out = { x: 0, y: 0, active: false };
  let id = null;

  function setFrom(e) {
    const r = base.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R);
    let dy = e.clientY - (r.top + R);
    const len = Math.hypot(dx, dy);
    const max = R * 0.7;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    out.x = dx / max;
    out.y = -dy / max;
  }

  function reset() {
    id = null;
    out.x = out.y = 0;
    out.active = false;
    knob.style.transform = '';
    base.classList.remove('on');
  }

  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    id = e.pointerId;
    try {
      base.setPointerCapture(id); // 手指滑出搖桿範圍也繼續追蹤
    } catch {}
    out.active = true;
    base.classList.add('on');
    setFrom(e);
  });
  base.addEventListener('pointermove', e => {
    if (e.pointerId === id) setFrom(e);
  });
  base.addEventListener('pointerup', e => e.pointerId === id && reset());
  base.addEventListener('pointercancel', e => e.pointerId === id && reset());

  return out;
}
