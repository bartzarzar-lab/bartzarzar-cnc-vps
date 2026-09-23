// Post-procesory — definicja dialektu sterownika i formatowania programu.
//
// Post steruje trzema rzeczami:
//   1. kodami (codes/cycles) — których G/M używa generator,
//   2. szablonami bloków (header / toolChange / footer) — co leci na starcie, przy zmianie
//      narzędzia i na końcu programu; tokeny {NAZWA} podstawia funkcja tpl(),
//   3. formatowaniem (seq, prec, comment, spaces) — nakładane na gotowy program przez finalize().
//
// Dzięki temu generatory (lathe.js / mill.js) nie znają konkretnej maszyny.

import { ascii } from './calc.js';
import { tg, t as tr } from '../i18n/index.js';

export const POST_VERSION = 1;

// ─── szablony ───────────────────────────────────────────────────────────────
/** Podstawia {TOKEN} z ctx. Linia, w której token jest pusty i zostaje sama nazwa, znika. */
export function tpl(lines, ctx) {
  const out = [];
  for (const raw of lines || []) {
    if (raw === '') { out.push(''); continue; }
    let drop = false;
    const s = raw.replace(/\{(\w+)(?::([^}]*))?\}/g, (_, k, dflt) => {
      const v = ctx[k];
      if (v === undefined || v === null || v === '') {
        if (dflt !== undefined) return dflt;
        drop = true;
        return '';
      }
      return String(v);
    });
    if (!drop && s.trim() !== '') out.push(translateComments(s.trim(), raw));
  }
  return out;
}

/** Tłumaczy stałe komentarze szablonu (bez tokenów {…}) na język komentarzy G-kodu. */
function translateComments(line, raw) {
  if (!/\(/.test(raw)) return line;
  const fixed = [...raw.matchAll(/\(([^){]*)\)/g)].map((m) => m[1]);
  let out = line;
  for (const c of fixed) out = out.replace('(' + c + ')', '(' + tg(c) + ')');
  return out;
}

// ─── formatowanie gotowego programu ─────────────────────────────────────────
const GEOM = /([XYZIJKUWR])(-?\d+\.?\d*)/g;

function fmtNum(v, prec, trimZeros) {
  let s = Number(v).toFixed(prec);
  if (trimZeros) {
    if (s.includes('.')) s = s.replace(/0+$/, '');
  }
  if (!s.includes('.')) s += '.';
  return s;
}

/** Dzieli linię na fragmenty kodu i komentarzy, żeby formatować tylko kod. */
function mapCode(line, fn) {
  const parts = line.split(/(\([^)]*\))/g);
  return parts.map((p) => (p.startsWith('(') ? p : fn(p))).join('');
}

/**
 * Nakłada formatowanie postu na listę linii z generatora.
 * Linie zaczynające się od % , O…, oraz własne N… (etykiety profilu G71) nie są numerowane.
 */
export function finalize(lines, post) {
  const p = withDefaults(post);
  let n = p.seq.start;
  const out = [];
  for (let line of lines) {
    if (line === '') { out.push(''); continue; }
    // komentarze: wielkie litery + znaki zgodne z postem
    line = line.replace(/\(([^)]*)\)/g, (_, t) => p.comment.open + (p.comment.upper ? ascii(t) : t) + p.comment.close);
    // precyzja współrzędnych
    line = mapCode(line, (code) => code.replace(GEOM, (_, reg, val) => reg + fmtNum(val, p.prec.xyz, p.trimZeros)));
    // spacje
    if (!p.spaces) line = mapCode(line, (code) => code.replace(/\s+/g, ''));
    // numeracja
    const bare = line.trim();
    const skip = bare.startsWith('%') || /^O\d/.test(bare) || /^N\d/.test(bare) ||
      (bare.startsWith('(') && !p.seq.comments);
    if (p.seq.on && !skip) {
      const num = p.seq.digits ? String(n).padStart(p.seq.digits, '0') : String(n);
      n += p.seq.inc;
      line = p.seq.prefix + num + (p.spaces ? ' ' : '') + line;
    }
    out.push(line + (p.blockEnd || ''));
  }
  return out;
}

/** Komentarz w stylu postu. */
export function comment(post, text) {
  const p = withDefaults(post);
  const t = p.comment.upper ? ascii(text) : String(text).replace(/[()]/g, '');
  return p.comment.open + t + p.comment.close;
}

// ─── model + wartości domyślne ──────────────────────────────────────────────
const DEFAULTS = {
  seq: { on: false, prefix: 'N', start: 10, inc: 10, digits: 0, comments: false },
  comment: { open: '(', close: ')', upper: true },
  prec: { xyz: 3, feed: 0 },
  trimZeros: false,
  spaces: true,
  blockEnd: '',
  progPrefix: 'O',
  progDigits: 4,
  startChar: '%',
  endChar: '%',
  control: 'HCC',       // HCC = Haas Classic Control, NGC = Next Generation Control
  wcsExt: false,        // czy sterownik obsługuje rozszerzone układy G154 P1-P99
  toolList: false,      // lista narzędzi jako komentarze w nagłówku
  probe: null           // { macro:'P9023', style:'easyset' } — sonda Renishaw
};

export function withDefaults(post) {
  const p = { ...DEFAULTS, ...post };
  p.seq = { ...DEFAULTS.seq, ...(post.seq || {}) };
  p.comment = { ...DEFAULTS.comment, ...(post.comment || {}) };
  p.prec = { ...DEFAULTS.prec, ...(post.prec || {}) };
  p.codes = { ...(post.codes || {}) };
  p.cycles = { ...(post.cycles || {}) };
  return p;
}

// ─── układy współrzędnych ───────────────────────────────────────────────────
/** Lista układów dostępnych dla postu: G54-G59 zawsze, G154 P1-P99 tylko na NGC. */
export function wcsOptions(post) {
  const p = withDefaults(post);
  const out = [];
  for (let i = 54; i <= 59; i++) out.push(['G' + i, 'G' + i]);
  if (p.wcsExt) for (let i = 1; i <= 99; i++) out.push(['G154P' + i, `G154 P${i}`]);
  return out;
}
/** Zapis układu w bloku G-kodu: 'G54' albo 'G154 P12'. */
export function wcsCode(wcs, post) {
  const p = withDefaults(post);
  const m = /^G154P(\d+)$/.exec(String(wcs || 'G54'));
  if (!m) return String(wcs || 'G54');
  if (!p.wcsExt) return 'G54';
  return p.spaces ? `G154 P${m[1]}` : `G154P${m[1]}`;
}
/**
 * Wartość parametru S/W dla makr sondy Renishaw (EasySet / WIPS):
 * G54 → 54., G154 P1 → 154.01 (format z dokumentacji Haas VPS).
 */
export function probeWcsValue(wcs) {
  const m = /^G154P(\d+)$/.exec(String(wcs || 'G54'));
  if (m) return '154.' + String(m[1]).padStart(2, '0');
  return String(wcs || 'G54').replace(/^G/, '') + '.';
}

export const CONTROLS = [
  { id: 'HCC', name: 'Haas Classic Control', short: 'HCC', note: 'Sterowniki Haas sprzed NGC (do ok. 2014). Układy G54–G59 + G110–G129.' },
  { id: 'NGC', name: 'Haas Next Generation', short: 'NGC', note: 'Sterowniki Haas od ok. 2014. Rozszerzone układy G154 P1–P99, 5-cyfrowe numery O, G187.' },
  { id: 'FANUC', name: 'Fanuc / inne', short: 'Fanuc', note: 'Warianty generyczne — sprawdź zgodność z dokumentacją swojej maszyny.' }
];

// ─── wbudowane posty ────────────────────────────────────────────────────────

/** Haas VF — Classic Control (nasz domyślny, czytelny, z komentarzami). */
const HAAS_VF_CLASSIC = {
  id: 'haas-vf-classic',
  name: 'Haas VF — Classic Control',
  machine: 'mill',
  control: 'HCC',
  probe: { macro: 'P9023', style: 'easyset' },
  note: 'Domyślny post CNC VPS. Spacje, komentarze opisowe, bez numeracji N.',
  builtin: true,
  codes: {
    rapid: 'G00', lin: 'G01', cw: 'G02', ccw: 'G03', plane: 'G17',
    abs: 'G90', inc: 'G91', metric: 'G21', feed: 'G94',
    compOff: 'G40', compL: 'G41', compR: 'G42', lenComp: 'G43', lenOff: 'G49',
    wcs: 'G54', spinCW: 'M03', spinOff: 'M05', toolChange: 'M06',
    coolOff: 'M09', optStop: 'M01', end: 'M30'
  },
  cycles: { drill: 'G81', dwell: 'G82', peck: 'G83', chip: 'G73', tap: 'G84', tapL: 'G74', bore: 'G85', boreOrient: 'G76', off: 'G80', ret: 'G99', retHigh: 'G98', rigid: '' },
  header: [
    '{START}',
    'O{PROG} ({HEAD})',
    '({TITLE})',
    '({STOCK})',
    '({GEN})',
    '',
    'G21 G17 G40 G49 G80 (MM / XY / BRAK KOMP.)',
    'G90 G94 (ABS / POSUW MM/MIN)',
    'G28 G91 Z0.',
    'G90'
  ],
  toolChange: [
    '(T{TT} {TOOLDESC})',
    'T{TT} M06',
    '{WCS} G00 X0. Y0.',
    'G43 H{TT} Z{SAFEZ} (KOMP. DLUGOSCI)',
    'S{S} M03'
  ],
  footer: [
    '(==== KONIEC PROGRAMU ====)',
    'M05',
    '{COOLOFF}',
    'G40 G49 G80',
    'G28 G91 Z0.',
    'G28 G91 X0. Y0.',
    'G90',
    'M30',
    '{END}'
  ]
};

/** Post odwzorowany z HaasMM_BARTv2.spm (VisualMill) — numeracja N0001, bez spacji, M29. */
const HAAS_MM_BART = {
  id: 'haas-mm-bart-v2',
  name: 'Haas MM — BART v2 (z VisualMill)',
  machine: 'mill',
  control: 'HCC',
  probe: { macro: 'P9023', style: 'easyset' },
  note: 'Odwzorowanie HaasMM_BARTv2.spm: N0001+1, bez spacji, G54 w zmianie narzędzia, M29 sztywne gwintowanie.',
  builtin: true,
  seq: { on: true, prefix: 'N', start: 1, inc: 1, digits: 4, comments: true },
  spaces: false,
  prec: { xyz: 3, feed: 0 },
  codes: {
    rapid: 'G0', lin: 'G1', cw: 'G02', ccw: 'G03', plane: 'G17',
    abs: 'G90', inc: 'G91', metric: 'G21', feed: 'G94',
    compOff: 'G40', compL: 'G41', compR: 'G42', lenComp: 'G43', lenOff: 'G49',
    wcs: 'G54', spinCW: 'M3', spinOff: 'M5', toolChange: 'M6',
    coolOff: 'M9', optStop: 'M01', end: 'M30'
  },
  cycles: { drill: 'G81', dwell: 'G82', peck: 'G83', chip: 'G73', tap: 'G84', tapL: 'G74', bore: 'G85', boreOrient: 'G76', off: 'G80', ret: 'G99', retHigh: 'G98', rigid: 'M29' },
  header: [
    '{START}',
    'O{PROG}',
    '({HEAD})',
    'G40G49G80'
  ],
  toolChange: [
    '(TOOL DIAMETER = {TOOLDIA} {TOOLDESC})',
    '{WCS}',
    'G21T{TT}M6',
    'S{S}M3',
    'G90G0X0.Y0.',
    'G43Z{SAFEZ}H{TT}'
  ],
  footer: ['M5', '{COOLOFF}', 'G40G49G80', 'G28G91Z0.', 'G90', 'M30', '{END}']
};

/** Fanuc 0i-M / generic mill — numeracja co 10, G43 H, G98/G99. */
const FANUC_MILL = {
  id: 'fanuc-mill',
  name: 'Fanuc 0i-M — generic',
  machine: 'mill',
  control: 'FANUC',
  note: 'Wariant Fanuc: numeracja N10+10, powrót G98 w cyklach, M30 na końcu.',
  builtin: true,
  seq: { on: true, prefix: 'N', start: 10, inc: 10, digits: 0, comments: false },
  codes: {
    rapid: 'G00', lin: 'G01', cw: 'G02', ccw: 'G03', plane: 'G17',
    abs: 'G90', inc: 'G91', metric: 'G21', feed: 'G94',
    compOff: 'G40', compL: 'G41', compR: 'G42', lenComp: 'G43', lenOff: 'G49',
    wcs: 'G54', spinCW: 'M03', spinOff: 'M05', toolChange: 'M06',
    coolOff: 'M09', optStop: 'M01', end: 'M30'
  },
  cycles: { drill: 'G81', dwell: 'G82', peck: 'G83', chip: 'G73', tap: 'G84', tapL: 'G74', bore: 'G85', boreOrient: 'G76', off: 'G80', ret: 'G98', retHigh: 'G98', rigid: 'M29' },
  header: [
    '{START}',
    'O{PROG} ({HEAD})',
    'G21 G17 G40 G49 G80',
    'G90 G94',
    'G91 G28 Z0.',
    'G90'
  ],
  toolChange: [
    '({TOOLDESC})',
    'T{TT} M06',
    '{WCS} G90 G00 X0. Y0. S{S} M03',
    'G43 H{TT} Z{SAFEZ}'
  ],
  footer: ['M05', '{COOLOFF}', 'G40 G49 G80', 'G91 G28 Z0.', 'G91 G28 X0. Y0.', 'G90', 'M30', '{END}']
};

/** Haas SL-20T — Classic Control (tokarka, G99, programowanie średnicowe). */
const HAAS_SL20T = {
  id: 'haas-sl20t-classic',
  name: 'Haas SL-20T — Classic Control',
  machine: 'lathe',
  control: 'HCC',
  note: 'Domyślny post CNC VPS dla tokarki: G18/G99, T0101, G50 limit obrotów.',
  builtin: true,
  codes: {
    rapid: 'G00', lin: 'G01', cw: 'G02', ccw: 'G03', plane: 'G18',
    abs: 'G90', metric: 'G21', feedRev: 'G99', feedMin: 'G98',
    compOff: 'G40', compL: 'G41', compR: 'G42', rpmLimit: 'G50',
    css: 'G96', rpmConst: 'G97', spinCW: 'M03', spinOff: 'M05',
    coolOff: 'M09', optStop: 'M01', end: 'M30'
  },
  cycles: { rough: 'G71', roughFace: 'G72', finish: 'G70', groove: 'G75', thread: 'G76', threadSimple: 'G92', peck: 'G83', chip: 'G74', off: 'G80' },
  toolFormat: 'TnnOO', // T0101
  header: [
    '{START}',
    'O{PROG} ({HEAD})',
    '({TITLE})',
    '({STOCK})',
    '({GEN})',
    '',
    'G21 G18 G40 G80 (MM / ZX / BRAK KOMP.)',
    'G99 (POSUW MM/OBR)',
    'G28 U0. W0.'
  ],
  toolChange: [
    '({TSTR} -- {TOOLDESC})',
    'G00 {TSTR}',
    'G50 S{MAXRPM} (MAX RPM)'
  ],
  footer: ['(==== KONIEC PROGRAMU ====)', 'M05', '{COOLOFF}', 'G28 U0. W0.', 'M30', '{END}']
};

/** Fanuc 0i-T / generic lathe. */
const FANUC_LATHE = {
  id: 'fanuc-lathe',
  name: 'Fanuc 0i-T — generic',
  machine: 'lathe',
  control: 'FANUC',
  note: 'Wariant Fanuc: numeracja N10+10, G50 limit, cykle G70-G76 jak Haas.',
  builtin: true,
  seq: { on: true, prefix: 'N', start: 10, inc: 10, digits: 0, comments: false },
  codes: { ...HAAS_SL20T.codes },
  cycles: { ...HAAS_SL20T.cycles },
  toolFormat: 'TnnOO',
  header: ['{START}', 'O{PROG} ({HEAD})', 'G21 G18 G40 G80', 'G99', 'G28 U0. W0.'],
  toolChange: ['({TOOLDESC})', 'G00 {TSTR}', 'G50 S{MAXRPM}'],
  footer: ['M05', '{COOLOFF}', 'G28 U0. W0.', 'M30', '{END}']
};


/** Haas VF/UMC — Next Generation Control. Rozszerzone układy G154, bezpieczna linia startu, G187. */
const HAAS_VF_NGC = {
  id: 'haas-vf-ngc',
  name: 'Haas VF — Next Generation Control',
  machine: 'mill',
  control: 'NGC',
  wcsExt: true,
  toolList: true,
  progDigits: 5,
  probe: { macro: 'P9023', style: 'easyset' },
  note: 'Sterownik NGC: bezpieczna linia startu, układy G154 P1-P99, G187 (gładkość), M29 przy gwintowaniu sztywnym, lista narzędzi w nagłówku.',
  builtin: true,
  codes: {
    rapid: 'G00', lin: 'G01', cw: 'G02', ccw: 'G03', plane: 'G17',
    abs: 'G90', inc: 'G91', metric: 'G21', feed: 'G94',
    compOff: 'G40', compL: 'G41', compR: 'G42', lenComp: 'G43', lenOff: 'G49',
    wcs: 'G54', spinCW: 'M03', spinOff: 'M05', toolChange: 'M06',
    coolOn: 'M08', coolMist: 'M07', coolThru: 'M88', coolOff: 'M09', optStop: 'M01', end: 'M30'
  },
  cycles: { drill: 'G81', dwell: 'G82', peck: 'G83', chip: 'G73', tap: 'G84', tapL: 'G74', bore: 'G85', boreOrient: 'G76', off: 'G80', ret: 'G99', retHigh: 'G98', rigid: 'M29' },
  header: [
    '{START}',
    'O{PROG} ({HEAD})',
    '({TITLE})',
    '({STOCK})',
    '({GEN})',
    '{TOOLLIST}',
    '',
    'G00 G17 G40 G49 G80 G90 G94 G98 (BEZPIECZNA LINIA STARTU)',
    'G21 (MM)',
    'G187 P3 (GLADKOSC: P1 SZORSTKO - P3 GLADKO)',
    'G53 G00 Z0. (POWROT Z W UKLADZIE MASZYNY)'
  ],
  toolChange: [
    '(T{TT} {TOOLDESC})',
    'T{TT} M06',
    '{WCS} G00 X0. Y0.',
    'G43 H{TT} Z{SAFEZ} (KOMP. DLUGOSCI)',
    'S{S} M03'
  ],
  footer: [
    '(==== KONIEC PROGRAMU ====)',
    'M05',
    '{COOLOFF}',
    'G40 G49 G80',
    'G53 G00 Z0.',
    'G53 G00 X0. Y0.',
    'M30',
    '{END}'
  ]
};

/** Haas ST — Next Generation Control (tokarka). */
const HAAS_ST_NGC = {
  id: 'haas-st-ngc',
  name: 'Haas ST — Next Generation Control',
  machine: 'lathe',
  control: 'NGC',
  wcsExt: true,
  toolList: true,
  progDigits: 5,
  note: 'Tokarka NGC: bezpieczna linia startu, G154 P1-P99, powrót G53, cykle jak w Classic.',
  builtin: true,
  codes: {
    rapid: 'G00', lin: 'G01', cw: 'G02', ccw: 'G03', plane: 'G18',
    abs: 'G90', metric: 'G21', feedRev: 'G99', feedMin: 'G98',
    compOff: 'G40', compL: 'G41', compR: 'G42', rpmLimit: 'G50',
    css: 'G96', rpmConst: 'G97', spinCW: 'M03', spinOff: 'M05',
    coolOff: 'M09', optStop: 'M01', end: 'M30'
  },
  cycles: { rough: 'G71', roughFace: 'G72', finish: 'G70', groove: 'G75', thread: 'G76', threadSimple: 'G92', peck: 'G83', chip: 'G74', off: 'G80' },
  toolFormat: 'TnnOO',
  header: [
    '{START}',
    'O{PROG} ({HEAD})',
    '({TITLE})',
    '({STOCK})',
    '({GEN})',
    '{TOOLLIST}',
    '',
    'G00 G18 G40 G80 G99 (BEZPIECZNA LINIA STARTU)',
    'G21 (MM)',
    'G53 G00 X0. Z0. (POWROT W UKLADZIE MASZYNY)'
  ],
  toolChange: [
    '({TSTR} -- {TOOLDESC})',
    'G00 {TSTR}',
    'G50 S{MAXRPM} (MAX RPM)'
  ],
  footer: ['(==== KONIEC PROGRAMU ====)', 'M05', '{COOLOFF}', 'G53 G00 X0. Z0.', 'M30', '{END}']
};

export const BUILTIN_POSTS = [HAAS_VF_CLASSIC, HAAS_VF_NGC, HAAS_MM_BART, FANUC_MILL, HAAS_SL20T, HAAS_ST_NGC, FANUC_LATHE];

export const DEFAULT_POST = { mill: 'haas-vf-classic', lathe: 'haas-sl20t-classic' };

/** Wszystkie posty dla maszyny (wbudowane + własne z pamięci). */
export function postsFor(machine, custom = []) {
  return [...BUILTIN_POSTS, ...custom].filter((p) => p.machine === machine);
}

export function getPost(id, machine, custom = []) {
  const all = [...BUILTIN_POSTS, ...custom];
  return all.find((p) => p.id === id && p.machine === machine) ||
    all.find((p) => p.id === DEFAULT_POST[machine]);
}

// ─── import .spm (VisualMill / VisualCAD-CAM) ───────────────────────────────
/**
 * Czyta plik .spm i buduje z niego post. Bierzemy to, co ma odpowiednik w naszym modelu:
 * numerację, znaki komentarza, precyzję, kody ruchu/wrzeciona/chłodziwa, kody cykli
 * oraz bloki startu, zmiany narzędzia i końca programu (z tłumaczeniem tokenów VisualMill).
 */
export function parseSpm(text, name) {
  const lines = String(text).split(/\r?\n/);
  const kv = {};
  const blocks = {};
  let blockName = null, buf = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*\/\//.test(line)) continue;
    if (blockName) {
      if (line.trim() === blockName.replace(/Start$/, 'End')) {
        blocks[blockName.replace(/Start$/, '')] = buf.filter((x) => x.trim() !== '');
        blockName = null; buf = [];
      } else buf.push(line);
      continue;
    }
    const mStart = /^([A-Za-z0-9_]+(?:BlockStart|CodeStart|MacroStart|Start))\s*$/.exec(line.trim());
    if (mStart) { blockName = mStart[1]; buf = []; continue; }
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) kv[m[1]] = m[2].trim();
  }
  if (!Object.keys(kv).length) throw new Error('To nie wygląda na plik .spm');

  const num = (k, d) => (kv[k] !== undefined && kv[k] !== '' ? parseFloat(kv[k]) : d);
  const on = (k) => num(k, 0) === 1;
  const code = (k, d) => (kv[k] || d);

  const isLathe = /turn|lathe|tokar/i.test(name || '') || !!kv.CYCLES_TurnCycleThreadAutomatic;
  const spaces = false; // bloki VisualMill są bez spacji

  const post = {
    id: 'spm-' + (name || 'post').replace(/\.spm$/i, '').replace(/[^\w-]+/g, '-').toLowerCase() + '-' + Math.random().toString(36).slice(2, 6),
    name: (name || 'Post .spm').replace(/\.spm$/i, '') + ' (.spm)',
    machine: isLathe ? 'lathe' : 'mill',
    note: 'Zaimportowany z VisualMill .spm' + (kv.INFORMATION_Version ? ', wersja ' + kv.INFORMATION_Version : ''),
    source: 'spm',
    spaces,
    trimZeros: !on('MOTION_ShowMotionTrailingZeros'),
    seq: {
      on: on('GENERAL_UseSequencNo'),
      prefix: code('GENERAL_PrefixLetter', 'N'),
      start: num('GENERAL_SequenceStartNo', 1),
      inc: num('GENERAL_Increment', 1),
      digits: on('GENERAL_ShowLeadingZeros') ? num('GENERAL_LeadingZerosNumOfDigit', 4) : 0,
      comments: num('GENERAL_CommentSequenceMode', 0) === 0
    },
    comment: { open: code('GENERAL_CommentStartChar', '('), close: code('GENERAL_CommentEndChar', ')'), upper: true },
    prec: { xyz: num('MOTION_NumOfDecimalPlaces', 3), feed: num('FEEDRATE_NumOfDecimalPlaces', 0) },
    codes: {
      rapid: code('MOTION_RapidMotionCode', 'G00'),
      lin: code('MOTION_LinearMotionCode', 'G01'),
      cw: code('CIRCLE_ClockwiseArcCode', 'G02'),
      ccw: code('CIRCLE_CClockwiseArcCode', 'G03'),
      plane: code(isLathe ? 'CIRCLE_ZXPlaneCode' : 'CIRCLE_XYPlaneCode', isLathe ? 'G18' : 'G17'),
      abs: code('GENERAL_AbsCode', 'G90'),
      inc: code('GENERAL_IncCode', 'G91'),
      metric: code('GENERAL_MetricCode', 'G21'),
      feed: 'G94',
      compOff: code('MISCELLANEOUS_CompensationOff', 'G40'),
      compL: code('MISCELLANEOUS_CompensationLeft', 'G41'),
      compR: code('MISCELLANEOUS_CompensationRight', 'G42'),
      lenComp: code('MISCELLANEOUS_CompensationLength', 'G43'),
      lenOff: 'G49',
      wcs: 'G54',
      spinCW: code('SPINDLE_ClockwiseRotationCode', 'M03'),
      spinCCW: code('SPINDLE_CClockwiseRotationCode', 'M04'),
      spinOff: code('SPINDLE_OffCode', 'M05'),
      toolChange: 'M06',
      coolOn: code('MISCELLANEOUS_CoolantFlood', 'M08'),
      coolMist: code('MISCELLANEOUS_CoolantMist', 'M07'),
      coolThru: code('MISCELLANEOUS_CoolantThru', 'M88'),
      coolOff: code('MISCELLANEOUS_CoolantOff', 'M09'),
      optStop: 'M01',
      end: 'M30'
    },
    cycles: {
      drill: code('CYCLES_DrillNoDwell', 'G81'),
      dwell: code('CYCLES_DrillDwell', 'G82'),
      peck: code('CYCLES_Deep', 'G83'),
      chip: code('CYCLES_BreakChip', 'G73'),
      tap: code('CYCLES_TapClockwise', 'G84'),
      tapL: code('CYCLES_TapCClockwise', 'G74'),
      bore: code('CYCLES_BoreDragNoDwell', 'G85'),
      boreOrient: code('CYCLES_BoreNoDragDwellOrient', 'G76'),
      off: code('CYCLES_CycleOff', 'G80'),
      ret: 'G99', retHigh: 'G98',
      rigid: /M29/.test((blocks.CYCLES_RigidTapClockwiseCode || []).join(' ')) ? 'M29' : ''
    },
    startChar: code('GENERAL_StartReadingChar', '%'),
    endChar: code('GENERAL_StopReadingChar', '%')
  };

  // bloki: tłumaczenie tokenów VisualMill na nasze
  const conv = (arr, extra = {}) => (arr || []).map((l) => l
    .replace(/\[SEQ_PRECHAR\]\[SEQNUM\]/g, '')
    .replace(/\[START_CHAR\]/g, '{START}')
    .replace(/\[STOP_CHAR\]/g, '{END}')
    .replace(/\[PARTNUM\]/g, '{PROG}')
    .replace(/\[TOOL_NUM\]/g, '{TT}')
    .replace(/\[TOOL_DIA\]/g, '{TOOLDIA}')
    .replace(/\[TOOL_LENGTH\]/g, '{TOOLLEN:0}')
    .replace(/\[SPINDLE_BLK\]/g, 'S{S}' + post.codes.spinCW)
    .replace(/\[SPINDLE_SPD\]/g, '{S}')
    .replace(/\[OUTPUT_UNITS_CODE\]/g, post.codes.metric)
    .replace(/\[OUTPUT_MODE_CODE\]/g, post.codes.abs)
    .replace(/\[G_CODE\]/g, post.codes.rapid)
    .replace(/\[NEXT_NONMDL_X\]/g, '0.').replace(/\[NEXT_NONMDL_Y\]/g, '0.')
    .replace(/\[NEXT_NONMDL_Z\]/g, '{SAFEZ}')
    .replace(/\[[A-Z_0-9]+\]/g, '')
    .trim()).filter((l) => l !== '' && !/^\(\s*\)$/.test(l));

  post.header = conv(blocks.STARTUP_ProgramCode);
  if (!post.header.length) post.header = ['{START}', 'O{PROG} ({HEAD})'];
  else if (!post.header.some((l) => /\{HEAD\}/.test(l))) post.header.splice(2, 0, '({HEAD})');
  post.toolChange = conv(blocks.TOOLCHANGE_FirstMacro);
  if (!post.toolChange.length) post.toolChange = ['({TOOLDESC})', 'T{TT} M06', 'S{S} M03'];
  post.footer = conv(blocks.END_ProgramCode);
  if (!post.footer.length) post.footer = ['M05', '{COOLOFF}', 'M30', '{END}'];
  return post;
}

/** Krótki opis postu do UI. */
export function postSummary(post) {
  const p = withDefaults(post);
  return [
    tr(p.machine === 'lathe' ? 'tokarka' : 'frezarka'),
    p.control === 'NGC' ? 'NGC' : p.control === 'HCC' ? 'Classic Control' : 'Fanuc',
    p.wcsExt ? 'G154 P1-P99' : 'G54-G59',
    p.seq.on ? tr('numeracja {n}', { n: `${p.seq.prefix}${p.seq.digits ? String(p.seq.start).padStart(p.seq.digits, '0') : p.seq.start}+${p.seq.inc}` }) : tr('bez numeracji'),
    tr(p.spaces ? 'ze spacjami' : 'bez spacji'),
    tr('{n} miejsc dziesiętnych', { n: p.prec.xyz }),
    p.cycles.rigid ? tr('sztywne gwintowanie {c}', { c: p.cycles.rigid }) : null
  ].filter(Boolean).join(' · ');
}
