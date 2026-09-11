// Backplot: parser G-kodu (Haas) → segmenty do narysowania.
// Obsługuje G00/G01/G02/G03 (I/J/K lub R), G90/G91, cykle G81/G83/G84/G85 (znaczniki),
// tokarkowe G71/G70 (profil N..N), G75, G76 (znacznik gwintu), G74/G83 (wiercenie osiowe).
// mode: 'mill' (XY[Z]) | 'lathe' (ZX, X średnicowo).

export function parseGcode(text, mode = 'mill') {
  const lines = Array.isArray(text) ? text : String(text).split('\n');
  const segs = [], marks = [];
  let pos = mode === 'mill' ? { x: 0, y: 0, z: 50 } : { x: 0, y: 0, z: 5 };
  let abs = true, motion = 0, cycle = null, cycleR = 2, cycleZ = -10;
  const lathe = mode === 'lathe';
  const profiles = {}; // N-start → indeks segmentów (dla G70)
  let profileCapture = null;

  const wordRe = /([A-Z])\s*(-?\d*\.?\d+)/g;
  for (let ln = 0; ln < lines.length; ln++) {
    let raw = lines[ln].replace(/\(.*?\)/g, '').trim();
    if (!raw || raw.startsWith('%') || raw.startsWith('O')) continue;
    const w = {};
    const gs = [];
    let m;
    wordRe.lastIndex = 0;
    while ((m = wordRe.exec(raw.toUpperCase()))) {
      const k = m[1], v = parseFloat(m[2]);
      if (k === 'G') gs.push(v); else if (!(k in w)) w[k] = v;
    }
    for (const g of gs) {
      if (g === 90) abs = true; else if (g === 91) abs = false;
      else if (g === 0 || g === 1 || g === 2 || g === 3) motion = g;
      else if (g === 28) { motion = -1; }
      else if ([81, 82, 83, 84, 85, 86, 89].includes(g)) cycle = g;
      else if (g === 80) cycle = null;
      else if (g === 76 && lathe && 'X' in w && 'Z' in w) { marks.push({ type: 'thread', x: w.X, z1: pos.z, z2: w.Z }); }
      else if (g === 75 && lathe && 'X' in w) { marks.push({ type: 'groove', x: w.X, z1: pos.z, z2: 'Z' in w ? w.Z : pos.z }); }
      else if ((g === 74 || g === 83) && lathe && 'Z' in w) { marks.push({ type: 'drill', z1: pos.z, z2: w.Z, x: 0 }); segs.push({ type: 'feed', x1: pos.x, y1: 0, z1: pos.z, x2: 0, y2: 0, z2: w.Z, cycle: true }); }
      else if (g === 70 && lathe && 'P' in w) { const pr = profiles[w.P]; if (pr) for (const s of pr) segs.push({ ...s, finish: true }); }
      else if (g === 71 && lathe && 'P' in w) { profileCapture = { start: w.P, end: w.Q, list: [] }; profiles[w.P] = profileCapture.list; }
    }
    if (lathe && (gs.includes(76) || gs.includes(75) || gs.includes(74) || (gs.includes(83)))) continue;
    if (lathe && gs.includes(71)) continue;
    if (motion === -1) { motion = 0; continue; }

    const hasAxis = 'X' in w || 'Y' in w || 'Z' in w || 'U' in w || 'W' in w;
    if (!hasAxis) continue;
    const nx = 'X' in w ? (abs ? w.X : pos.x + w.X) : 'U' in w ? pos.x + w.U : pos.x;
    const ny = 'Y' in w ? (abs ? w.Y : pos.y + w.Y) : pos.y;
    const nz = 'Z' in w ? (abs ? w.Z : pos.z + w.Z) : 'W' in w ? pos.z + w.W : pos.z;

    if (cycle && !lathe) {
      cycleR = 'R' in w ? w.R : cycleR; cycleZ = 'Z' in w ? w.Z : cycleZ;
      marks.push({ type: cycle === 84 ? 'tap' : cycle === 85 || cycle === 86 || cycle === 89 ? 'bore' : 'drill', x: nx, y: ny, z: cycleZ, cycle });
      segs.push({ type: 'rapid', x1: pos.x, y1: pos.y, z1: pos.z, x2: nx, y2: ny, z2: pos.z });
      pos = { x: nx, y: ny, z: pos.z };
      continue;
    }
    let seg;
    if (motion === 2 || motion === 3) {
      seg = { type: 'arc', dir: motion, x1: pos.x, y1: pos.y, z1: pos.z, x2: nx, y2: ny, z2: nz };
      if ('R' in w) seg.r = w.R;
      else if (lathe) { seg.i = w.I || 0; seg.k = w.K || 0; }
      else { seg.i = w.I || 0; seg.j = w.J || 0; }
      seg.line = ln;
    } else {
      seg = { type: motion === 0 ? 'rapid' : 'feed', x1: pos.x, y1: pos.y, z1: pos.z, x2: nx, y2: ny, z2: nz, line: ln };
    }
    segs.push(seg);
    if (profileCapture) {
      if ('N' in w && w.N === profileCapture.start) profileCapture.list.length = 0;
      profileCapture.list.push(seg);
      if ('N' in w && w.N === profileCapture.end) profileCapture = null;
    }
    pos = { x: nx, y: ny, z: nz };
  }
  return { segs, marks };
}

/** Długość drogi i zgrubny czas (do porównania z generatorem). */
export function pathStats(segs) {
  let rapid = 0, feed = 0;
  for (const s of segs) {
    const d = s.type === 'arc' && s.r ? Math.PI * s.r : Math.hypot(s.x2 - s.x1, s.y2 - s.y1, s.z2 - s.z1);
    if (s.type === 'rapid') rapid += d; else feed += d;
  }
  return { rapid, feed };
}
