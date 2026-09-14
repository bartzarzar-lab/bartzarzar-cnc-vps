// Powłoka aplikacji: stan, nawigacja, ekrany.
import { MATERIALS, MATERIAL_KEYS, getMaterial, rateVc } from '../core/materials.js';
import { generateLathe, defaultLatheTools, defaultLatheOp, LATHE_OPS, LATHE_TOOL_TYPES } from '../core/lathe.js';
import { generateMill, defaultMillTools, defaultMillOp, MILL_OPS, MILL_TOOL_TYPES, BASES } from '../core/mill.js';
import { parseGcode } from '../core/backplot.js';
import { storage, uid } from '../core/storage.js';
import { renderLathe, renderMill, renderMillSide } from './preview.js';
import { renderCalc, bindCalc } from './calc-view.js';
import { exportNc } from './export.js';
import { renderSettings, bindSettings, settingsAction, activePost, customPosts } from './settings-view.js';

// ─── stan ───────────────────────────────────────────────────────────────────
export function newLatheState() {
  const s = { prog: '1001', title: '', stock: { d: 30, l: 80, dmin: 20 }, material: 'S235', maxRpm: 4000, coolant: 'M08', tailstock: false, ops: [] };
  s.tools = defaultLatheTools(s.material);
  return s;
}
export function newMillState() {
  const s = { prog: '2001', title: '', stock: { x: 100, y: 80, z: 20 }, material: 'AL', maxRpm: 8100, coolant: 'M08', safeZ: 50, base: 6, ops: [] };
  s.tools = defaultMillTools(s.material);
  return s;
}
export const app = {
  screen: 'detal', machine: 'lathe', lathe: newLatheState(), mill: newMillState(),
  theme: storage.get('theme', 'dark'), projectId: null, projectName: '',
  ui: { backplot: true, side: false, big: false, collapsed: {}, gcView: 'code' },
  gc: null, bp: null, opId: 0
};
const cur = () => app[app.machine];
const isLathe = () => app.machine === 'lathe';
const OPS = () => (isLathe() ? LATHE_OPS : MILL_OPS);
const opColors = () => Object.fromEntries(Object.entries(OPS()).map(([k, v]) => [k, v.color]));

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, v) { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => a[k], obj); o[last] = v; }

// ─── html helpers ───────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function num(label, path, val, o = {}) {
  const step = o.step ?? 1;
  return `<div class="fl ${o.cls || ''}"><label>${label}</label><div class="num">
    <input type="number" inputmode="decimal" data-path="${path}" value="${val ?? ''}" step="${step}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}>
    <button type="button" data-step="-1" tabindex="-1">−</button><button type="button" data-step="1" tabindex="-1">+</button></div></div>`;
}
export function sel(label, path, val, opts, o = {}) {
  return `<div class="fl ${o.cls || ''}"><label>${label}</label><select data-path="${path}" ${o.type ? `data-type="${o.type}"` : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}
function txt(label, path, val, o = {}) {
  return `<div class="fl ${o.cls || ''}"><label>${label}</label><input type="text" data-path="${path}" data-type="str" value="${esc(val)}" ${o.ph ? `placeholder="${o.ph}"` : ''}></div>`;
}
const matOpts = () => MATERIAL_KEYS.map((k) => [k, MATERIALS[k].name]);
const toolOpts = () => cur().tools.map((t) => [t.no, `T${String(t.no).padStart(2, '0')} ${t.type || '— puste —'}${t.d ? ' D' + t.d : ''}`]);

// ─── obliczenia ─────────────────────────────────────────────────────────────
export function compute() {
  const s = cur();
  s.customPosts = customPosts();
  s.ops.forEach((o, i) => { o.id ??= ++app.opId; });
  const post = activePost(app.machine);
  app.post = post;
  app.gc = isLathe() ? generateLathe(s, post) : generateMill(s, post);
  app.bp = parseGcode(app.gc.lines, app.machine);
  return app.gc;
}

// ─── ekrany ─────────────────────────────────────────────────────────────────
function previewHtml() {
  return `<div class="preview ${app.ui.big ? 'big' : ''}" id="pv">
    <svg id="pv-svg" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="pv-bar">
      <button data-act="pv-bp" class="${app.ui.backplot ? 'on' : ''}">ścieżka</button>
      ${isLathe() ? '' : `<button data-act="pv-side" class="${app.ui.side ? 'on' : ''}">XZ</button>`}
      <button data-act="pv-fit">⤢</button>
      <button data-act="pv-big">${app.ui.big ? '✕' : '⛶'}</button>
    </div>
    <div class="pv-legend"><span><i style="border-color:#00c8a0"></i>posuw</span><span><i style="border-color:#f85149;border-style:dashed"></i>szybki</span>${isLathe() ? '<span><i style="border-color:#ffd166"></i>G70</span>' : ''}</div>
  </div>`;
}
export function drawPreview(keepView = true) {
  const svg = document.getElementById('pv-svg');
  if (!svg) return;
  const bp = app.ui.backplot ? app.bp : null;
  if (isLathe()) renderLathe(svg, cur(), bp, { keepView });
  else if (app.ui.side) renderMillSide(svg, cur(), { opColors: opColors() });
  else renderMill(svg, cur(), bp, { keepView, opColors: opColors() });
}

function screenDetal() {
  const s = cur();
  const m = getMaterial(s.material);
  const common = `
    <div class="sec">Program</div>
    <div class="card grid g3 narrow">
      ${txt('Numer O', 'prog', s.prog)}
      ${txt('Nazwa / detal', 'title', s.title, { ph: 'np. TULEJA 1234', cls: 'wide' })}
      ${sel('Materiał', 'material', s.material, matOpts(), { type: 'mat' })}
    </div>`;
  const lathe = `
    <div class="sec">Surówka <span class="sp"></span><small>⌀ × długość, min ⌀ = najmniejsza średnica detalu</small></div>
    <div class="card grid g3">
      ${num('Surówka ⌀', 'stock.d', s.stock.d, { step: 0.5, min: 1, max: 254 })}
      ${num('Długość L', 'stock.l', s.stock.l, { step: 1, min: 5, max: 406 })}
      ${num('Min ⌀ detalu', 'stock.dmin', s.stock.dmin, { step: 0.5, min: 0 })}
    </div>
    <div class="sec">Maszyna — Haas SL-20T</div>
    <div class="card grid g3">
      ${num('Max RPM (G50)', 'maxRpm', s.maxRpm, { step: 100, min: 100, max: 4000 })}
      ${sel('Chłodzenie', 'coolant', s.coolant, [['M08', 'M08 emulsja'], ['M88', 'M88 powietrze'], ['', 'brak']], { type: 'str' })}
      ${sel('Konik', 'tailstock', s.tailstock ? '1' : '0', [['0', 'brak'], ['1', 'M23/M24']], { type: 'bool' })}
    </div>`;
  const mill = `
    <div class="sec">Detal (prostopadłościan)</div>
    <div class="card grid g3">
      ${num('X długość', 'stock.x', s.stock.x, { step: 1, min: 1 })}
      ${num('Y szerokość', 'stock.y', s.stock.y, { step: 1, min: 1 })}
      ${num('Z wysokość', 'stock.z', s.stock.z, { step: 1, min: 1 })}
    </div>
    <div class="sec">Punkt bazy G54 <span class="sp"></span><small>Z0 = góra detalu</small></div>
    <div class="card"><div class="base-grid">${BASES.map((b) => `<button data-act="base" data-i="${b.i}" class="${b.i === s.base ? 'on' : ''}" title="${b.t}">${b.n}</button>`).join('')}</div></div>
    <div class="sec">Maszyna — Haas VF</div>
    <div class="card grid g3">
      ${num('Max RPM', 'maxRpm', s.maxRpm, { step: 100, min: 100, max: 15000 })}
      ${sel('Chłodzenie', 'coolant', s.coolant, [['M08', 'M08 emulsja'], ['M07', 'M07 mgła'], ['M88', 'M88 TSC'], ['', 'brak']], { type: 'str' })}
      ${num('Bezpieczne Z', 'safeZ', s.safeZ, { step: 5, min: 5 })}
    </div>`;
  return `${previewHtml()}${common}${isLathe() ? lathe : mill}
    <div class="sec">Materiał — parametry bazowe <span class="sp"></span><small>${esc(m.name)}, grupa ISO ${m.group}</small></div>
    <div class="card kv">${isLathe()
      ? `<span>Vc zgrubne</span><b>${m.turn.vc_r}</b> m/min<br><span>Vc wykończ.</span><b>${m.turn.vc_fn}</b> m/min<br><span>f zgrubne</span><b>${m.turn.f_r}</b> mm/obr<br><span>f wykończ.</span><b>${m.turn.f_fn}</b> mm/obr<br><span>Vc gwint</span><b>${m.turn.vc_th}</b> m/min<br><span>Vc wiercenie</span><b>${m.turn.vc_dr}</b> m/min`
      : `<span>Vc frezowanie</span><b>${m.mill.vc}</b> m/min<br><span>fz</span><b>${m.mill.fz}</b> mm/ząb<br><span>ap / ae</span><b>${m.mill.ap}</b> mm / <b>${Math.round(m.mill.ae * 100)}</b> %D<br><span>Vc wiercenie</span><b>${m.mill.vcD}</b> m/min<br><span>f wiercenie</span><b>${m.mill.fzD}</b> mm/obr<br><span>Vc gwintownik</span><b>${m.mill.vcT}</b> m/min`}
      <br><span>kc1 / mc</span><b>${m.kc1}</b> N/mm² / <b>${m.mc}</b>
    </div>
    <div class="sec">Projekt</div>
    <div class="card row">
      <button class="btn primary" data-act="proj-save">💾 Zapisz</button>
      <button class="btn" data-act="proj-open">📂 Otwórz</button>
      <button class="btn" data-act="proj-new">✚ Nowy</button>
      <span class="muted mono" style="font-size:11px">${app.projectName ? esc(app.projectName) : 'niezapisany'}</span>
    </div>`;
}

function opFields(op) {
  const id = `ops.${cur().ops.indexOf(op)}`;
  const P = (k) => `${id}.${k}`;
  const T = sel('Narzędzie', P('tool'), op.tool, toolOpts(), { type: 'int' });
  const N = (l, k, o) => num(l, P(k), op[k], o);
  if (isLathe()) {
    const VF = N('Vc m/min', 'vc', { step: 5, min: 5 }) + N('f mm/obr', 'f', { step: 0.01, min: 0.005 });
    switch (op.type) {
      case 'face': return T + VF + N('ap mm', 'ap', { step: 0.1, min: 0.1 }) + N('Zdjąć mm', 'cut', { step: 0.1, min: 0 });
      case 'rough': return T + VF + N('ap mm', 'ap', { step: 0.25, min: 0.25 }) + N('Nadd. X', 'sx', { step: 0.05, min: 0 }) + N('Nadd. Z', 'sz', { step: 0.05, min: 0 }) + profileTable(op, id);
      case 'finish': {
        const roughs = cur().ops.filter((o) => o.type === 'rough');
        return T + VF + sel('Profil z G71', P('ref'), op.ref ?? '', [['', 'poprzedni G71'], ...roughs.map((r) => [r.id, 'OP ' + (cur().ops.indexOf(r) + 1)])], { type: 'int' });
      }
      case 'turn': return T + VF + N('X końc. ⌀', 'x', { step: 0.5, min: 0 }) + N('Z końc.', 'z', { step: 1 }) + N('ap mm', 'ap', { step: 0.25, min: 0.25 });
      case 'taper': return T + VF + N('X1 ⌀', 'x1', { step: 0.5, min: 0 }) + N('Z1', 'z1', { step: 1 }) + N('X2 ⌀', 'x2', { step: 0.5, min: 0 }) + N('Z2', 'z2', { step: 1 });
      case 'bore': return T + VF + N('Otwór wst. ⌀', 'dpre', { step: 0.5, min: 1 }) + N('Wytoczyć ⌀', 'dbore', { step: 0.5, min: 1 }) + N('Głębokość', 'depth', { step: 1, min: 1 }) + N('ap', 'ap', { step: 0.1, min: 0.1 }) + N('Nadd. X', 'sx', { step: 0.05, min: 0 }) + N('Nadd. Z', 'sz', { step: 0.05, min: 0 });
      case 'groove': return T + VF + N('X dno ⌀', 'xb', { step: 0.5, min: 0 }) + N('Z pozycja', 'z', { step: 0.5 }) + N('Szer. mm', 'w', { step: 0.5, min: 0.5 });
      case 'thread': return T + N('Vc m/min', 'vc', { step: 5, min: 5 }) + N('D nom.', 'dnom', { step: 1, min: 2 }) + N('Skok P', 'pitch', { step: 0.25, min: 0.25 }) + N('Długość Z', 'zlen', { step: 1, min: 1 }) + N('Przejść', 'passes', { step: 1, min: 3, max: 30 }) + sel('Typ', P('internal'), op.internal ? '1' : '0', [['0', 'zewnętrzny'], ['1', 'wewnętrzny']], { type: 'bool' });
      case 'drill': return T + VF + N('⌀ wiertła', 'fi', { step: 0.5, min: 1 }) + N('Głębokość', 'depth', { step: 1, min: 1 }) + N('Peck mm', 'peck', { step: 1, min: 0.5 }) + sel('Cykl', P('cycle'), op.cycle, [['G83', 'G83 pełny peck'], ['G74', 'G74 łamanie wióra']], { type: 'str' });
      case 'cutoff': return T + VF + N('Z odcięcia', 'z', { step: 1 }) + N('Szer. płytki', 'w', { step: 0.5, min: 1 });
    }
  } else {
    const ZT = N('Z docel.', 'zt', { step: 0.5, max: 0 }), AP = N('ap mm', 'ap', { step: 0.5, min: 0.1 });
    const RECT = N('X1', 'x1', { step: 1 }) + N('Y1', 'y1', { step: 1 }) + N('X2', 'x2', { step: 1 }) + N('Y2', 'y2', { step: 1 });
    const COMP = sel('Kompensacja', P('comp'), op.comp, [[41, 'G41 lewa'], [42, 'G42 prawa']], { type: 'int' });
    const HOLES = sel('Wzór', P('pattern'), op.pattern, [['grid', 'siatka'], ['pcd', 'okrąg PCD']], { type: 'str' }) +
      (op.pattern === 'pcd'
        ? N('Xc', 'cx', { step: 1 }) + N('Yc', 'cy', { step: 1 }) + N('PCD ⌀', 'pcd', { step: 1, min: 1 }) + N('Ilość', 'n', { step: 1, min: 1 }) + N('Kąt start°', 'start', { step: 15 })
        : N('X1', 'x1', { step: 1 }) + N('Y1', 'y1', { step: 1 }) + N('Ilość X', 'nx', { step: 1, min: 1 }) + N('Ilość Y', 'ny', { step: 1, min: 1 }) + N('Rozstaw X', 'dx', { step: 1, min: 0 }) + N('Rozstaw Y', 'dy', { step: 1, min: 0 }));
    switch (op.type) {
      case 'face': return T + AP + N('ae %D', 'ae', { step: 0.05, min: 0.1, max: 1 }) + ZT + RECT;
      case 'prof': return T + COMP + AP + ZT + N('R naroża', 'r', { step: 1, min: 0 }) + RECT;
      case 'circ': return T + COMP + AP + ZT + N('Xc', 'cx', { step: 1 }) + N('Yc', 'cy', { step: 1 }) + N('R', 'r', { step: 1, min: 0.5 });
      case 'pock': return T + AP + ZT + N('krok %D', 'step', { step: 0.05, min: 0.1, max: 0.9 }) + sel('Wejście', P('entry'), op.entry, [['ramp', 'rampa 3°'], ['plunge', 'pionowe']], { type: 'str' }) + RECT;
      case 'cpock': return T + AP + ZT + N('krok %D', 'step', { step: 0.05, min: 0.1, max: 0.9 }) + N('Xc', 'cx', { step: 1 }) + N('Yc', 'cy', { step: 1 }) + N('⌀ kieszeni', 'd', { step: 1, min: 1 });
      case 'slot': return T + AP + ZT + RECT;
      case 'drill': return T + ZT + N('Peck mm', 'peck', { step: 1, min: 0 }) + HOLES;
      case 'tap': return T + ZT + N('Skok', 'pitch', { step: 0.25, min: 0.25 }) + HOLES;
      case 'bore': return T + ZT + N('Xc', 'cx', { step: 1 }) + N('Yc', 'cy', { step: 1 }) + N('⌀ otworu', 'dia', { step: 0.5, min: 1 }) + sel('Cykl', P('cycle'), op.cycle, [['G85', 'G85 wytaczanie'], ['G76', 'G76 z odsunięciem']], { type: 'str' });
      case 'chamfer': return T + N('Faza C', 'c', { step: 0.5, min: 0.2 }) + N('Z górnej kraw.', 'zt', { step: 0.5, max: 0 }) + RECT;
    }
  }
  return '';
}
function profileTable(op, id) {
  const rows = op.profile.map((p, i) => `<tr>
    <td class="muted">${i + 1}</td>
    <td><input type="number" inputmode="decimal" step="0.5" data-path="${id}.profile.${i}.x" value="${p.x}"></td>
    <td><input type="number" inputmode="decimal" step="0.5" data-path="${id}.profile.${i}.z" value="${p.z}"></td>
    <td><input type="number" inputmode="decimal" step="0.5" min="0" data-path="${id}.profile.${i}.c" value="${p.c || 0}"></td>
    <td><input type="number" inputmode="decimal" step="0.5" min="0" data-path="${id}.profile.${i}.r" value="${p.r || 0}"></td>
    <td><button type="button" data-act="prof-del" data-op="${op.id}" data-i="${i}">✕</button></td></tr>`).join('');
  return `<div class="wide"><table class="prof-table"><thead><tr><th>#</th><th>X ⌀</th><th>Z</th><th>faza C</th><th>prom. R</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:6px"><button class="btn sm" data-act="prof-add" data-op="${op.id}">+ punkt</button><span class="muted" style="font-size:11px">profil od czoła (Z0) w głąb; C/R w punkcie = naroże za tym punktem</span></div></div>`;
}

function screenOps() {
  const s = cur(), O = OPS();
  const list = s.ops.length ? s.ops.map((op, i) => {
    const d = O[op.type];
    const col = app.ui.collapsed[op.id];
    return `<div class="op ${col ? 'collapsed' : ''}" style="--opc:${d.color}" data-opid="${op.id}">
      <div class="op-h" data-act="op-toggle" data-op="${op.id}">
        <span class="idx">${i + 1}</span><span class="name">${d.full}</span>
        <span class="ttag">T${String(op.tool).padStart(2, '0')}</span>
        <button data-act="op-up" data-op="${op.id}">↑</button><button data-act="op-down" data-op="${op.id}">↓</button>
        <button data-act="op-dup" data-op="${op.id}" title="duplikuj">⧉</button>
        <button class="x" data-act="op-del" data-op="${op.id}">✕</button>
      </div>
      <div class="op-b">${opFields(op)}</div>
    </div>`;
  }).join('') : '<div class="empty">Brak operacji — dodaj pierwszą przyciskami poniżej</div>';
  const add = Object.entries(O).map(([k, v]) => `<button data-act="op-add" data-type="${k}" style="--c:${v.color}">+ ${v.label}</button>`).join('');
  return `${previewHtml()}<div class="sec">Operacje <span class="sp"></span><small>${s.ops.length} op. · ${app.gc ? app.gc.time.total.toFixed(1) + ' min' : ''}</small></div>${list}<div class="add-bar">${add}</div>`;
}

function screenTools() {
  const s = cur(), used = new Set(s.ops.map((o) => o.tool));
  const types = isLathe() ? LATHE_TOOL_TYPES : MILL_TOOL_TYPES;
  const rows = s.tools.map((t, i) => {
    const P = (k) => `tools.${i}.${k}`;
    const fields = isLathe()
      ? `<div><label>typ</label><select data-path="${P('type')}" data-type="str"><option value="">— puste —</option>${types.map((x) => `<option ${x === t.type ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
         <div><label>Vc</label><input type="number" inputmode="decimal" step="5" data-path="${P('vc')}" value="${t.vc}"></div>
         <div><label>f</label><input type="number" inputmode="decimal" step="0.01" data-path="${P('f')}" value="${t.f}"></div>
         <div><label>ap</label><input type="number" inputmode="decimal" step="0.1" data-path="${P('ap')}" value="${t.ap}"></div>
         <div><label>${/rowk|odcin/i.test(t.type) ? 'szer' : 'rε'}</label><input type="number" inputmode="decimal" step="0.1" data-path="${P(/rowk|odcin/i.test(t.type) ? 'w' : 'r')}" value="${/rowk|odcin/i.test(t.type) ? (t.w ?? 3) : (t.r ?? 0.4)}"></div>`
      : `<div><label>typ</label><select data-path="${P('type')}" data-type="str"><option value="">— puste —</option>${types.map((x) => `<option ${x === t.type ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
         <div><label>D</label><input type="number" inputmode="decimal" step="0.1" data-path="${P('d')}" value="${t.d}"></div>
         <div><label>z</label><input type="number" inputmode="numeric" step="1" data-path="${P('z')}" value="${t.z}"></div>
         <div><label>Vc</label><input type="number" inputmode="decimal" step="5" data-path="${P('vc')}" value="${t.vc}"></div>
         <div><label>fz</label><input type="number" inputmode="decimal" step="0.01" data-path="${P('fz')}" value="${t.fz}"></div>`;
    return `<div class="tool ${used.has(t.no) ? 'used' : ''} ${t.type ? '' : 'empty'}"><div class="tn">T${String(t.no).padStart(2, '0')}</div><div class="tf">${fields}</div></div>`;
  }).join('');
  return `<div class="sec">Magazyn narzędzi — ${s.tools.length} pozycji <span class="sp"></span><small>${isLathe() ? 'Vc m/min · f mm/obr · ap mm · rε mm' : 'D mm · z zęby · Vc m/min · fz mm/ząb'}</small></div>
    <div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="tools-preset">↻ Preset dla ${esc(getMaterial(s.material).name.split(' ')[0])}</button><span class="muted" style="font-size:11px">niebieskie = użyte w operacjach</span></div>
    <div class="card" style="padding:0 10px">${rows}</div>`;
}

function highlight(line) {
  if (!line.trim()) return '&nbsp;';
  const comments = [];
  let h = esc(line).replace(/\(([^)]*)\)/g, (m) => { comments.push(m); return `\u0000${comments.length - 1}\u0000`; });
  h = h.replace(/^(O\d+)/, '<span class="o">$1</span>');
  h = h.replace(/\b(N\d+)/g, '<span class="n">$1</span>');
  h = h.replace(/\b(G\d+\.?\d*)/g, '<span class="g">$1</span>');
  h = h.replace(/\b(M\d+)/g, '<span class="m">$1</span>');
  h = h.replace(/\b(T\d+)/g, '<span class="t">$1</span>');
  h = h.replace(/\b(F-?[\d.]+)/g, '<span class="f">$1</span>');
  h = h.replace(/\b(S\d+)/g, '<span class="s">$1</span>');
  h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => { const c = comments[+i]; const cls = /^\(====/.test(c) ? 'h' : /^\(!/.test(c) ? 'w' : 'c'; return `<span class="${cls}">${c}</span>`; });
  return h;
}
function screenGcode() {
  const g = app.gc || compute();
  const s = cur();
  const stats = `<div class="stat">
    <div class="k"><b>${g.lines.length}</b><span>linii</span></div>
    <div class="k"><b>${g.time.total.toFixed(1)}</b><span>min szac.</span></div>
    <div class="k"><b>${g.time.toolChanges}</b><span>zmian narz.</span></div>
    <div class="k"><b>${s.ops.length}</b><span>operacji</span></div></div>`;
  const warn = g.warnings.length ? `<div class="warn-box">${g.warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join('')}</div>` : '';
  const code = g.lines.map((l) => `<span class="ln ${/\(!/.test(l) ? 'warn' : ''}">${highlight(l)}</span>`).join('');
  return `<div class="sec">G-kod — O${esc(String(s.prog).padStart(4, '0'))} <span class="sp"></span><button class="btn sm" data-act="nav" data-s="settings" style="font-family:var(--mono);font-size:11px">⚙ ${esc((app.post || {}).name || 'post')}</button></div>
    ${stats}${warn}
    <div class="row" style="margin-bottom:8px">
      <button class="btn primary" data-act="gc-copy">⧉ Kopiuj</button>
      <button class="btn ok" data-act="gc-share">⇪ Udostępnij .NC</button>
      <button class="btn" data-act="gc-download">⤓ Pobierz .NC</button>
      <button class="btn ${app.ui.gcView === 'plot' ? 'primary' : ''}" data-act="gc-view">${app.ui.gcView === 'plot' ? '⌨ Kod' : '◎ Backplot'}</button>
    </div>
    ${app.ui.gcView === 'plot' ? previewHtml().replace('class="preview', 'class="preview tall') : `<div class="gc-wrap"><div class="gc" id="gc-text">${code}</div></div>`}`;
}

// ─── render ─────────────────────────────────────────────────────────────────
const NAV = [
  ['detal', 'Detal', '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'],
  ['ops', 'Operacje', '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>'],
  ['tools', 'Narzędzia', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.1-2.1z"/>'],
  ['gcode', 'G-kod', '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14"/>'],
  ['calc', 'Kalkul.', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/>'],
  ['settings', 'Ustaw.', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>']
];
export function render() {
  compute();
  const root = document.getElementById('app');
  const screens = { detal: screenDetal, ops: screenOps, tools: screenTools, gcode: screenGcode, calc: () => renderCalc(app), settings: () => renderSettings(app) };
  root.innerHTML = `
    <header class="hdr">
      <span class="logo">CNC VPS</span>
      <div class="seg"><button data-act="machine" data-m="lathe" class="${isLathe() ? 'on' : ''}">Tokarka</button><button data-act="machine" data-m="mill" class="${isLathe() ? '' : 'on'}">Frezarka</button></div>
      <button class="icon-btn" data-act="theme" title="motyw">${app.theme === 'dark' ? '☀' : '☾'}</button>
      <button class="icon-btn" data-act="proj-open" title="projekty">📂</button>
    </header>
    <main class="screen" id="screen">${screens[app.screen]()}</main>
    <nav class="nav">${NAV.map(([k, l, ic]) => `<button data-act="nav" data-s="${k}" class="${app.screen === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ic}</svg>${l}${k === 'gcode' && app.gc && app.gc.warnings.length ? `<span class="badge">${app.gc.warnings.length}</span>` : ''}</button>`).join('')}</nav>`;
  drawPreview(false);
  if (app.screen === 'calc') bindCalc(app);
  if (app.screen === 'settings') bindSettings(app, render, toast);
  window.scrollTo(0, 0);
}
/** Lekka aktualizacja po zmianie wartości (bez przebudowy formularza). */
function refresh() {
  compute();
  drawPreview(true);
  if (app.screen === 'gcode' && app.ui.gcView === 'code') {
    const main = document.getElementById('screen'); if (main) main.innerHTML = screenGcode();
  }
  const badge = document.querySelector('.nav [data-s="gcode"] .badge');
  const n = app.gc.warnings.length;
  if (badge && !n) badge.remove();
  if (!badge && n) document.querySelector('.nav [data-s="gcode"]').insertAdjacentHTML('beforeend', `<span class="badge">${n}</span>`);
  const sm = document.querySelector('.sec small'); // czas na ekranie operacji
  if (app.screen === 'ops' && sm) sm.textContent = `${cur().ops.length} op. · ${app.gc.time.total.toFixed(1)} min`;
  autosave();
}
let autosaveT;
function autosave() { clearTimeout(autosaveT); autosaveT = setTimeout(() => storage.set('draft', { machine: app.machine, lathe: app.lathe, mill: app.mill, projectId: app.projectId, projectName: app.projectName }), 400); }

export function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2300); }

// ─── zdarzenia ──────────────────────────────────────────────────────────────
function onInput(e) {
  const el = e.target;
  const path = el.dataset.path;
  if (!path) return;
  let v = el.value;
  const type = el.dataset.type || (el.type === 'number' ? 'num' : 'str');
  if (type === 'num') { v = parseFloat(v); if (!Number.isFinite(v)) return; }
  else if (type === 'int') v = v === '' ? null : parseInt(v, 10);
  else if (type === 'bool') v = v === '1';
  setPath(cur(), path, v);
  if (type === 'mat') { cur().tools = isLathe() ? defaultLatheTools(v) : defaultMillTools(v); render(); return; }
  if (/^ops\.\d+\.(pattern|tool)$/.test(path) || /^ops\.\d+\.internal$/.test(path)) { render(); return; }
  refresh();
}
function onClick(e) {
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    const inp = stepBtn.parentElement.querySelector('input');
    const step = parseFloat(inp.step) || 1, dir = parseInt(stepBtn.dataset.step, 10);
    let v = (parseFloat(inp.value) || 0) + dir * step;
    if (inp.min !== '' && v < parseFloat(inp.min)) v = parseFloat(inp.min);
    if (inp.max !== '' && v > parseFloat(inp.max)) v = parseFloat(inp.max);
    inp.value = +v.toFixed(3);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const s = cur(), a = b.dataset.act, opId = parseInt(b.dataset.op, 10);
  const opIdx = s.ops.findIndex((o) => o.id === opId);
  switch (a) {
    case 'nav': app.screen = b.dataset.s; app.ui.big = false; render(); break;
    case 'machine': app.machine = b.dataset.m; app.ui.big = false; render(); autosave(); break;
    case 'theme': app.theme = app.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = app.theme; storage.set('theme', app.theme); render(); break;
    case 'post-import': case 'post-export': case 'post-delete': case 'post-reset':
      settingsAction(a, b, app, render, toast); break;
    case 'base': s.base = parseInt(b.dataset.i, 10); render(); break;
    case 'op-add': { const op = { id: ++app.opId, ...(isLathe() ? defaultLatheOp(b.dataset.type, s) : defaultMillOp(b.dataset.type, s)) }; s.ops.push(op); render(); setTimeout(() => document.querySelector(`[data-opid="${op.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); break; }
    case 'op-del': s.ops.splice(opIdx, 1); render(); break;
    case 'op-dup': { const c = JSON.parse(JSON.stringify(s.ops[opIdx])); c.id = ++app.opId; delete c._ns; delete c._ne; s.ops.splice(opIdx + 1, 0, c); render(); break; }
    case 'op-up': if (opIdx > 0) { [s.ops[opIdx - 1], s.ops[opIdx]] = [s.ops[opIdx], s.ops[opIdx - 1]]; render(); } break;
    case 'op-down': if (opIdx < s.ops.length - 1) { [s.ops[opIdx + 1], s.ops[opIdx]] = [s.ops[opIdx], s.ops[opIdx + 1]]; render(); } break;
    case 'op-toggle': if (e.target.closest('button')) return; app.ui.collapsed[opId] = !app.ui.collapsed[opId]; render(); break;
    case 'prof-add': { const pr = s.ops[opIdx].profile; const last = pr[pr.length - 1]; pr.push({ x: last.x, z: last.z - 10, c: 0, r: 0 }); render(); break; }
    case 'prof-del': if (s.ops[opIdx].profile.length > 2) { s.ops[opIdx].profile.splice(parseInt(b.dataset.i, 10), 1); render(); } break;
    case 'tools-preset': s.tools = isLathe() ? defaultLatheTools(s.material) : defaultMillTools(s.material); render(); toast('Preset narzędzi wczytany'); break;
    case 'pv-bp': app.ui.backplot = !app.ui.backplot; b.classList.toggle('on'); drawPreview(true); break;
    case 'pv-side': app.ui.side = !app.ui.side; b.classList.toggle('on'); drawPreview(false); break;
    case 'pv-fit': drawPreview(false); break;
    case 'pv-big': app.ui.big = !app.ui.big; document.getElementById('pv').classList.toggle('big', app.ui.big); b.textContent = app.ui.big ? '✕' : '⛶'; drawPreview(false); break;
    case 'gc-copy': navigator.clipboard.writeText(app.gc.lines.join('\n')).then(() => toast('Skopiowano G-kod')); break;
    case 'gc-share': exportNc(app, 'share'); break;
    case 'gc-download': exportNc(app, 'download'); break;
    case 'gc-view': app.ui.gcView = app.ui.gcView === 'plot' ? 'code' : 'plot'; render(); break;
    case 'proj-save': saveProject(); break;
    case 'proj-open': openProjects(); break;
    case 'proj-new': if (confirm('Nowy projekt? Niezapisane zmiany przepadną.')) { app[app.machine] = isLathe() ? newLatheState() : newMillState(); app.projectId = null; app.projectName = ''; render(); } break;
    case 'proj-load': { const p = storage.listProjects().find((x) => x.id === b.dataset.id); if (p) { app.machine = p.machine; app[p.machine] = p.state; app.projectId = p.id; app.projectName = p.name; closeModal(); render(); toast('Wczytano ' + p.name); } break; }
    case 'proj-delete': if (confirm('Usunąć projekt?')) { storage.deleteProject(b.dataset.id); openProjects(); } break;
    case 'modal-close': closeModal(); break;
    case 'export-json': { const blob = new Blob([JSON.stringify({ machine: app.machine, state: cur(), name: app.projectName }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (app.projectName || 'projekt') + '.cncvps.json'; a.click(); break; }
    case 'import-json': document.getElementById('imp-file').click(); break;
  }
}
function saveProject() {
  const name = prompt('Nazwa projektu:', app.projectName || (cur().title || (isLathe() ? 'Tokarka O' : 'Frezarka O') + cur().prog));
  if (!name) return;
  app.projectId ??= uid(); app.projectName = name;
  storage.saveProject({ id: app.projectId, name, machine: app.machine, state: cur() });
  toast('Zapisano'); render();
}
function modal(html) { closeModal(); const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div>${html}</div>`; m.addEventListener('click', (e) => { if (e.target === m) closeModal(); }); document.body.appendChild(m); }
function closeModal() { document.getElementById('modal')?.remove(); }
function openProjects() {
  const list = storage.listProjects();
  modal(`<div class="sec" style="margin-top:0">Projekty <span class="sp"></span><button class="btn sm" data-act="modal-close">zamknij</button></div>
    ${list.length ? list.map((p) => `<div class="proj"><div class="pn"><b>${esc(p.name)}</b><small>${p.machine === 'lathe' ? 'tokarka' : 'frezarka'} · O${p.state.prog} · ${p.state.ops.length} op. · ${new Date(p.updated).toLocaleString('pl-PL')}</small></div><button class="btn sm primary" data-act="proj-load" data-id="${p.id}">otwórz</button><button class="btn sm danger" data-act="proj-delete" data-id="${p.id}">✕</button></div>`).join('') : '<div class="empty">Brak zapisanych projektów</div>'}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="export-json">⤓ Eksport JSON</button><button class="btn" data-act="import-json">⤒ Import JSON</button><input type="file" id="imp-file" accept=".json" hidden></div>`);
  document.getElementById('imp-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { const o = JSON.parse(t); if (o.state && o.machine) { app.machine = o.machine; app[o.machine] = o.state; app.projectId = null; app.projectName = o.name || f.name; closeModal(); render(); toast('Zaimportowano'); } });
  });
}
export function boot() {
  document.documentElement.dataset.theme = app.theme;
  const draft = storage.get('draft');
  if (draft && draft.lathe && draft.mill) { Object.assign(app, { machine: draft.machine, lathe: draft.lathe, mill: draft.mill, projectId: draft.projectId, projectName: draft.projectName || '' }); }
  app.opId = Math.max(0, ...app.lathe.ops.map((o) => o.id || 0), ...app.mill.ops.map((o) => o.id || 0));
  const root = document.getElementById('app');
  root.addEventListener('input', onInput);
  document.body.addEventListener('click', onClick);
  render();
}
