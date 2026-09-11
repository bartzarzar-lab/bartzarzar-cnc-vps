import { describe, it, expect } from 'vitest';
import { rpm, vc, vfMill, metricThread, taperAngle, cuttingPower } from '../src/core/calc.js';
import { isoTolerance, tapDrill } from '../src/core/tables.js';
import { generateLathe, defaultLatheTools, defaultLatheOp, expandProfile, latheModel } from '../src/core/lathe.js';
import { generateMill, defaultMillTools, defaultMillOp, holePoints } from '../src/core/mill.js';
import { parseGcode } from '../src/core/backplot.js';

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
    expect(txt).toMatch(/G83 Z-15\.000 Q4\.000/);
    expect(txt).toMatch(/G84 Z-12\.000 R5\. F\d+/);
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
