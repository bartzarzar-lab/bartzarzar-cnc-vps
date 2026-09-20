import { describe, it, expect } from 'vitest';
import { rpm, vc, vfMill, metricThread, taperAngle, cuttingPower } from '../src/core/calc.js';
import { isoTolerance, tapDrill } from '../src/core/tables.js';
import { generateLathe, defaultLatheTools, defaultLatheOp, expandProfile, latheModel } from '../src/core/lathe.js';
import { generateMill, defaultMillTools, defaultMillOp, holePoints } from '../src/core/mill.js';
import { parseGcode } from '../src/core/backplot.js';
import { BUILTIN_POSTS, getPost, parseSpm, tpl, finalize, withDefaults, wcsOptions, probeWcsValue } from '../src/core/posts.js';
import { readFileSync } from 'node:fs';

describe('calc', () => {
  it('rpm z Vc', () => {
    expect(rpm(300, 12)).toBe(7958);
    expect(rpm(300, 12, 4000)).toBe(4000);
  });
  it('vc z rpm', () => expect(vc(1000, 30)).toBeCloseTo(94.25, 1));
  it('vf frezowania', () => expect(vfMill(0.05, 3, 8000)).toBeCloseTo(1200));
  it('gwint M20x2.5', () => {
    const t = metricThread(20, 2.5);
    expect(t.dMinor).toBeCloseTo(16.933, 2);
    expect(t.pUm).toBe(1533);
  });
  it('gwint wewnętrzny — wiertło', () => expect(metricThread(10, 1.5, true).drill).toBe(8.5));
  it('stożek', () => expect(taperAngle(30, 20, 50)).toBeCloseTo(5.71, 2));
  it('moc skrawania', () => expect(cuttingPower(19.2, 1800, 0.24, 0.05)).toBeGreaterThan(0.5));
});

describe('tabele', () => {
  it('H7 dla 25', () => {
    const t = isoTolerance(25, 'H7');
    expect(t.lower).toBe(0);
    expect(t.upper).toBeCloseTo(0.021, 3);
  });
  it('g6 dla 25', () => {
    const t = isoTolerance(25, 'g6');
    expect(t.upper).toBeCloseTo(-0.007, 3);
    expect(t.lower).toBeCloseTo(-0.020, 3);
  });
  it('wiertło pod M8', () => expect(tapDrill(8, 1.25)).toBe(6.75));
});

function latheState(ops = []) {
  const s = { machine: 'lathe', prog: '1001', stock: { d: 30, l: 80, dmin: 20 }, material: 'S235', maxRpm: 4000, coolant: 'M08', ops: [] };
  s.tools = defaultLatheTools('S235');
  ops.forEach((t, i) => s.ops.push({ id: i + 1, ...defaultLatheOp(t, s) }));
  return s;
}
function millState(ops = []) {
  const s = { machine: 'mill', prog: '2001', stock: { x: 100, y: 80, z: 20 }, material: 'AL', maxRpm: 8100, coolant: 'M08', safeZ: 50, base: 6, ops: [] };
  s.tools = defaultMillTools('AL');
  ops.forEach((t, i) => s.ops.push({ id: i + 1, ...defaultMillOp(t, s) }));
  return s;
}

describe('tokarka', () => {
  it('profil z fazą i promieniem rozwija się na segmenty', () => {
    const segs = expandProfile([{ x: 20, z: 0, c: 1 }, { x: 20, z: -30, r: 2 }, { x: 30, z: -30 }, { x: 30, z: -50 }]);
    expect(segs[0].chamfer).toBe(true);
    expect(segs.find((s) => s.type === 'arc')).toBeTruthy();
    expect(segs.find((s) => s.type === 'arc').dir).toBe(2); // wklęsłe naroże na uskoku = G02
  });
  it('generuje G71 + G70 + G76 i zamyka M30', () => {
    const st = latheState(['face', 'rough', 'finish', 'thread', 'cutoff']);
    st.ops[3].pitch = 2.5;
    const r = generateLathe(st);
    const txt = r.lines.join('\n');
    expect(txt).toMatch(/G71 P100 Q110/);
    expect(txt).toMatch(/G70 P100 Q110/);
    expect(txt).toMatch(/G76 X16\.933/);
    expect(txt).toMatch(/G97 S\d+ M03/);
    expect(r.lines.at(-1)).toBe('%');
    expect(r.lines.at(-2)).toBe('M30');
    expect(r.time.total).toBeGreaterThan(0);
  });
  it('G70 bez G71 daje ostrzeżenie', () => {
    const r = generateLathe(latheState(['finish']));
    expect(r.warnings.length).toBe(1);
  });
  it('model detalu zdejmuje materiał', () => {
    const st = latheState(['rough']);
    const m = latheModel(st);
    expect(m.ro[0]).toBeLessThan(15); // czoło → dmin/2 = 10
    expect(m.ro[m.ro.length - 1]).toBe(15);
  });
  it('backplot tokarki widzi profil i gwint', () => {
    const st = latheState(['rough', 'finish', 'thread']);
    const r = generateLathe(st);
    const bp = parseGcode(r.lines, 'lathe');
    expect(bp.segs.some((s) => s.finish)).toBe(true);
    expect(bp.marks.some((m) => m.type === 'thread')).toBe(true);
  });
});

describe('frezarka', () => {
  it('generuje wszystkie typy operacji bez błędu', () => {
    const st = millState(['face', 'prof', 'circ', 'pock', 'cpock', 'slot', 'drill', 'tap', 'bore', 'chamfer']);
    const r = generateMill(st);
    const txt = r.lines.join('\n');
    expect(txt).toMatch(/T01 M06/);
    expect(txt).toMatch(/G41 D02/);
    expect(txt).toMatch(/G83 Z-15\.000 Q4\.000 R2\.000/);
    expect(txt).toMatch(/G84 Z-12\.000 R5\.000 F\d+/);
    expect(r.lines.at(-1)).toBe('%');
    expect(r.lines.at(-2)).toBe('M30');
    expect(r.time.toolChanges).toBeGreaterThan(3);
  });
  it('siatka otworów i PCD', () => {
    expect(holePoints({ pattern: 'grid', nx: 3, ny: 2, x1: 0, y1: 0, dx: 20, dy: 10 }).length).toBe(6);
    const pcd = holePoints({ pattern: 'pcd', cx: 0, cy: 0, pcd: 40, n: 4, start: 0 });
    expect(pcd[0].x).toBeCloseTo(20);
    expect(pcd[1].y).toBeCloseTo(20);
  });
  it('backplot frezarki: łuki i cykle', () => {
    const st = millState(['circ', 'drill']);
    const r = generateMill(st);
    const bp = parseGcode(r.lines, 'mill');
    expect(bp.segs.some((s) => s.type === 'arc')).toBe(true);
    expect(bp.marks.filter((m) => m.type === 'drill').length).toBe(4);
  });
  it('ostrzega o kieszeni węższej niż frez', () => {
    const st = millState(['pock']);
    st.ops[0].x2 = st.ops[0].x1 + 5;
    expect(generateMill(st).warnings.some((w) => /węższa/.test(w))).toBe(true);
  });
});

describe('post-procesory', () => {
  it('wbudowane posty mają komplet pól', () => {
    for (const p of BUILTIN_POSTS) {
      expect(p.id && p.name && p.machine).toBeTruthy();
      expect(p.header.length).toBeGreaterThan(1);
      expect(p.toolChange.length).toBeGreaterThan(1);
      expect(p.footer.join(' ')).toMatch(/M30/);
    }
  });
  it('tpl podstawia tokeny i usuwa puste linie', () => {
    const out = tpl(['O{PROG} ({HEAD})', '({TITLE})', 'G{X:54}'], { PROG: '1001', HEAD: 'TEST', TITLE: '' });
    expect(out).toEqual(['O1001 (TEST)', 'G54']);
  });
  it('finalize numeruje bloki i pomija komentarze, %, O i etykiety N', () => {
    const post = { seq: { on: true, prefix: 'N', start: 1, inc: 1, digits: 4, comments: false } };
    const out = finalize(['%', 'O1001', '(KOMENTARZ)', 'G00 X10.', 'N100 G00 X5.', 'G01 Z-2.'], post);
    expect(out).toEqual(['%', 'O1001', '(KOMENTARZ)', 'N0001 G00 X10.000', 'N100 G00 X5.000', 'N0002 G01 Z-2.000']);
  });
  it('post bez spacji sklejał bloki, ale nie komentarze', () => {
    const out = finalize(['G00 X10. Y2. (OPIS Z SPACJA)'], { spaces: false });
    expect(out[0]).toBe('G00X10.000Y2.000(OPIS Z SPACJA)');
  });
  it('zmiana postu zmienia G-kod frezarki', () => {
    const st = millState(['drill', 'tap']);
    const a = generateMill(st, getPost('haas-vf-classic', 'mill')).lines.join('\n');
    const b = generateMill(st, getPost('haas-mm-bart-v2', 'mill')).lines.join('\n');
    expect(a).not.toBe(b);
    expect(a).toMatch(/T\d\d M06/);
    expect(b).toMatch(/N0\d{3}G21T\d\dM6/);
    expect(b).toMatch(/M29/);            // sztywne gwintowanie tylko w poście BART
    expect(a).not.toMatch(/M29/);
  });
  it('post tokarki steruje cyklami', () => {
    const st = latheState(['rough', 'finish']);
    const r = generateLathe(st, getPost('fanuc-lathe', 'lathe'));
    expect(r.lines.join('\n')).toMatch(/N\d+ G71 P100 Q110/);
  });
  it('import .spm czyta numerację, cykle i bloki', () => {
    const spm = readFileSync('tests/fixtures/HaasMM_BARTv2.spm', 'utf8');
    const post = parseSpm(spm, 'HaasMM_BARTv2.spm');
    expect(post.machine).toBe('mill');
    expect(post.seq).toMatchObject({ on: true, prefix: 'N', start: 1, inc: 1, digits: 4 });
    expect(post.spaces).toBe(false);
    expect(post.cycles.peck).toBe('G83');
    expect(post.cycles.rigid).toBe('M29');
    expect(post.header.join(' ')).toMatch(/O\{PROG\}/);
    expect(post.toolChange.join(' ')).toMatch(/T\{TT\}M6/);
    expect(post.footer.join(' ')).toMatch(/M30/);
    const out = generateMill(millState(['drill']), post).lines.join('\n');
    expect(out).toMatch(/N0001/);
  });
  it('odrzuca plik, który nie jest .spm', () => {
    expect(() => parseSpm('to nie jest post', 'x.spm')).toThrow();
  });
});

describe('sterowanie HCC / NGC', () => {
  it('posty mają przypisane sterowanie, NGC ma rozszerzone układy', () => {
    const ngc = getPost('haas-vf-ngc', 'mill');
    const hcc = getPost('haas-vf-classic', 'mill');
    expect(ngc.control).toBe('NGC');
    expect(hcc.control).toBe('HCC');
    expect(withDefaults(ngc).wcsExt).toBe(true);
    expect(withDefaults(hcc).wcsExt).toBe(false);
  });
  it('G154 działa tylko na NGC, na Classic wraca do G54 z ostrzeżeniem', () => {
    const st = millState(['face']);
    st.wcs = 'G154P7';
    const ngc = generateMill(st, getPost('haas-vf-ngc', 'mill'));
    expect(ngc.lines.join('\n')).toMatch(/G154 P7 G00 X0\.000 Y0\.000/);
    expect(ngc.warnings.length).toBe(0);
    const hcc = generateMill(st, getPost('haas-vf-classic', 'mill'));
    expect(hcc.lines.join('\n')).toMatch(/G54 G00/);
    expect(hcc.warnings.some((w) => /NGC/.test(w))).toBe(true);
  });
  it('lista układów: 6 dla Classic, 105 dla NGC', () => {
    expect(wcsOptions(getPost('haas-vf-classic', 'mill')).length).toBe(6);
    expect(wcsOptions(getPost('haas-vf-ngc', 'mill')).length).toBe(105);
  });
  it('post NGC wypisuje listę narzędzi w nagłówku', () => {
    const out = generateMill(millState(['face', 'drill']), getPost('haas-vf-ngc', 'mill')).lines.join('\n');
    expect(out).toMatch(/LISTA NARZEDZI/);
    expect(out).toMatch(/\(T01 D50 .* S\d+ F\d+/);
  });
});

describe('pomiar sondą', () => {
  function probeState(type, wcs = 'G54') {
    const s = millState([]);
    s.wcs = wcs;
    s.ops.push({ id: 1, ...defaultMillOp(type, s) });
    return s;
  }
  it('otwór: G65 P9023 A1 ze średnicą i zapisem do układu', () => {
    const out = generateMill(probeState('pbore'), getPost('haas-vf-classic', 'mill')).lines.join('\n');
    expect(out).toMatch(/G65 P9023 A1\. D20\.000 S54\./);
    expect(out).toMatch(/SEKCJA POMIAROWA/);
  });
  it('na NGC z G154 P3 wynik zapisuje się jako S154.03', () => {
    const out = generateMill(probeState('pbore', 'G154P3'), getPost('haas-vf-ngc', 'mill')).lines.join('\n');
    expect(out).toMatch(/G65 P9023 A1\. D20\.000 S154\.03/);
  });
  it('naroże używa A17 z X, Y i Z', () => {
    const out = generateMill(probeState('pcorner'), getPost('haas-vf-classic', 'mill')).lines.join('\n');
    expect(out).toMatch(/G65 P9023 A17\. X10\.000 Y10\.000 Z-5\.000 S54\./);
  });
  it('powierzchnia Z: A9 bez geometrii', () => {
    const out = generateMill(probeState('psurfz'), getPost('haas-vf-classic', 'mill')).lines.join('\n');
    expect(out).toMatch(/G65 P9023 A9\. S54\./);
  });
  it('wyłączony zapis wyniku usuwa S i ostrzega', () => {
    const st = probeState('pbore');
    st.ops[0].update = false;
    const r = generateMill(st, getPost('haas-vf-classic', 'mill'));
    expect(r.lines.join('\n')).toMatch(/G65 P9023 A1\. D20\.000$/m);
    expect(r.warnings.some((w) => /NIE jest zapisywany/.test(w))).toBe(true);
  });
  it('komentarze pomiarowe nie mają zagnieżdżonych nawiasów', () => {
    const out = generateMill(probeState('pbore'), getPost('haas-vf-classic', 'mill')).lines;
    for (const l of out) {
      const opens = (l.match(/\(/g) || []).length, closes = (l.match(/\)/g) || []).length;
      expect(opens).toBe(closes);
      expect(l).not.toMatch(/\([^)]*\(/);
    }
  });
  it('sonda dostaje własną zmianę narzędzia i korektor długości', () => {
    const out = generateMill(probeState('pbore'), getPost('haas-vf-classic', 'mill')).lines.join('\n');
    expect(out).toMatch(/T20 M06/);
    expect(out).toMatch(/G43 H20/);
  });
});
