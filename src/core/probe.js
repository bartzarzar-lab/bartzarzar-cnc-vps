// Cykle pomiarowe sondą Renishaw (pakiet EasySet / WIPS: jedno makro G65 P9023,
// typ cyklu wybiera parametr A). Wartości A i składnia odwzorowane z działających
// programów Haas oraz dokumentacji Haas VPS Probe.
//
// UWAGA BEZPIECZEŃSTWA (przenoszona do generowanego programu):
//   - sonda musi być skalibrowana, a program uruchomiony z Z w bezpiecznej wysokości,
//   - pozycja startowa musi leżeć nad/przy mierzonym elemencie — makro nie szuka detalu,
//   - wszystkie wymiary są w milimetrach (G21); dokumentacja Haasa podaje przykłady w calach,
//   - w pakiecie Inspection Plus (osobne makra O98xx) parametr S ma INNE znaczenie
//     (S1 = G54), więc programu nie wolno przenosić między pakietami bez zamiany S.

import { ascii } from './calc.js';
import { probeWcsValue, withDefaults } from './posts.js';
import { t as tr, tg } from '../i18n/index.js';

export const PROBE_OPS = {
  pbore:   { A: 1,  label: 'Otwór',        full: 'Pomiar otworu / bore',            color: '#40c8d8', needs: ['d'] },
  pboss:   { A: 2,  label: 'Czop',         full: 'Pomiar czopa / boss',             color: '#58b0f5', needs: ['d', 'z'] },
  ppockx:  { A: 3,  label: 'Kieszeń X',    full: 'Pomiar kieszeni w osi X',         color: '#f0a840', needs: ['x'] },
  ppocky:  { A: 3,  label: 'Kieszeń Y',    full: 'Pomiar kieszeni w osi Y',         color: '#f0a840', needs: ['y'] },
  pwebx:   { A: 4,  label: 'Żebro X',      full: 'Pomiar żebra w osi X',    color: '#b078f5', needs: ['x', 'z'] },
  pweby:   { A: 4,  label: 'Żebro Y',      full: 'Pomiar żebra w osi Y',    color: '#b078f5', needs: ['y', 'z'] },
  psurfz:  { A: 9,  label: 'Płaszcz. Z',   full: 'Pomiar powierzchni w osi Z',      color: '#4ec994', needs: [] },
  pcorner: { A: 17, label: 'Naroże',       full: 'Pomiar naroża — imadło lub blok',   color: '#d8a030', needs: ['x', 'y', 'z'] },
  pblock:  { A: 16, label: 'Środek bloku', full: 'Środek bloku — start od środka',  color: '#70c070', needs: ['x', 'y', 'z'] }
};

export const PROBE_KEYS = Object.keys(PROBE_OPS);
export const isProbeOp = (type) => PROBE_KEYS.includes(type);

/** Domyślne parametry nowej operacji pomiarowej. */
export function defaultProbeOp(type, state) {
  const { x: X, y: Y } = state.stock;
  const d = PROBE_OPS[type];
  const probeTool = (state.tools.find((t) => /sonda|probe/i.test(t.type || '')) || {}).no || 20;
  const base = { tool: probeTool, sx: X / 2, sy: Y / 2, sz: -5, approach: 10, update: true };
  const geo = {
    pbore: { d: 20 },
    pboss: { d: 20, z: -10 },
    ppockx: { x: 40 }, ppocky: { y: 40 },
    pwebx: { x: 40, z: -10 }, pweby: { y: 40, z: -10 },
    psurfz: {},
    pcorner: { x: 10, y: 10, z: -5, sx: 0, sy: 0 },
    pblock: { x: X, y: Y, z: -5 }
  }[type] || {};
  return { type, A: d.A, ...base, ...geo };
}

const f3 = (v) => Number(v).toFixed(3);
const wcsLabel = (w) => String(w || 'G54').replace(/^G154P(\d+)$/, 'G154 P$1');

/**
 * Buduje bloki jednej operacji pomiarowej.
 * @returns {{lines:string[], warnings:string[]}}
 */
export function probeBlock(op, state, postIn) {
  const post = withDefaults(postIn);
  const K = post.codes;
  const d = PROBE_OPS[op.type];
  const L = [], W = [];
  const macro = (post.probe && post.probe.macro) || 'P9023';
  const S = probeWcsValue(state.wcs || 'G54');
  const C = (s, v) => `(${ascii(tg(s, v))})`;

  if (!post.probe) {
    W.push(tr('Post „{p}” nie ma zdefiniowanej sondy — bloki wygenerowano wg schematu Renishaw EasySet, sprawdź je na maszynie', { p: post.name }));
  }

  L.push(C('---- POMIAR: {name} ----', { name: tg(d.full) }));
  L.push(C('wynik zapisywany do układu {w} jako S{s}', { w: wcsLabel(state.wcs), s: S }));

  // dojazd: XY nad element, potem Z na wysokość pomiaru
  L.push(`${K.rapid || 'G00'} ${K.abs || 'G90'} X${f3(op.sx)} Y${f3(op.sy)}`);
  L.push(`${K.rapid || 'G00'} Z${f3((op.sz || 0) + (op.approach || 10))} ${C('dojazd nad element')}`);
  if (op.type !== 'psurfz') L.push(`${K.rapid || 'G00'} Z${f3(op.sz)} ${C('wysokość pomiaru')}`);

  // wywołanie makra
  const args = [`A${d.A}.`];
  if (d.needs.includes('d')) args.push(`D${f3(op.d)}`);
  if (d.needs.includes('x')) args.push(`X${f3(op.x)}`);
  if (d.needs.includes('y')) args.push(`Y${f3(op.y)}`);
  if (d.needs.includes('z')) args.push(`Z${f3(op.z)}`);
  if (op.update !== false) args.push(`S${S}`);
  if (op.tol > 0) args.push(`H${f3(op.tol)}`);
  L.push(`${K.rapid || 'G00'} ${K.abs || 'G90'}`);
  L.push(`G65 ${macro} ${args.join(' ')}`);
  L.push(`${K.rapid || 'G00'} Z${f3((op.sz || 0) + (op.approach || 10))}`);

  // walidacja
  const nm = tr(d.full);
  if (d.needs.includes('d') && !(op.d > 0)) W.push(tr('{name}: podaj nominalną średnicę', { name: nm }));
  if (d.needs.includes('x') && !(op.x > 0)) W.push(tr('{name}: podaj nominalną szerokość w X', { name: nm }));
  if (d.needs.includes('y') && !(op.y > 0)) W.push(tr('{name}: podaj nominalną szerokość w Y', { name: nm }));
  if (op.update === false) W.push(tr('{name}: wynik NIE jest zapisywany do układu (brak S) — tylko odczyt', { name: nm }));
  return { lines: L, warnings: W };
}

/** Nagłówek sekcji pomiarowej — wspólne ostrzeżenia na początku programu. */
export function probeHeader(state, postIn) {
  const post = withDefaults(postIn);
  const C = (s, v) => `(${ascii(tg(s, v))})`;
  const W = (s) => `(! ${ascii(tg(s))} !)`;
  return [
    C('==== SEKCJA POMIAROWA - SONDA ===='),
    W('sprawdź kalibrację sondy i korektor długości'),
    W('wymiary w mm - dokumentacja Haas podaje przykłady w calach'),
    post.control === 'NGC'
      ? C('sterowanie NGC - układy rozszerzone zapisywane jako S154.nn')
      : C('sterowanie Classic Control - układ zapisywany jako S54.'),
    C('pakiet EasySet/WIPS: jedno makro G65 P9023, typ cyklu w parametrze A'),
    W('Inspection Plus O98xx ma inne znaczenie S: S1=G54')
  ];
}
