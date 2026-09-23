// Wizualizacja SVG: model detalu tokarki (ZX, z odbiciem), podgląd XY frezarki,
// backplot ścieżki narzędzia z G-kodu, pan/zoom (mysz, kółko, pinch).
import { latheModel } from '../core/lathe.js';
import { holePoints, BASES } from '../core/mill.js';
import { t } from '../i18n/index.js';

const NS = 'http://www.w3.org/2000/svg';
const COL = {
  stock: '#2d4a6b', stockLine: '#4d9fff', part: '#3b6ea5', partLine: '#8ec5ff', axis: '#556',
  rapid: '#f8514966', feed: '#00c8a0', finish: '#ffd166', thread: '#70c070', groove: '#f06060',
  drill: '#c8b840', tap: '#70c070', bore: '#40c8d8', text: '#9aa4b2', grid: '#ffffff10'
};

// ─── Pan / zoom ─────────────────────────────────────────────────────────────
export function attachPanZoom(svg) {
  if (svg._pz) return svg._pz;
  const st = { base: null, vb: null };
  const setVB = (vb) => { st.vb = vb; svg.setAttribute('viewBox', vb.join(' ')); };
  const getVB = () => svg.getAttribute('viewBox').split(' ').map(Number);
  const ptrs = new Map();
  let lastDist = 0, lastMid = null;
  const client2svg = (cx, cy) => {
    const r = svg.getBoundingClientRect(), vb = getVB();
    return { x: vb[0] + ((cx - r.left) / r.width) * vb[2], y: vb[1] + ((cy - r.top) / r.height) * vb[3] };
  };
  const zoomAt = (px, py, k) => {
    const vb = getVB(), s = client2svg(px, py);
    const w = vb[2] / k, h = vb[3] / k;
    setVB([s.x - (s.x - vb[0]) / k, s.y - (s.y - vb[1]) / k, w, h]);
  };
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  svg.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); svg.setPointerCapture(e.pointerId); lastMid = null; });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.values()];
    const r = svg.getBoundingClientRect(), vb = getVB();
    if (pts.length === 1) {
      const dx = (e.movementX / r.width) * vb[2], dy = (e.movementY / r.height) * vb[3];
      setVB([vb[0] - dx, vb[1] - dy, vb[2], vb[3]]);
    } else if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (lastDist) zoomAt(mid.x, mid.y, d / lastDist);
      if (lastMid) { const v = getVB(); setVB([v[0] - ((mid.x - lastMid.x) / r.width) * v[2], v[1] - ((mid.y - lastMid.y) / r.height) * v[3], v[2], v[3]]); }
      lastDist = d; lastMid = mid;
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); lastDist = 0; lastMid = null; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('dblclick', () => st.base && setVB(st.base.slice()));
  svg.style.touchAction = 'none';
  svg._pz = { fit(vb) { st.base = vb.slice(); setVB(vb.slice()); }, reset() { st.base && setVB(st.base.slice()); } };
  return svg._pz;
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent && parent.appendChild(e);
  return e;
}
function text(parent, x, y, s, attrs = {}) {
  const t = el('text', { x, y, fill: COL.text, 'font-size': attrs.size || 3, 'font-family': 'JetBrains Mono, monospace', ...attrs }, parent);
  t.textContent = s;
  return t;
}

/** Ścieżka łuku SVG w układzie maszynowym (grupa ze scale(1,-1)): G02 → sweep 0, G03 → sweep 1. */
function arcPath(s, ax = 'x', ay = 'y', scaleY = 1) {
  const x1 = s[ax === 'x' ? 'x1' : 'z1'], x2 = s[ax === 'x' ? 'x2' : 'z2'];
  const y1 = (ax === 'x' ? s.y1 : s.x1) * scaleY, y2 = (ax === 'x' ? s.y2 : s.x2) * scaleY;
  let r = s.r, cx, cy;
  if (r == null) {
    const i = (ax === 'x' ? s.i : s.k) || 0, j = (ax === 'x' ? s.j : s.i) * scaleY || 0;
    cx = x1 + i; cy = y1 + j; r = Math.hypot(i, j);
  }
  const sweep = s.dir === 3 ? 1 : 0;
  if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6 && cx != null) {
    // pełny okrąg
    const ox = 2 * (cx - x1), oy = 2 * (cy - y1);
    return `M${x1} ${y1} a${r} ${r} 0 1 ${sweep} ${ox} ${oy} a${r} ${r} 0 1 ${sweep} ${-ox} ${-oy}`;
  }
  let large = 0;
  if (cx != null) {
    const a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    let d = a2 - a1; if (s.dir === 3) { while (d <= 0) d += 2 * Math.PI; } else { while (d >= 0) d -= 2 * Math.PI; }
    large = Math.abs(d) > Math.PI ? 1 : 0;
  }
  return `M${x1} ${y1} A${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

function drawBackplot(g, segs, marks, mode, sw) {
  const lathe = mode === 'lathe';
  const P = (s, k) => lathe ? (k === 'x' ? s.z1 : k === 'x2' ? s.z2 : k === 'y' ? s.x1 / 2 : s.x2 / 2) : s[k === 'x' ? 'x1' : k === 'x2' ? 'x2' : k === 'y' ? 'y1' : 'y2'];
  for (const s of segs) {
    if (!lathe && s.type !== 'arc' && Math.abs(s.x2 - s.x1) < 1e-9 && Math.abs(s.y2 - s.y1) < 1e-9) {
      // ruch tylko w Z — punkt
      if (s.type === 'feed') el('circle', { cx: s.x1, cy: s.y1, r: sw * 1.2, fill: COL.feed, opacity: 0.6 }, g);
      continue;
    }
    if (s.type === 'arc') {
      el('path', { d: arcPath(s, lathe ? 'z' : 'x', 'y', lathe ? 0.5 : 1), fill: 'none', stroke: s.finish ? COL.finish : COL.feed, 'stroke-width': sw, 'stroke-linecap': 'round' }, g);
    } else {
      el('line', {
        x1: P(s, 'x'), y1: P(s, 'y'), x2: P(s, 'x2'), y2: P(s, 'y2'),
        stroke: s.type === 'rapid' ? COL.rapid : s.finish ? COL.finish : COL.feed,
        'stroke-width': s.type === 'rapid' ? sw * 0.7 : sw, 'stroke-dasharray': s.type === 'rapid' ? `${sw * 3} ${sw * 2}` : 'none', 'stroke-linecap': 'round'
      }, g);
    }
  }
  for (const m of marks) {
    if (lathe) {
      if (m.type === 'thread') el('rect', { x: Math.min(m.z1, m.z2), y: -m.x / 2, width: Math.abs(m.z1 - m.z2), height: m.x, fill: COL.thread, opacity: 0.18 }, g);
      if (m.type === 'groove') el('rect', { x: Math.min(m.z1, m.z2) - 1.5, y: -m.x / 2, width: Math.abs(m.z1 - m.z2) + 1.5, height: m.x, fill: 'none', stroke: COL.groove, 'stroke-width': sw }, g);
    } else {
      const c = m.type === 'tap' ? COL.tap : m.type === 'bore' ? COL.bore : COL.drill;
      el('circle', { cx: m.x, cy: m.y, r: sw * 2.5, fill: 'none', stroke: c, 'stroke-width': sw }, g);
      el('path', { d: `M${m.x - sw * 3.5} ${m.y}h${sw * 7}M${m.x} ${m.y - sw * 3.5}v${sw * 7}`, stroke: c, 'stroke-width': sw * 0.6 }, g);
    }
  }
}

// ─── Tokarka ────────────────────────────────────────────────────────────────
export function renderLathe(svg, state, backplot, opts = {}) {
  svg.innerHTML = '';
  const { d: D, l: L } = state.stock;
  const m = latheModel(state);
  const pad = Math.max(D, L) * 0.12 + 4;
  const vb = [-L - pad * 1.6, -D / 2 - pad, L + pad * 2.6, D + pad * 2];
  const pz = attachPanZoom(svg);
  if (!opts.keepView || !svg.getAttribute('viewBox')) pz.fit(vb);
  const sw = Math.max(D, L) / 300;
  const g = el('g', { transform: 'scale(1,-1)' }, svg);
  // siatka
  const grid = el('g', { stroke: COL.grid, 'stroke-width': sw * 0.5 }, g);
  const gs = L > 200 ? 20 : 10;
  for (let z = 0; z >= -L; z -= gs) el('line', { x1: z, y1: -D / 2, x2: z, y2: D / 2 }, grid);
  for (let r = 0; r <= D / 2; r += gs) { el('line', { x1: -L, y1: r, x2: 0, y2: r }, grid); if (r) el('line', { x1: -L, y1: -r, x2: 0, y2: -r }, grid); }
  // surówka (duch)
  el('rect', { x: -L, y: -D / 2, width: L, height: D, fill: COL.stock, 'fill-opacity': 0.25, stroke: COL.stockLine, 'stroke-width': sw * 0.7, 'stroke-dasharray': `${sw * 3} ${sw * 2}` }, g);
  // model detalu — górna i dolna połówka (odbicie), z otworem
  const n = m.zs.length;
  let up = '', lo = '';
  for (let i = 0; i < n; i++) { up += `${i ? 'L' : 'M'}${m.zs[i]} ${m.ro[i]} `; }
  for (let i = n - 1; i >= 0; i--) { up += `L${m.zs[i]} ${m.ri[i]} `; }
  for (let i = 0; i < n; i++) { lo += `${i ? 'L' : 'M'}${m.zs[i]} ${-m.ro[i]} `; }
  for (let i = n - 1; i >= 0; i--) { lo += `L${m.zs[i]} ${-m.ri[i]} `; }
  const partAttrs = { fill: COL.part, 'fill-opacity': 0.75, stroke: COL.partLine, 'stroke-width': sw, 'stroke-linejoin': 'round' };
  el('path', { d: up + 'Z', ...partAttrs }, g);
  el('path', { d: lo + 'Z', ...partAttrs, 'fill-opacity': 0.45 }, g);
  // znaczniki: gwint (kreskowanie), rowek, odcięcie
  for (const mk of m.marks) {
    if (mk.type === 'thread') {
      const hg = el('g', { stroke: COL.thread, 'stroke-width': sw * 0.8 }, g);
      const depth = Math.min(mk.r * 0.25, 0.62 * (mk.pitch || 1.5));
      for (let z = mk.z1; z > mk.z2; z -= mk.pitch || 1.5) {
        for (const sgn of [1, -1]) el('line', { x1: z, y1: sgn * mk.r, x2: z - (mk.pitch || 1.5) * 0.5, y2: sgn * (mk.r - depth) }, hg);
      }
    }
    if (mk.type === 'cutoff') el('line', { x1: mk.z1, y1: -D / 2 - 2, x2: mk.z1, y2: D / 2 + 2, stroke: COL.groove, 'stroke-width': sw, 'stroke-dasharray': `${sw * 2} ${sw * 2}` }, g);
  }
  // oś
  el('line', { x1: -L - pad, y1: 0, x2: pad, y2: 0, stroke: COL.axis, 'stroke-width': sw * 0.6, 'stroke-dasharray': `${sw * 6} ${sw * 2} ${sw} ${sw * 2}` }, g);
  // backplot
  if (backplot) {
    const bg = el('g', { opacity: opts.backplotOpacity ?? 0.9 }, g);
    drawBackplot(bg, backplot.segs, backplot.marks, 'lathe', sw * 0.8);
  }
  // punkt zerowy i osie
  el('circle', { cx: 0, cy: 0, r: sw * 2, fill: '#fff' }, g);
  el('line', { x1: 0, y1: 0, x2: pad * 0.6, y2: 0, stroke: '#f85149', 'stroke-width': sw }, g);
  el('line', { x1: 0, y1: 0, x2: 0, y2: pad * 0.6, stroke: '#7ee787', 'stroke-width': sw }, g);
  // teksty (poza grupą odbitą)
  const fs = Math.max(D, L) / 28;
  text(svg, pad * 0.65, fs * 0.35, 'Z+', { fill: '#f85149', size: fs });
  text(svg, fs * 0.3, -pad * 0.65, 'X+', { fill: '#7ee787', size: fs });
  text(svg, -L / 2, D / 2 + pad * 0.7, `⌀${D} × L${L}`, { 'text-anchor': 'middle', size: fs });
  const xmin = Math.min(...Array.from(m.ro).filter((r) => r > 0)) * 2;
  text(svg, -L / 2, -D / 2 - pad * 0.35, `${t('min')} ⌀${xmin.toFixed(1)}`, { 'text-anchor': 'middle', size: fs * 0.85 });
  return m;
}

// ─── Frezarka ───────────────────────────────────────────────────────────────
export function renderMill(svg, state, backplot, opts = {}) {
  svg.innerHTML = '';
  const { x: X, y: Y } = state.stock;
  const b = BASES[state.base ?? 6];
  const off = [[0, Y], [X / 2, Y], [X, Y], [0, Y / 2], [X / 2, Y / 2], [X, Y / 2], [0, 0], [X / 2, 0], [X, 0]][b.i];
  // współrzędne programowe: detal zajmuje [−ox, X−ox] × [−oy, Y−oy]
  const ox = off[0], oy = off[1];
  const pad = Math.max(X, Y) * 0.12 + 4;
  const vb = [-ox - pad, -(Y - oy) - pad, X + 2 * pad, Y + 2 * pad];
  const pz = attachPanZoom(svg);
  if (!opts.keepView || !svg.getAttribute('viewBox')) pz.fit(vb);
  const sw = Math.max(X, Y) / 300;
  const g = el('g', { transform: 'scale(1,-1)' }, svg);
  const grid = el('g', { stroke: COL.grid, 'stroke-width': sw * 0.5 }, g);
  const gs = Math.max(X, Y) > 300 ? 50 : 10;
  for (let x = 0; x <= X; x += gs) el('line', { x1: x - ox, y1: -oy, x2: x - ox, y2: Y - oy }, grid);
  for (let y = 0; y <= Y; y += gs) el('line', { x1: -ox, y1: y - oy, x2: X - ox, y2: y - oy }, grid);
  el('rect', { x: -ox, y: -oy, width: X, height: Y, fill: COL.stock, 'fill-opacity': 0.35, stroke: COL.stockLine, 'stroke-width': sw }, g);
  // geometria operacji (współrzędne programowe — użytkownik podaje je względem bazy)
  for (const op of state.ops) {
    const t = state.tools[op.tool - 1] || {}; const td = t.d || 6;
    const col = (opts.opColors || {})[op.type] || '#fff';
    switch (op.type) {
      case 'face': case 'prof': case 'pock': case 'chamfer':
        el('rect', { x: Math.min(op.x1, op.x2), y: Math.min(op.y1, op.y2), width: Math.abs(op.x2 - op.x1), height: Math.abs(op.y2 - op.y1), rx: op.r || 0, fill: op.type === 'pock' ? col : 'none', 'fill-opacity': 0.15, stroke: col, 'stroke-width': sw, 'stroke-dasharray': op.type === 'face' ? `${sw * 3} ${sw * 2}` : 'none' }, g); break;
      case 'circ': el('circle', { cx: op.cx, cy: op.cy, r: op.r, fill: 'none', stroke: col, 'stroke-width': sw }, g); break;
      case 'cpock': el('circle', { cx: op.cx, cy: op.cy, r: op.d / 2, fill: col, 'fill-opacity': 0.15, stroke: col, 'stroke-width': sw }, g); break;
      case 'slot': el('line', { x1: op.x1, y1: op.y1, x2: op.x2, y2: op.y2, stroke: col, 'stroke-width': td, 'stroke-linecap': 'round', opacity: 0.35 }, g); break;
      case 'bore': el('circle', { cx: op.cx, cy: op.cy, r: op.dia / 2, fill: 'none', stroke: col, 'stroke-width': sw }, g); break;
      case 'drill': case 'tap':
        holePoints(op).forEach((q, k) => { el('circle', { cx: q.x, cy: q.y, r: Math.max(td / 2, sw * 2), fill: col, 'fill-opacity': op.type === 'tap' ? 0.3 : 0.1, stroke: col, 'stroke-width': sw * 0.8 }, g); });
        break;
    }
  }
  if (backplot) {
    const bg = el('g', { opacity: opts.backplotOpacity ?? 0.9 }, g);
    drawBackplot(bg, backplot.segs, backplot.marks, 'mill', sw * 0.8);
  }
  // baza G54
  el('circle', { cx: 0, cy: 0, r: sw * 2.5, fill: 'none', stroke: '#fff', 'stroke-width': sw }, g);
  el('circle', { cx: 0, cy: 0, r: sw, fill: '#fff' }, g);
  el('line', { x1: 0, y1: 0, x2: pad * 0.7, y2: 0, stroke: '#f85149', 'stroke-width': sw * 1.2 }, g);
  el('line', { x1: 0, y1: 0, x2: 0, y2: pad * 0.7, stroke: '#7ee787', 'stroke-width': sw * 1.2 }, g);
  const fs = Math.max(X, Y) / 28;
  text(svg, pad * 0.75, fs * 0.35, 'X+', { fill: '#f85149', size: fs });
  text(svg, fs * 0.3, -pad * 0.75, 'Y+', { fill: '#7ee787', size: fs });
  text(svg, -ox + X / 2, -(Y - oy) - pad * 0.4, `${X} × ${Y} × ${state.stock.z} mm  ·  ${String(state.wcs || 'G54').replace(/^G154P(\d+)$/, 'G154 P$1')} ${t(b.t)}`, { 'text-anchor': 'middle', size: fs });
  // numery otworów
  let hn = 1;
  for (const op of state.ops) if (op.type === 'drill' || op.type === 'tap') holePoints(op).forEach((q) => text(svg, q.x + sw * 3, -q.y - sw * 3, String(hn++), { size: fs * 0.6 }));
}

/** Widok boczny Z (przekrój głębokości operacji) dla frezarki. */
export function renderMillSide(svg, state, opts = {}) {
  svg.innerHTML = '';
  const { x: X, z: Z } = state.stock;
  const ox = [[0], [X / 2], [X], [0], [X / 2], [X], [0], [X / 2], [X]][state.base ?? 6][0];
  const pad = Math.max(X, Z) * 0.1 + 3;
  svg.setAttribute('viewBox', [-ox - pad, -Z - pad, X + 2 * pad, Z + 2 * pad].join(' '));
  const sw = X / 300;
  const g = el('g', {}, svg);
  el('rect', { x: -ox, y: -Z, width: X, height: Z, fill: COL.stock, 'fill-opacity': 0.35, stroke: COL.stockLine, 'stroke-width': sw }, g);
  for (const op of state.ops) {
    const col = (opts.opColors || {})[op.type] || '#fff';
    const t = state.tools[op.tool - 1] || {}; const td = t.d || 6;
    const zt = op.zt ?? 0; const depth = Math.abs(zt);
    let x1, x2;
    if ('x1' in op && 'x2' in op && op.type !== 'drill' && op.type !== 'tap') { x1 = Math.min(op.x1, op.x2); x2 = Math.max(op.x1, op.x2); }
    else if (op.type === 'circ') { x1 = op.cx - op.r; x2 = op.cx + op.r; }
    else if (op.type === 'cpock') { x1 = op.cx - op.d / 2; x2 = op.cx + op.d / 2; }
    else if (op.type === 'bore') { x1 = op.cx - op.dia / 2; x2 = op.cx + op.dia / 2; }
    if (op.type === 'drill' || op.type === 'tap') { holePoints(op).forEach((q) => el('rect', { x: q.x - td / 2, y: -depth, width: td, height: depth, fill: col, 'fill-opacity': 0.5 }, g)); continue; }
    if (x1 == null) continue;
    el('rect', { x: x1, y: -depth, width: x2 - x1, height: Math.max(depth, sw * 2), fill: col, 'fill-opacity': op.type === 'face' ? 0.4 : 0.35, stroke: col, 'stroke-width': sw * 0.6 }, g);
  }
  el('line', { x1: -ox - pad, y1: 0, x2: X - ox + pad, y2: 0, stroke: '#7ee787', 'stroke-width': sw }, g);
  text(svg, -ox + X / 2, pad * 0.8, t('przekrój XZ — Z0 = góra detalu, grubość {z} mm', { z: Z }), { 'text-anchor': 'middle', size: X / 30 });
}
