// Zbiera klucze tłumaczeń z danych i generatorów (uruchamiane ręcznie: npx vitest run scripts/).
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as I from '../../src/i18n/index.js';
import { MATERIALS } from '../../src/core/materials.js';
import { LATHE_OPS, LATHE_TOOL_TYPES, generateLathe, defaultLatheTools, defaultLatheOp } from '../../src/core/lathe.js';
import { MILL_OPS, MILL_TOOL_TYPES, BASES, generateMill, defaultMillTools, defaultMillOp } from '../../src/core/mill.js';
import { TAPERS, RA_GUIDE } from '../../src/core/tables.js';
import { BUILTIN_POSTS, CONTROLS, postSummary } from '../../src/core/posts.js';

it('zbieranie kluczy tłumaczeń z danych i generatorów', () => {
  const keys = new Set();
  const add = (s) => s && /[a-ząćęłńóśźż]{2}/.test(s) && keys.add(s);
  Object.values(MATERIALS).forEach((m) => add(m.name));
  Object.values(LATHE_OPS).forEach((o) => { add(o.label); add(o.full); });
  Object.values(MILL_OPS).forEach((o) => { add(o.label); add(o.full); });
  LATHE_TOOL_TYPES.forEach(add); MILL_TOOL_TYPES.forEach(add);
  BASES.forEach((b) => add(b.t));
  TAPERS.forEach((t) => add(t.name)); RA_GUIDE.forEach((g) => add(g.desc));
  CONTROLS.forEach((c) => add(c.note));
  BUILTIN_POSTS.forEach((p) => add(p.note));
  // generatory
  I.setLang('en'); I.setCommentLang('en');
  I.trackMissing(true);
  BUILTIN_POSTS.forEach((p) => postSummary(p));
  for (const post of BUILTIN_POSTS) {
    if (post.machine === 'lathe') {
      const s = { prog: '1', title: 'X', stock: { d: 30, l: 80, dmin: 20 }, material: 'S235', maxRpm: 4000, coolant: 'M08', tailstock: true, wcs: 'G154P2', ops: [] };
      s.tools = defaultLatheTools('S235');
      Object.keys(LATHE_OPS).forEach((t, i) => s.ops.push({ id: i + 1, ...defaultLatheOp(t, s) }));
      s.ops.push({ id: 99, ...defaultLatheOp('finish', s) });
      s.ops.find((o) => o.type === 'thread').internal = true;
      s.ops.find((o) => o.type === 'bore').dpre = 50;
      s.ops.find((o) => o.type === 'thread').pitch = 6;
      generateLathe(s, post);
      const s2 = { ...s, ops: [{ id: 1, ...defaultLatheOp('finish', s) }] }; generateLathe(s2, post);
    } else {
      const s = { prog: '2', title: 'X', stock: { x: 100, y: 80, z: 20 }, material: 'AL', maxRpm: 8100, coolant: 'M08', safeZ: 50, base: 6, wcs: 'G154P2', ops: [] };
      s.tools = defaultMillTools('AL');
      Object.keys(MILL_OPS).forEach((t, i) => s.ops.push({ id: i + 1, ...defaultMillOp(t, s) }));
      s.ops.forEach((o) => { if (o.type === 'pock') o.x2 = o.x1 + 5; if (o.type === 'cpock') o.d = 2; if (o.type === 'drill') o.zt = -40; if (o.type === 'pbore') { o.update = false; o.d = 0; } if (o.type === 'ppockx') o.x = 0; if (o.type === 'ppocky') o.y = 0; });
      s.ops.push({ id: 90, type: 'face', tool: 25, ap: 1, ae: .7, zt: 0, x1: 0, y1: 0, x2: 10, y2: 10 });
      s.ops.push({ id: 91, type: 'pock', tool: 2, ap: 30, zt: -30, x1: 0, y1: 0, x2: 30, y2: 30, step: .5, entry: 'ramp' });
      generateMill(s, post);
      generateMill({ ...s, ops: s.ops.filter((o) => /^p(b|s)/.test(o.type)) }, { ...post, probe: null });
    }
  }
  I.missingKeys().forEach((k) => keys.add(k));
  if (process.env.I18N_OUT) writeFileSync(process.env.I18N_OUT, JSON.stringify([...keys].sort(), null, 1));
  console.log('core keys:', keys.size);
});
