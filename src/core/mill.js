// Generator G-kodu — frezarka Haas VF (Classic Control, G17, G94 mm/min, G54).
import { getMaterial } from './materials.js';
import { rpm as calcRpm, vfMill, boltCircle, ascii } from './calc.js';
import { getPost, withDefaults, tpl, finalize, wcsCode } from './posts.js';
import { PROBE_OPS, isProbeOp, probeBlock, probeHeader, defaultProbeOp } from './probe.js';

export const MILL_TOOL_TYPES = [
  'Frez walcowy', 'Frez kulowy', 'Frez czołowy', 'Frez fazowy 90°', 'Frez tarczowy',
  'Wiertło', 'Nawiertak', 'Gwintownik', 'Wytaczak', 'Rozwiertak', 'Frez do gwintów', 'Sonda pomiarowa'
];

export const MILL_OPS = {
  face:    { label: 'Planowanie', full: 'Planowanie (zygzak)',        color: '#4ec994' },
  prof:    { label: 'Profil',     full: 'Profil prostokątny G41/G42', color: '#58b0f5' },
  circ:    { label: 'Okrąg',      full: 'Okrąg zewn./wewn. G41/G42',  color: '#b078f5' },
  pock:    { label: 'Kieszeń',    full: 'Kieszeń prostokątna',        color: '#f0a840' },
  cpock:   { label: 'Kieszeń ⌀',  full: 'Kieszeń okrągła (spirala)',  color: '#e08060' },
  slot:    { label: 'Rowek',      full: 'Rowek',                      color: '#f06060' },
  drill:   { label: 'Wiercenie',  full: 'Wiercenie G81/G83',          color: '#c8b840' },
  tap:     { label: 'Gwint',      full: 'Gwintowanie G84',            color: '#70c070' },
  bore:    { label: 'Wytaczanie', full: 'Wytaczanie G85/G76',         color: '#40c8d8' },
  chamfer: { label: 'Faza',       full: 'Fazowanie konturu',          color: '#d8a030' }
};

// Operacje pomiarowe dołączane do listy operacji frezarki.
for (const [k, v] of Object.entries(PROBE_OPS)) {
  MILL_OPS[k] = { label: v.label, full: v.full, color: v.color, probe: true };
}

export const BASES = [
  { i: 0, n: 'LG', t: 'Lewy-górny' }, { i: 1, n: 'SG', t: 'Środek-górny' }, { i: 2, n: 'PG', t: 'Prawy-górny' },
  { i: 3, n: 'LS', t: 'Lewy-środek' }, { i: 4, n: 'C', t: 'Centrum' }, { i: 5, n: 'PS', t: 'Prawy-środek' },
  { i: 6, n: 'LD', t: 'Lewy-dolny' }, { i: 7, n: 'SD', t: 'Środek-dolny' }, { i: 8, n: 'PD', t: 'Prawy-dolny' }
];

const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);

export function defaultMillTools(matKey, custom) {
  const m = getMaterial(matKey, custom).mill;
  const T = (no, type, d, z, vc, fz, ap) => ({ no, type, d, z, vc, fz, ap });
  const list = [
    T(1, 'Frez czołowy', 50, 5, m.vc, m.fz, 1.5),
    T(2, 'Frez walcowy', 12, 3, m.vc, m.fz, m.ap),
    T(3, 'Frez walcowy', 10, 3, m.vc, m.fz, m.ap),
    T(4, 'Frez walcowy', 6, 2, m.vc, m.fz * 0.7, 2),
    T(5, 'Frez kulowy', 8, 2, m.vc, m.fz * 0.8, 1),
    T(6, 'Nawiertak', 5, 2, m.vcD, m.fzD, 0),
    T(7, 'Wiertło', 6.8, 2, m.vcD, m.fzD, 0),
    T(8, 'Wiertło', 8.5, 2, m.vcD, m.fzD, 0),
    T(9, 'Wiertło', 10.2, 2, m.vcD, m.fzD, 0),
    T(10, 'Gwintownik', 8, 3, m.vcT, 1.25, 0),
    T(11, 'Gwintownik', 10, 3, m.vcT, 1.5, 0),
    T(12, 'Gwintownik', 12, 3, m.vcT, 1.75, 0),
    T(13, 'Frez fazowy 90°', 10, 2, m.vc, m.fz, 1),
    T(14, 'Wytaczak', 20, 1, m.vc * 0.6, 0.08, 0.3)
  ];
  while (list.length < 19) list.push(T(list.length + 1, '', 0, 0, 0, 0, 0));
  list.push(T(20, 'Sonda pomiarowa', 6, 1, 0, 0, 0));
  for (let i = list.length + 1; i <= 30; i++) list.push(T(i, '', 0, 0, 0, 0, 0));
  return list;
}

export function defaultMillOp(type, state) {
  if (isProbeOp(type)) return defaultProbeOp(type, state);
  const { x: X, y: Y } = state.stock;
  const find = (nm) => (state.tools.find((t) => t.type === nm) || { no: 2 }).no;
  const D = {
    face:    { tool: 1, ap: 1, ae: 0.7, zt: 0, x1: 0, y1: 0, x2: X, y2: Y },
    prof:    { tool: find('Frez walcowy'), ap: 2, zt: -5, comp: 41, side: 'out', x1: 5, y1: 5, x2: X - 5, y2: Y - 5, r: 0 },
    circ:    { tool: find('Frez walcowy'), ap: 2, zt: -5, comp: 41, side: 'out', cx: X / 2, cy: Y / 2, r: 20 },
    pock:    { tool: find('Frez walcowy'), ap: 2, zt: -8, x1: 15, y1: 15, x2: X - 15, y2: Y - 15, step: 0.6, entry: 'ramp' },
    cpock:   { tool: find('Frez walcowy'), ap: 2, zt: -8, cx: X / 2, cy: Y / 2, d: 30, step: 0.5 },
    slot:    { tool: find('Frez walcowy'), ap: 2, zt: -4, x1: 10, y1: Y / 2, x2: X - 10, y2: Y / 2 },
    drill:   { tool: find('Wiertło'), zt: -15, peck: 4, pattern: 'grid', nx: 2, ny: 2, x1: 20, y1: 20, dx: X - 40, dy: Y - 40, cx: X / 2, cy: Y / 2, pcd: 40, n: 6, start: 0 },
    tap:     { tool: find('Gwintownik'), zt: -12, pitch: 1.5, pattern: 'grid', nx: 2, ny: 2, x1: 20, y1: 20, dx: X - 40, dy: Y - 40, cx: X / 2, cy: Y / 2, pcd: 40, n: 6, start: 0 },
    bore:    { tool: find('Wytaczak'), zt: -10, cx: X / 2, cy: Y / 2, dia: 20, cycle: 'G85' },
    chamfer: { tool: find('Frez fazowy 90°'), c: 1, zt: 0, x1: 5, y1: 5, x2: X - 5, y2: Y - 5 }
  };
  return { type, ...D[type] };
}

/** Punkty otworów dla operacji drill/tap. */
export function holePoints(op) {
  if (op.pattern === 'pcd') return boltCircle(op.cx, op.cy, op.pcd, Math.max(1, Math.round(op.n)), op.start || 0);
  const pts = [], nx = Math.max(1, Math.round(op.nx)), ny = Math.max(1, Math.round(op.ny));
  const sx = nx > 1 ? op.dx / (nx - 1) : 0, sy = ny > 1 ? op.dy / (ny - 1) : 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push({ x: op.x1 + (j % 2 ? nx - 1 - i : i) * sx, y: op.y1 + j * sy });
  return pts;
}

/** Lista użytych narzędzi jako komentarze do nagłówka programu. */
function millToolList(state, maxR) {
  const used = [...new Set(state.ops.map((o) => o.tool))].sort((a, b) => a - b);
  if (!used.length) return [];
  const out = ['(---- LISTA NARZEDZI ----)'];
  for (const no of used) {
    const t = state.tools[no - 1] || {};
    const n = calcRpm(t.vc || 200, t.d || 6, maxR);
    const ops = state.ops.filter((o) => o.tool === no).map((o) => MILL_OPS[o.type].label).join(', ');
    out.push(`(T${String(no).padStart(2, '0')} D${t.d || '?'} ${ascii(t.type || '?')} | S${n} F${Math.round(vfMill(t.fz || 0.05, t.z || 2, n))} | ${ascii(ops)})`);
  }
  out.push('(-----------------------)');
  return out;
}

export function generateMill(state, postIn) {
  const L = [], W = [];
  const p = (...a) => L.push(a.join(''));
  const C = (t) => `(${ascii(t)})`;
  const post = withDefaults(postIn || getPost(state.post, 'mill', state.customPosts));
  const K = post.codes, CY = post.cycles;
  const mat = getMaterial(state.material, state.customMaterials);
  const { x: X, y: Y, z: Z } = state.stock;
  const SZ = state.safeZ || 50, RZ = 2;
  const maxR = state.maxRpm || 8100, cool = state.coolant;
  const pn = String(state.prog || '2001').padStart(4, '0');
  const base = BASES[state.base ?? 6];
  const WCS = wcsCode(state.wcs || 'G54', post);
  if (/^G154/.test(String(state.wcs || '')) && !post.wcsExt) W.push(`Układ ${state.wcs} wymaga sterowania NGC — użyto G54`);
  let time = 0, tcs = 0, last = -1;
  let cur = { x: 0, y: 0, z: SZ };
  const move = (x, y, z, vf) => { // liczy czas i pamięta pozycję
    const dist = Math.hypot((x ?? cur.x) - cur.x, (y ?? cur.y) - cur.y, (z ?? cur.z) - cur.z);
    time += vf ? dist / vf : dist / 15000;
    cur = { x: x ?? cur.x, y: y ?? cur.y, z: z ?? cur.z };
  };
  const G0 = (x, y, z) => { p(K.rapid + (x != null ? ` X${f3(x)}` : '') + (y != null ? ` Y${f3(y)}` : '') + (z != null ? ` Z${f3(z)}` : '')); move(x, y, z); };
  const G1 = (x, y, z, vf, extra = '') => { p(K.lin + (x != null ? ` X${f3(x)}` : '') + (y != null ? ` Y${f3(y)}` : '') + (z != null ? ` Z${f3(z)}` : '') + (vf ? ` F${Math.round(vf)}` : '') + extra); move(x, y, z, vf || 1000); };
  const ARC = (g, x, y, i, j, vf, z) => { p(`${g === 2 ? K.cw : K.ccw} X${f3(x)} Y${f3(y)} I${f3(i)} J${f3(j)}` + (z != null ? ` Z${f3(z)}` : '') + (vf ? ` F${Math.round(vf)}` : '')); const r = Math.hypot(i, j); time += (2 * Math.PI * r) / (vf || 1000); cur = { x, y, z: z ?? cur.z }; };

  tpl(post.header, {
    START: post.startChar, PROG: pn, HEAD: ascii(post.name + ' -- ' + mat.name),
    TITLE: state.title ? ascii(state.title) : '',
    STOCK: ascii(`DETAL: X${X} x Y${Y} x Z${Z} mm  BAZA ${WCS}: ${base.t}`),
    GEN: ascii(`CNC VPS ${new Date().toISOString().slice(0, 10)} / ${WCS} / ${K.plane} / MM`),
    WCS, TOOLLIST: post.toolList ? millToolList(state, maxR).join('\n') : ''
  }).forEach((l) => l.split('\n').forEach((x) => p(x)));

  const anyProbe = state.ops.some((o) => isProbeOp(o.type));
  if (anyProbe) { p(''); probeHeader(state, post).forEach((l) => p(l)); }

  state.ops.forEach((op, i) => {
    const t = state.tools[op.tool - 1] || {};
    if (isProbeOp(op.type)) {
      const tno = String(op.tool).padStart(2, '0');
      p('');
      p(C(`==== OP ${i + 1}: ${MILL_OPS[op.type].full} ====`));
      if (op.tool !== last) {
        if (last !== -1) { p(K.spinOff); if (cool) p(K.coolOff); p('G28 G91 Z0.'); p(K.abs); p(K.optStop + ' ' + C('stop opcjonalny')); p(''); tcs++; }
        p(C(`T${tno} SONDA POMIAROWA`));
        p(`T${tno} ${K.toolChange || 'M06'}`);
        p(`${WCS} ${K.rapid} X0. Y0.`);
        p(`${K.lenComp} H${tno} Z${f2(SZ)} ${C('komp. dlugosci sondy')}`);
        last = op.tool; cur = { x: 0, y: 0, z: SZ };
      }
      const pb = probeBlock(op, state, post);
      pb.lines.forEach((l) => p(l));
      pb.warnings.forEach((w) => W.push(`OP ${i + 1}: ${w}`));
      time += 0.4;
      return;
    }
    const td = t.d || 6, tz = Math.max(1, t.z || 2), tvc = t.vc || 200, tfz = t.fz || 0.05;
    const n = calcRpm(tvc, td, maxR);
    const vf = Math.round(vfMill(tfz, tz, n));
    const vfz = Math.round(vf * 0.4);
    const tno = String(op.tool).padStart(2, '0');
    const zt = op.zt ?? -5, ap = op.ap || 1;
    p('');
    p(C(`==== OP ${i + 1}: ${MILL_OPS[op.type].full} ====`));
    if (op.tool !== last) {
      if (last !== -1) { p(K.spinOff); if (cool) p(K.coolOff); p('G28 G91 Z0.'); p(K.abs); p(K.optStop + ' ' + C('stop opcjonalny')); p(''); tcs++; }
      tpl(post.toolChange, {
        TT: tno, S: n, SAFEZ: f2(SZ), MAXRPM: maxR,
        TOOLDIA: td, TOOLLEN: t.len || '',
        TOOLDESC: ascii(`${t.type || '?'} D${td} z${tz} Vc${Math.round(tvc)} fz${tfz}`), WCS
      }).forEach((l) => p(l));
      last = op.tool; cur = { x: 0, y: 0, z: SZ };
    } else p(`S${n} ${K.spinCW}`);
    if (cool) p(cool);
    p(C(`Vf = ${tfz} x ${tz} x ${n} = ${vf} mm/min`));
    if (!t.type) W.push(`OP ${i + 1}: narzędzie T${tno} jest puste w magazynie`);
    if (td > 0 && (op.type === 'pock') && Math.min(Math.abs(op.x2 - op.x1), Math.abs(op.y2 - op.y1)) < td) W.push(`OP ${i + 1}: kieszeń węższa niż frez D${td}`);
    if (zt < -Z) W.push(`OP ${i + 1}: Z${zt} głębiej niż detal (${Z} mm) — przewiercenie stołu?`);

    const zPasses = (target) => { const out = []; const nz = Math.max(1, Math.ceil(Math.abs(target) / ap)); for (let k = 1; k <= nz; k++) out.push(Math.max(target, -(k * ap))); return out; };

    switch (op.type) {
      case 'face': {
        const step = td * (op.ae || 0.7);
        const ny = Math.max(1, Math.ceil(Math.abs(op.y2 - op.y1) / step));
        const sy = (op.y2 - op.y1) / ny;
        const xa = op.x1 - td / 2 - 2, xb = op.x2 + td / 2 + 2;
        p(C(`planowanie ae=${f2(step)} ap=${ap} przejsc=${ny + 1}`));
        G0(xa, op.y1, null); G0(null, null, RZ);
        G1(null, null, zt, vfz);
        for (let k = 0; k <= ny; k++) {
          const y = op.y1 + k * sy;
          if (k > 0) G1(null, y, null, vf);
          G1(k % 2 === 0 ? xb : xa, null, null, vf);
        }
        G0(null, null, SZ);
        break;
      }
      case 'prof': {
        const a = Math.min(op.x1, op.x2), b = Math.min(op.y1, op.y2), c = Math.max(op.x1, op.x2), d = Math.max(op.y1, op.y2);
        const comp = op.comp || 41, r = op.r || 0;
        p(C(`profil ${a},${b} -> ${c},${d}  G${comp}  R${r}`));
        G0(a - td, b - td, null); G0(null, null, RZ);
        for (const z of zPasses(zt)) {
          p(C(`-- Z${f2(z)} --`));
          G1(null, null, z, vfz);
          p(`${comp === 41 ? K.compL : K.compR} D${tno} ${K.lin} X${f3(a)} Y${f3(b + r)} F${vf}`); move(a, b + r, null, vf);
          if (r > 0) {
            G1(null, d - r, null, vf); ARC(2, a + r, d, r, 0, vf);
            G1(c - r, null, null, vf); ARC(2, c, d - r, 0, -r, vf);
            G1(null, b + r, null, vf); ARC(2, c - r, b, -r, 0, vf);
            G1(a + r, null, null, vf); ARC(2, a, b + r, 0, r, vf);
          } else { G1(null, d, null, vf); G1(c, null, null, vf); G1(null, b, null, vf); G1(a, null, null, vf); }
          p(`${K.compOff} ${K.lin} X${f3(a - td)} Y${f3(b - td)}`); move(a - td, b - td, null, vf);
        }
        G0(null, null, SZ);
        break;
      }
      case 'circ': {
        const comp = op.comp || 41, { cx, cy, r } = op;
        p(C(`okrag Xc${cx} Yc${cy} R${r} G${comp}`));
        G0(cx - r - td, cy, null); G0(null, null, RZ);
        for (const z of zPasses(zt)) {
          p(C(`-- Z${f2(z)} --`));
          G1(null, null, z, vfz);
          p(`${comp === 41 ? K.compL : K.compR} D${tno} ${K.lin} X${f3(cx - r)} Y${f3(cy)} F${vf}`); move(cx - r, cy, null, vf);
          ARC(comp === 41 ? 2 : 3, cx - r, cy, r, 0, vf);
          p(`${K.compOff} ${K.lin} X${f3(cx - r - td)} Y${f3(cy)}`); move(cx - r - td, cy, null, vf);
        }
        G0(null, null, SZ);
        break;
      }
      case 'pock': {
        const a = Math.min(op.x1, op.x2) + td / 2, b = Math.min(op.y1, op.y2) + td / 2;
        const c = Math.max(op.x1, op.x2) - td / 2, d = Math.max(op.y1, op.y2) - td / 2;
        const sw = td * (op.step || 0.6);
        const nx = Math.max(1, Math.ceil((c - a) / sw));
        p(C(`kieszen ${op.x1},${op.y1} -> ${op.x2},${op.y2}  step ${f2(sw)}  wejscie ${op.entry === 'ramp' ? 'rampa' : 'pionowe'}`));
        G0(a, b, null); G0(null, null, RZ);
        let zPrev = 0;
        for (const z of zPasses(zt)) {
          p(C(`-- Z${f2(z)} --`));
          if (op.entry === 'ramp') {
            const depth = zPrev - z;
            const rampLen = Math.max(1, Math.min(c - a, depth / Math.tan((3 * Math.PI) / 180)));
            const ang = (Math.atan(depth / rampLen) * 180) / Math.PI;
            if (ang > 10) W.push(`OP ${i + 1}: rampa ${ang.toFixed(1)}° — kieszeń za krótka, zmniejsz ap`);
            G1(a + rampLen, null, z, vfz, ' ' + C(`rampa ${ang.toFixed(1)} st`)); G1(a, null, null, vf);
          } else G1(null, null, z, vfz);
          for (let k = 0; k <= nx; k++) {
            const x = Math.min(a + k * sw, c);
            if (k > 0) G1(x, null, null, vf);
            G1(null, k % 2 === 0 ? d : b, null, vf);
          }
          p(C('kontur kieszeni'));
          G1(a, b, null, vf); G1(null, d, null, vf); G1(c, null, null, vf); G1(null, b, null, vf); G1(a, null, null, vf);
          zPrev = z;
        }
        G0(null, null, SZ);
        break;
      }
      case 'cpock': {
        const rMax = op.d / 2 - td / 2, sw = td * (op.step || 0.5);
        if (rMax <= 0) { W.push(`OP ${i + 1}: kieszeń ⌀${op.d} mniejsza od frezu D${td}`); break; }
        p(C(`kieszen okragla D${op.d} spirala krok ${f2(sw)}`));
        G0(op.cx, op.cy, null); G0(null, null, RZ);
        for (const z of zPasses(zt)) {
          p(C(`-- Z${f2(z)} helisa --`));
          const rh = Math.min(rMax, td * 0.45);
          G1(op.cx + rh, null, null, vfz);
          ARC(3, op.cx + rh, op.cy, -rh, 0, vfz, z);
          ARC(3, op.cx + rh, op.cy, -rh, 0, vf);
          for (let r = rh + sw; r < rMax; r += sw) { G1(op.cx + r, null, null, vf); ARC(3, op.cx + r, op.cy, -r, 0, vf); }
          G1(op.cx + rMax, null, null, vf); ARC(3, op.cx + rMax, op.cy, -rMax, 0, vf);
          G1(op.cx, op.cy, null, vf);
        }
        G0(null, null, SZ);
        break;
      }
      case 'slot': {
        p(C(`rowek ${op.x1},${op.y1} -> ${op.x2},${op.y2} szer.${td}`));
        G0(op.x1, op.y1, null); G0(null, null, RZ);
        let flip = false;
        for (const z of zPasses(zt)) {
          G1(null, null, z, vfz);
          G1(flip ? op.x1 : op.x2, flip ? op.y1 : op.y2, null, vf);
          flip = !flip;
        }
        G0(null, null, SZ);
        break;
      }
      case 'drill': {
        const pts = holePoints(op), fd = Math.round((t.fz || 0.1) * tz * n);
        const dCyc = op.peck > 0 ? (op.chip ? CY.chip : CY.peck) : CY.drill;
        p(C(`wiercenie D${td} Z${zt} ${pts.length} otw. ${op.peck > 0 ? dCyc + ' peck ' + op.peck : dCyc}`));
        G0(pts[0].x, pts[0].y, null); G0(null, null, 5);
        p(`${dCyc} Z${f3(zt)}${op.peck > 0 ? ` Q${f3(op.peck)}` : ''} R2. F${fd} ${CY.ret}`);
        pts.forEach((q, k) => { if (k) p(`X${f3(q.x)} Y${f3(q.y)}`); time += (Math.abs(zt) + 2) / fd * (op.peck > 0 ? 1.6 : 1) + 0.03; });
        p(CY.off); G0(null, null, SZ);
        break;
      }
      case 'tap': {
        const pts = holePoints(op), tn = Math.min(n, 800), tvf = Math.round(tn * op.pitch);
        p(C(`gwintowanie M${td}x${op.pitch} Z${zt} ${pts.length} otw.`));
        p(`(! F = n x skok = ${tn} x ${op.pitch} = ${tvf} !)`);
        p(K.spinOff); p(`S${tn} ${K.spinCW}`);
        if (CY.rigid) p(`${CY.rigid} S${tn} ${C('sztywne gwintowanie')}`);
        G0(pts[0].x, pts[0].y, null); G0(null, null, 5);
        p(`${CY.tap} Z${f3(zt)} R5. F${tvf} ${CY.ret}`);
        pts.forEach((q, k) => { if (k) p(`X${f3(q.x)} Y${f3(q.y)}`); time += (2 * (Math.abs(zt) + 5)) / tvf + 0.05; });
        p(CY.off); G0(null, null, SZ);
        break;
      }
      case 'bore': {
        p(C(`wytaczanie D${op.dia} Z${zt} ${op.cycle}`));
        G0(op.cx, op.cy, null); G0(null, null, 5);
        if (op.cycle === 'G76') p(`${CY.boreOrient} Z${f3(zt)} R2. I0.5 F${Math.round(vf * 0.5)} ${C('wytaczanie z odsunieciem')}`);
        else p(`${CY.bore} Z${f3(zt)} R2. F${Math.round(vf * 0.5)}`);
        p(CY.off); G0(null, null, SZ);
        time += (2 * Math.abs(zt)) / (vf * 0.5) + 0.05;
        break;
      }
      case 'chamfer': {
        const a = Math.min(op.x1, op.x2), b = Math.min(op.y1, op.y2), c = Math.max(op.x1, op.x2), d = Math.max(op.y1, op.y2);
        const zc = (op.zt || 0) - op.c - 0.5; // wierzchołek frezu 0.5 mm poniżej fazy
        const off = op.c + 0.5 + 0.5; // odsunięcie środka frezu = połowa szer. w miejscu styku (90°)
        p(C(`faza ${op.c}x45 kontur ${a},${b}-${c},${d}  (frez 90 st, wierzcholek Z${f2(zc)})`));
        G0(a - off - 5, b - off, null); G0(null, null, RZ);
        G1(null, null, zc, vfz);
        G1(a - off, b - off, null, vf); G1(null, d + off, null, vf); G1(c + off, null, null, vf); G1(null, b - off, null, vf); G1(a - off, null, null, vf);
        G0(null, null, SZ);
        W.push(`OP ${i + 1}: faza liczona dla frezu 90° z wierzchołkiem ostrym — sprawdź D w miejscu styku`);
        break;
      }
    }
  });
  p('');
  tpl(post.footer, { COOLOFF: cool ? K.coolOff : '', END: post.endChar }).forEach((l) => p(l));
  return { lines: finalize(L, post), warnings: W, post: { id: post.id, name: post.name }, time: { cut: time, toolChanges: tcs, total: time + tcs * 0.2 + 0.3 } };
}
