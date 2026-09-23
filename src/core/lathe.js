// Generator G-kodu — tokarka Haas SL-20T (Classic Control, G99 mm/obr, G18, programowanie średnicowe).
// Czyste funkcje: state → { lines:[], warnings:[], time:{...}, profile }.
import { getMaterial } from './materials.js';
import { rpm as calcRpm, metricThread, threadPasses, ascii } from './calc.js';
import { getPost, withDefaults, tpl, finalize, wcsCode } from './posts.js';
import { t as tr, tg } from '../i18n/index.js';

export const LATHE_TOOL_TYPES = [
  'Nóż zewn. zgrubny CNMG', 'Nóż wykończeniowy DCMT/CCMT', 'Nóż kopiujący VBMT',
  'Wytaczak (boring bar)', 'Nóż rowkujący MGMN', 'Nóż gwintowy 16ER', 'Nóż gwintowy wewn. 16IR',
  'Wiertło', 'Nawiertak NC', 'Nóż odcinający', 'Rozwiertak', 'Gwintownik'
];

export const LATHE_OPS = {
  face:   { label: 'Czoło',            full: 'Wyrównanie czoła',       color: '#4ec994' },
  rough:  { label: 'G71',              full: 'Zgrubna G71 (profil)',   color: '#f0a840' },
  finish: { label: 'G70',              full: 'Wykończenie G70',        color: '#58b0f5' },
  turn:   { label: 'Toczenie',         full: 'Toczenie proste',        color: '#b078f5' },
  taper:  { label: 'Stożek',           full: 'Toczenie stożkowe',      color: '#d8a030' },
  bore:   { label: 'Wytaczanie',       full: 'Wytaczanie G71 wewn.',   color: '#40c8d8' },
  groove: { label: 'Rowek',            full: 'Rowkowanie G75',         color: '#f06060' },
  thread: { label: 'Gwint',            full: 'Gwintowanie G76',        color: '#70c070' },
  drill:  { label: 'Wiercenie',        full: 'Wiercenie G83 / G74',    color: '#c8b840' },
  cutoff: { label: 'Odcięcie',         full: 'Odcinanie',              color: '#f04040' }
};

const f3 = (v) => Number(v).toFixed(3);
const f4 = (v) => Number(v).toFixed(4);

/** Domyślne narzędzia (T1..T12) dla wybranego materiału. */
export function defaultLatheTools(matKey, custom) {
  const m = getMaterial(matKey, custom).turn;
  return [
    { no: 1, type: LATHE_TOOL_TYPES[0], vc: m.vc_r, f: m.f_r, ap: m.ap, r: 0.8 },
    { no: 2, type: LATHE_TOOL_TYPES[1], vc: m.vc_fn, f: m.f_fn, ap: 0.5, r: 0.4 },
    { no: 3, type: LATHE_TOOL_TYPES[3], vc: m.vc_fn, f: m.f_fn, ap: 1, r: 0.4 },
    { no: 4, type: LATHE_TOOL_TYPES[4], vc: m.vc_gr, f: m.f_gr, ap: 0.5, r: 0.2, w: 3 },
    { no: 5, type: LATHE_TOOL_TYPES[5], vc: m.vc_th, f: 0, ap: 0.3, r: 0.1 },
    { no: 6, type: LATHE_TOOL_TYPES[7], vc: m.vc_dr, f: m.f_dr, ap: 0, r: 0, d: 10 },
    { no: 7, type: LATHE_TOOL_TYPES[9], vc: m.vc_gr, f: 0.05, ap: 0, r: 0.1, w: 3 },
    { no: 8, type: '', vc: 0, f: 0, ap: 0, r: 0 },
    { no: 9, type: '', vc: 0, f: 0, ap: 0, r: 0 },
    { no: 10, type: '', vc: 0, f: 0, ap: 0, r: 0 },
    { no: 11, type: '', vc: 0, f: 0, ap: 0, r: 0 },
    { no: 12, type: '', vc: 0, f: 0, ap: 0, r: 0 }
  ];
}

/** Domyślne parametry nowej operacji. */
export function defaultLatheOp(type, state) {
  const m = getMaterial(state.material, state.customMaterials).turn;
  const { d, l, dmin } = state.stock;
  const D = {
    face:   { tool: 1, vc: m.vc_f, f: 0.2, ap: 0.5, cut: 0.5 },
    rough:  { tool: 1, vc: m.vc_r, f: m.f_r, ap: m.ap, sx: 0.3, sz: 0.1,
              profile: [{ x: dmin, z: 0, c: 1 }, { x: dmin, z: -l * 0.6 }, { x: d, z: -l * 0.6, r: 0 }] },
    finish: { tool: 2, vc: m.vc_fn, f: m.f_fn, ref: null },
    turn:   { tool: 1, vc: m.vc_r, f: m.f_r, x: dmin, z: -(l - 10), ap: m.ap },
    taper:  { tool: 1, vc: m.vc_r, f: m.f_r, x1: dmin, z1: 0, x2: d, z2: -(l / 3) },
    bore:   { tool: 3, vc: m.vc_fn, f: m.f_fn, dpre: 10, dbore: Math.max(12, dmin - 4), depth: Math.min(l - 10, 40), ap: 0.5, sx: 0.2, sz: 0.05 },
    groove: { tool: 4, vc: m.vc_gr, f: m.f_gr, xb: dmin - 4, z: -(l / 2), w: 3 },
    thread: { tool: 5, vc: m.vc_th, dnom: dmin, pitch: 2, zlen: 20, passes: 6, internal: false },
    drill:  { tool: 6, vc: m.vc_dr, f: m.f_dr, fi: 10, depth: 30, peck: 5, cycle: 'G83' },
    cutoff: { tool: 7, vc: m.vc_gr, f: 0.05, z: -l, w: 3 }
  };
  return { type, ...D[type] };
}

// ─── Model detalu (do podglądu) ─────────────────────────────────────────────
/**
 * Symulacja ubytku materiału: promień zewn. ro(z) i wewn. ri(z), z ∈ [−L, 0], krok 0.25 mm.
 * Zwraca {step, zs, ro, ri, marks:[{type,z1,z2,r}]} — marks to gwinty/rowki do zaznaczenia.
 */
export function latheModel(state) {
  const { d, l } = state.stock;
  const step = 0.25, n = Math.round(l / step) + 1;
  const zs = new Float32Array(n), ro = new Float32Array(n), ri = new Float32Array(n);
  for (let i = 0; i < n; i++) { zs[i] = -i * step; ro[i] = d / 2; ri[i] = 0; }
  const marks = [];
  let zFace = 0;
  const idx = (z) => Math.max(0, Math.min(n - 1, Math.round(-z / step)));
  const cutOuter = (z1, z2, rFn) => {
    const a = idx(Math.max(z1, z2)), b = idx(Math.min(z1, z2));
    for (let i = a; i <= b; i++) ro[i] = Math.min(ro[i], Math.max(0, rFn(zs[i])));
  };
  const cutInner = (z1, z2, r) => {
    const a = idx(Math.max(z1, z2)), b = idx(Math.min(z1, z2));
    for (let i = a; i <= b; i++) ri[i] = Math.max(ri[i], r);
  };
  for (const op of state.ops) {
    switch (op.type) {
      case 'face': zFace -= op.cut || 0; break;
      case 'rough': case 'finish': {
        const src = op.type === 'finish' ? state.ops.find((o) => o.id === op.ref) || state.ops.find((o) => o.type === 'rough') : op;
        if (!src || !src.profile) break;
        const pr = expandProfile(src.profile);
        cutOuter(0, -l, (z) => profileRadius(pr, z, d / 2));
        break;
      }
      case 'turn': cutOuter(0, op.z, () => op.x / 2); break;
      case 'taper': {
        const dz = op.z2 - op.z1 || -0.001;
        cutOuter(op.z1, op.z2, (z) => (op.x1 + (op.x2 - op.x1) * ((z - op.z1) / dz)) / 2);
        // za stożkiem materiał zostaje na x2? Nie — zakładamy, że stożek jest na czole (od z1 w stronę −Z)
        break;
      }
      case 'groove': cutOuter(op.z, op.z - op.w, () => op.xb / 2); marks.push({ type: 'groove', z1: op.z, z2: op.z - op.w, r: op.xb / 2 }); break;
      case 'thread': marks.push({ type: 'thread', z1: 0, z2: -op.zlen, r: op.dnom / 2, internal: !!op.internal, pitch: op.pitch }); break;
      case 'drill': cutInner(0, -op.depth, op.fi / 2); break;
      case 'bore': cutInner(0, -op.depth, op.dbore / 2); break;
      case 'cutoff': cutOuter(op.z, -l, () => 0); marks.push({ type: 'cutoff', z1: op.z, z2: op.z - (op.w || 3) }); break;
    }
  }
  return { step, zs, ro, ri, marks, zFace, L: l, D: d };
}

/** Rozwija profil punktowy (x=średnica, z, c=faza, r=promień) na listę segmentów line/arc. */
export function expandProfile(points) {
  const segs = [];
  const P = points.map((p) => ({ x: +p.x, z: +p.z, c: +p.c || 0, r: +p.r || 0 }));
  if (!P.length) return segs;
  let cur = { x: P[0].x, z: P[0].z };
  // Punkt startowy: pierwszy punkt może mieć fazę na czole (od osi w górę)
  const first = P[0];
  if (first.c > 0) {
    cur = { x: first.x - 2 * first.c, z: first.z };
    segs.push({ type: 'line', x1: cur.x, z1: cur.z, x2: first.x, z2: first.z - first.c, chamfer: true });
    cur = { x: first.x, z: first.z - first.c };
  } else if (first.r > 0) {
    cur = { x: first.x - 2 * first.r, z: first.z };
    segs.push({ type: 'arc', x1: cur.x, z1: cur.z, x2: first.x, z2: first.z - first.r, r: first.r, dir: 3 });
    cur = { x: first.x, z: first.z - first.r };
  }
  for (let i = 1; i < P.length; i++) {
    const p = P[i], next = P[i + 1];
    const corner = (p.c > 0 || p.r > 0) && next;
    if (!corner) {
      segs.push({ type: 'line', x1: cur.x, z1: cur.z, x2: p.x, z2: p.z });
      cur = { x: p.x, z: p.z };
      continue;
    }
    // kierunki (w promieniu/Z) wchodzący i wychodzący
    const k = p.c > 0 ? p.c : p.r;
    const d1 = norm({ x: (p.x - cur.x) / 2, z: p.z - cur.z });
    const d2 = norm({ x: (next.x - p.x) / 2, z: next.z - p.z });
    const s = { x: p.x - 2 * d1.x * k, z: p.z - d1.z * k };
    const e = { x: p.x + 2 * d2.x * k, z: p.z + d2.z * k };
    segs.push({ type: 'line', x1: cur.x, z1: cur.z, x2: s.x, z2: s.z });
    if (p.c > 0) segs.push({ type: 'line', x1: s.x, z1: s.z, x2: e.x, z2: e.z, chamfer: true });
    else {
      const cross = d1.z * d2.x - d1.x * d2.z; // (z,x) płaszczyzna
      segs.push({ type: 'arc', x1: s.x, z1: s.z, x2: e.x, z2: e.z, r: k, dir: cross > 0 ? 3 : 2 });
    }
    cur = e;
  }
  return segs;
}
function norm(v) { const m = Math.hypot(v.x, v.z) || 1; return { x: v.x / m, z: v.z / m }; }

/** Promień profilu w z (dla podglądu); poza profilem → surówka. */
export function profileRadius(segs, z, rStock) {
  let r = rStock;
  for (const s of segs) {
    const za = Math.max(s.z1, s.z2), zb = Math.min(s.z1, s.z2);
    if (z <= za + 1e-6 && z >= zb - 1e-6) {
      let rr;
      if (s.type === 'line') {
        const t = za === zb ? 1 : (za - z) / (za - zb);
        const xa = s.z1 >= s.z2 ? s.x1 : s.x2, xb = s.z1 >= s.z2 ? s.x2 : s.x1;
        rr = (xa + (xb - xa) * t) / 2;
        if (za === zb) rr = Math.min(s.x1, s.x2) / 2;
      } else {
        // łuk 90° — przybliżenie geometrii ćwiartki
        const xa = Math.min(s.x1, s.x2) / 2, xb = Math.max(s.x1, s.x2) / 2;
        const t = (za - z) / Math.max(za - zb, 1e-6);
        // wypukły (dir 3 na czole) — rosnący promień zgodnie z ćwiartką okręgu
        const convexFront = s.dir === 3;
        const q = convexFront ? Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) : 1 - Math.sqrt(Math.max(0, 1 - t * t));
        rr = xa + (xb - xa) * q;
      }
      r = Math.min(r, rr);
    }
  }
  return r;
}

// ─── Generator ──────────────────────────────────────────────────────────────
/** Lista użytych narzędzi jako komentarze do nagłówka programu. */
function latheToolList(state) {
  const used = [...new Set(state.ops.map((o) => o.tool))].sort((a, b) => a - b);
  if (!used.length) return [];
  const out = [`(---- ${ascii(tg('LISTA NARZĘDZI'))} ----)`];
  for (const no of used) {
    const t = state.tools[no - 1] || {};
    const ops = state.ops.filter((o) => o.tool === no).map((o) => tg(LATHE_OPS[o.type].label)).join(', ');
    const tn = 'T' + String(no).padStart(2, '0') + String(no).padStart(2, '0');
    out.push(`(${tn} ${ascii(tg(t.type || '?'))} | Vc${Math.round(t.vc || 0)} f${t.f || 0} | ${ascii(ops)})`);
  }
  out.push('(-----------------------)');
  return out;
}

export function generateLathe(state, postIn) {
  const L = [], W = [];
  const p = (...a) => L.push(a.join(''));
  const C = (s, v) => `(${ascii(tg(s, v))})`;
  const post = withDefaults(postIn || getPost(state.post, 'lathe', state.customPosts));
  const K = post.codes, CY = post.cycles;
  const mat = getMaterial(state.material, state.customMaterials);
  const { d: D, l: LEN } = state.stock;
  const maxR = state.maxRpm || 4000;
  const cool = state.coolant;
  const tools = state.tools;
  const tName = (n) => (tools[n - 1] || {}).type || '';
  const tStr = (n) => 'T' + String(n).padStart(2, '0') + String(n).padStart(2, '0');
  const pn = String(state.prog || '1001').padStart(4, '0');
  let time = 0, tcs = 0, lastTool = -1, seq = 100;
  const nAt = (vc, dia) => calcRpm(vc, Math.max(dia, 1), maxR);

  const WCS = wcsCode(state.wcs || 'G54', post);
  if (/^G154/.test(String(state.wcs || '')) && !post.wcsExt) W.push(tr('Układ {w} wymaga sterowania NGC — użyto G54', { w: state.wcs }));
  tpl(post.header, {
    START: post.startChar, PROG: pn, HEAD: ascii(post.name + ' -- ' + tg(mat.name)),
    TITLE: state.title ? ascii(state.title) : '',
    STOCK: ascii(tg('SURÓWKA: FI{d} x L{l} mm', { d: D, l: LEN })),
    GEN: ascii(`CNC VPS ${new Date().toISOString().slice(0, 10)} / ${K.feedRev} / MM / ${tg('ŚREDNICOWO')}`),
    MAXRPM: maxR, WCS, TOOLLIST: post.toolList ? latheToolList(state) .join('\n') : ''
  }).forEach((l) => l.split('\n').forEach((x) => p(x)));
  if (state.tailstock) p('M23 ' + C('konik wysun'));

  state.ops.forEach((op, i) => {
    const t = tools[op.tool - 1] || {};
    const vc = op.vc || t.vc || 100;
    const f = op.f ?? t.f ?? 0.1;
    p('');
    p(C('==== OP {n}: {name} ====', { n: i + 1, name: tg(LATHE_OPS[op.type].full) }));
    if (op.tool !== lastTool) {
      if (lastTool !== -1) { p(K.spinOff); if (cool) p(K.coolOff); p('G28 U0. W0.'); p(K.optStop + ' ' + C('stop opcjonalny')); p(''); tcs++; }
      tpl(post.toolChange, {
        TSTR: tStr(op.tool), TT: String(op.tool).padStart(2, '0'), MAXRPM: maxR,
        TOOLDESC: ascii(tg(tName(op.tool) || '?')), S: nAt(vc, D)
      }).forEach((l) => p(l));
      lastTool = op.tool;
    }
    if (cool) p(cool + ' ' + C('chłodzenie'));

    switch (op.type) {
      case 'face': {
        p(`${K.css} S${Math.round(vc)} ${K.spinCW} ${C('stała prędkość skrawania')}`);
        const passes = Math.max(1, Math.ceil((op.cut || 0.5) / (op.ap || 0.5)));
        for (let k = 1; k <= passes; k++) {
          const z = -Math.min(op.cut, k * op.ap);
          p(`${K.rapid} X${f3(D + 3)} Z${f3(z + 1.5)}`);
          p(`${K.lin} Z${f3(z)} F${f3(f * 2)}`);
          p(`X-1.5 F${f3(f)}`);
          p(`${K.rapid} Z${f3(z + 1.5)}`);
          time += (D / 2 + 3) / (f * nAt(vc, D / 2)) + 0.05;
        }
        p(`${K.rapid} X${f3(D + 5)} Z5.`);
        break;
      }
      case 'rough': {
        const ns = seq, ne = seq + 10; seq += 100;
        op._ns = ns; op._ne = ne;
        const segs = expandProfile(op.profile);
        p(C('G71 profil {n} pkt  ap{ap}  f{f}  Vc{vc}', { n: op.profile.length, ap: op.ap, f: f3(f), vc: Math.round(vc) }));
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        p(`${K.rapid} X${f3(D + 2)} Z2.`);
        p(`${CY.rough} U${f3(op.ap)} R0.5`);
        p(`${CY.rough} P${ns} Q${ne} U${f3(op.sx)} W${f3(op.sz)} F${f3(f)}`);
        emitProfile(p, segs, ns, ne, f, D, false, K);
        p(`${K.rapid} X${f3(D + 5)} Z5.`);
        const xmin = Math.min(...op.profile.map((q) => q.x));
        const passes = Math.ceil((D - xmin) / 2 / op.ap);
        const zlen = Math.abs(Math.min(...op.profile.map((q) => q.z)));
        time += (passes * (zlen + 4)) / (f * nAt(vc, (D + xmin) / 2)) + passes * 0.03;
        break;
      }
      case 'finish': {
        const src = state.ops.find((o) => o.id === op.ref) || state.ops.slice(0, i).reverse().find((o) => o.type === 'rough');
        if (!src || !src._ns) { W.push(tr('OP {n}: G70 bez wcześniejszego G71', { n: i + 1 })); p(C('!!! brak G71 dla G70')); break; }
        p(C('G70 profil N{a}-N{b}', { a: src._ns, b: src._ne }));
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        p(`${K.rapid} X${f3(D + 2)} Z2.`);
        p(`${CY.finish} P${src._ns} Q${src._ne} F${f3(f)}`);
        p(`${K.rapid} X${f3(D + 5)} Z5.`);
        const zlen = Math.abs(Math.min(...src.profile.map((q) => q.z)));
        time += (zlen + D / 2) / (f * nAt(vc, D / 2)) + 0.1;
        break;
      }
      case 'turn': {
        const passes = Math.max(1, Math.ceil((D - op.x) / 2 / (op.ap || 2)));
        p(C('toczenie X{x} Z{z}  {n} przejść', { x: op.x, z: op.z, n: passes }));
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        for (let k = 1; k <= passes; k++) {
          const x = Math.max(op.x, D - 2 * k * op.ap);
          p(`${K.rapid} X${f3(x)} Z2.`);
          p(`${K.lin} Z${f3(op.z)} F${f3(f)}`);
          p(`${K.rapid} U1. Z2.`);
          time += Math.abs(op.z - 2) / (f * nAt(vc, x));
        }
        p(`${K.rapid} X${f3(D + 5)}`);
        break;
      }
      case 'taper': {
        p(C('stożek X{x1} Z{z1} -> X{x2} Z{z2}', { x1: op.x1, z1: op.z1, x2: op.x2, z2: op.z2 }));
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        p(`${K.rapid} X${f3(op.x1 + 1)} Z${f3(op.z1 + 2)}`);
        p(`${K.lin} X${f3(op.x1)} Z${f3(op.z1)} F${f3(f * 2)}`);
        p(`X${f3(op.x2)} Z${f3(op.z2)} F${f3(f)}`);
        p(`${K.rapid} X${f3(D + 5)}`);
        time += Math.hypot((op.x2 - op.x1) / 2, op.z2 - op.z1) / (f * nAt(vc, (op.x1 + op.x2) / 2));
        W.push(tr('OP {n}: stożek — jedno przejście; dla dużego naddatku użyj G71 z profilem', { n: i + 1 }));
        break;
      }
      case 'bore': {
        const ns = seq, ne = seq + 10; seq += 100;
        p(C('wytaczanie FI{d} gł.{h} z otworu FI{p}', { d: op.dbore, h: op.depth, p: op.dpre }));
        if (op.dpre >= op.dbore) W.push(tr('OP {n}: otwór wstępny ≥ średnicy wytaczania', { n: i + 1 }));
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        p(`${K.rapid} X${f3(op.dpre - 1)} Z2.`);
        p(`${CY.rough} U${f3(op.ap)} R0.3`);
        p(`${CY.rough} P${ns} Q${ne} U-${f3(op.sx)} W${f3(op.sz)} F${f3(f)}`);
        p(`N${ns} G00 X${f3(op.dbore)}`);
        p(`${K.lin} Z${f3(-op.depth)} F${f3(f)}`);
        p(`X${f3(op.dpre - 1)}`);
        p(`N${ne} G00 Z2.`);
        p(`${K.rapid} X${f3(op.dpre - 1)} Z5.`);
        const passes = Math.ceil((op.dbore - op.dpre) / 2 / op.ap);
        time += (passes * (op.depth + 3)) / (f * nAt(vc, op.dbore)) + passes * 0.03;
        break;
      }
      case 'groove': {
        const n = nAt(vc, D);
        const tw = (tools[op.tool - 1] || {}).w || 3;
        p(C('rowek X{x} Z{z} szer.{w}  płytka {tw}mm', { x: op.xb, z: op.z, w: op.w, tw }));
        p(`${K.rpmConst} S${n} ${K.spinCW} ${C('stałe RPM')}`);
        p(`${K.rapid} X${f3(D + 2)} Z${f3(op.z)}`);
        p(`${CY.groove} R0.5`);
        if (op.w > tw) p(`${CY.groove} X${f3(op.xb)} Z${f3(op.z - op.w + tw)} P${Math.round(Math.min(op.w, 2) * 1000)} Q${Math.round(tw * 0.8 * 1000)} F${f3(f)}`);
        else p(`${CY.groove} X${f3(op.xb)} P${Math.round(Math.min(op.w, 2) * 1000)} F${f3(f)}`);
        p(`${K.rapid} X${f3(D + 5)}`);
        time += ((D - op.xb) / 2) * Math.ceil(op.w / tw) / (f * n) * 1.5;
        break;
      }
      case 'thread': {
        const th = metricThread(op.dnom, op.pitch, op.internal);
        const n = Math.min(nAt(vc, op.dnom), 1200);
        const passes = op.passes || threadPasses(th.hT);
        const pp = String(Math.min(99, passes)).padStart(2, '0');
        const zEnd = -(op.zlen + op.pitch * 1.5);
        p(C(op.internal ? 'gwint wewn. M{d}x{p} d_min={m} {n} przejść' : 'gwint zewn. M{d}x{p} d_min={m} {n} przejść', { d: op.dnom, p: op.pitch, m: f3(th.dMinor), n: passes }));
        p(`(! ${ascii(tg('G97 STAŁE RPM -- wyłącz G96'))} !)`);
        p(`${K.rpmConst} S${n} ${K.spinCW}`);
        if (op.internal) {
          p(`${K.rapid} X${f3(th.dMinor - 2)} Z${f3(op.pitch * 2)}`);
          p(`${CY.thread} P${pp}0060 Q50 R0.03`);
          p(`${CY.thread} X${f3(op.dnom)} Z${f3(zEnd)} P${th.pUm} Q${th.firstCutUm} F${f4(op.pitch)}`);
        } else {
          p(`${K.rapid} X${f3(op.dnom + 3)} Z${f3(op.pitch * 2)}`);
          p(`${CY.thread} P${pp}0060 Q50 R0.05`);
          p(`${CY.thread} X${f3(th.dMinor)} Z${f3(zEnd)} P${th.pUm} Q${th.firstCutUm} F${f4(op.pitch)}`);
        }
        p(`${K.rapid} X${f3(D + 5)} Z5.`);
        time += ((passes + 2) * (Math.abs(zEnd) + op.pitch * 2)) / (op.pitch * n) + (passes + 2) * 0.03;
        if (n * op.pitch > 3000) W.push(tr('OP {n}: Vf gwintu {v} mm/min — zmniejsz RPM', { n: i + 1, v: Math.round(n * op.pitch) }));
        break;
      }
      case 'drill': {
        const n = nAt(vc, op.fi);
        p(C('wiercenie FI{d} gł.{h} peck {p} {c}', { d: op.fi, h: op.depth, p: op.peck, c: op.cycle }));
        p(`${K.rpmConst} S${n} ${K.spinCW}`);
        p('G00 X0. Z5.');
        if (op.cycle === 'G74') { p(`${CY.chip} R0.5`); p(`${CY.chip} Z${f3(-op.depth)} Q${Math.round(op.peck * 1000)} F${f3(f)}`); }
        else p(`${CY.peck} Z${f3(-op.depth)} R2. Q${Math.round(op.peck * 1000)} F${f3(f)}`);
        p(CY.off);
        p('G00 Z10.');
        time += (op.depth / (f * n)) * (1 + Math.ceil(op.depth / Math.max(op.peck, 1)) * 0.15);
        break;
      }
      case 'cutoff': {
        const n = Math.min(nAt(vc, D), 1500);
        const tw = (tools[op.tool - 1] || {}).w || op.w || 3;
        p(C('odcinanie Z{z} płytka {tw}mm', { z: op.z, tw }));
        p(`${K.rpmLimit} S${Math.min(1500, maxR)} ${C('limit rpm przy odcinaniu')}`);
        p(`${K.css} S${Math.round(vc)} ${K.spinCW}`);
        p(`${K.rapid} X${f3(D + 2)} Z${f3(op.z - tw)}`);
        p(`${K.lin} X${f3(D * 0.4)} F${f3(f)}`);
        p(`X${f3(D * 0.15)} F${f3(f * 0.6)}`);
        p(`X-0.5 F${f3(f * 0.3)}`);
        p(`${K.rapid} X${f3(D + 10)}`);
        p(`${K.rpmLimit} S${maxR}`);
        time += (D / 2 + 3) / (f * n) * 2;
        break;
      }
    }
  });
  p('');
  if (state.tailstock) p('M24 ' + C('konik cofnij'));
  tpl(post.footer, { COOLOFF: cool ? K.coolOff : '', END: post.endChar }).forEach((l) => p(l));
  return { lines: finalize(L, post), warnings: W, post: { id: post.id, name: post.name }, time: { cut: time, toolChanges: tcs, total: time + tcs * 0.25 + 0.5 } };
}

function emitProfile(p, segs, ns, ne, f, D, internal, K) {
  if (!segs.length) return;
  const s0 = segs[0];
  p(`N${ns} ${K.rapid} X${f3(s0.x1)} ${internal ? '' : K.compR}`.trim());
  p(`${K.lin} Z${f3(s0.z1)} F${f3(f * 0.8)}`);
  for (const s of segs) {
    if (s.type === 'line') p(`${K.lin} X${f3(s.x2)} Z${f3(s.z2)}`);
    else p(`${s.dir === 2 ? K.cw : K.ccw} X${f3(s.x2)} Z${f3(s.z2)} R${f3(s.r)}`);
  }
  const last = segs[segs.length - 1];
  if (last.x2 < D + 2) p(`${K.lin} X${f3(D + 2)}`);
  p(`N${ne} ${K.rapid} X${f3(D + 5)} ${K.compOff}`);
}
