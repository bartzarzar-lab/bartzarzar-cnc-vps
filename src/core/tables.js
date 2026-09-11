// Tabele referencyjne.

/** Gwinty metryczne ISO — skok zwykły i drobnozwojne, wiertło pod gwint. */
export const METRIC_THREADS = [
  { d: 3, p: 0.5, fine: [] },
  { d: 4, p: 0.7, fine: [0.5] },
  { d: 5, p: 0.8, fine: [0.5] },
  { d: 6, p: 1.0, fine: [0.75] },
  { d: 8, p: 1.25, fine: [1.0, 0.75] },
  { d: 10, p: 1.5, fine: [1.25, 1.0] },
  { d: 12, p: 1.75, fine: [1.5, 1.25] },
  { d: 14, p: 2.0, fine: [1.5] },
  { d: 16, p: 2.0, fine: [1.5] },
  { d: 18, p: 2.5, fine: [2.0, 1.5] },
  { d: 20, p: 2.5, fine: [2.0, 1.5] },
  { d: 22, p: 2.5, fine: [2.0, 1.5] },
  { d: 24, p: 3.0, fine: [2.0, 1.5] },
  { d: 27, p: 3.0, fine: [2.0, 1.5] },
  { d: 30, p: 3.5, fine: [2.0, 1.5] },
  { d: 33, p: 3.5, fine: [2.0, 1.5] },
  { d: 36, p: 4.0, fine: [3.0, 2.0] },
  { d: 39, p: 4.0, fine: [3.0, 2.0] },
  { d: 42, p: 4.5, fine: [3.0, 2.0] },
  { d: 48, p: 5.0, fine: [3.0, 2.0] },
  { d: 56, p: 5.5, fine: [4.0, 2.0] },
  { d: 64, p: 6.0, fine: [4.0, 2.0] }
];

export function tapDrill(d, p) {
  return Math.round((d - p) * 100) / 100;
}

/** Tolerancje ISO 286 — odchyłki [µm] dla przedziałów średnic (mm). */
export const ISO_RANGES = [
  [1, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80], [80, 120], [120, 180], [180, 250]
];
export const IT_GRADES = {
  IT5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20],
  IT6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29],
  IT7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46],
  IT8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72],
  IT9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115],
  IT10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185],
  IT11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290]
};
// Odchyłki podstawowe [µm] (dla otworów H = 0, dla wałków: es lub ei)
const FUND_DEV = {
  // wałki: górna odchyłka es (ujemna) dla d..h, dolna ei (dodatnia) dla k..z
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50],
  s: [14, 19, 23, 28, 35, 43, 53, 71, 92, 122],
  // otwory
  H: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  G: [2, 4, 5, 6, 7, 9, 10, 12, 14, 15],
  F: [6, 10, 13, 16, 20, 25, 30, 36, 43, 50],
  E: [14, 20, 25, 32, 40, 50, 60, 72, 85, 100],
  D: [20, 30, 40, 50, 65, 80, 100, 120, 145, 170],
  JS: null, js: null
};

/**
 * Zwraca {upper, lower} [mm] dla wymiaru d i pasowania np. "H7", "g6", "js9".
 */
export function isoTolerance(d, fit) {
  const m = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(fit.trim());
  if (!m) return null;
  const letter = m[1], grade = 'IT' + m[2];
  const it = IT_GRADES[grade];
  if (!it) return null;
  let idx = ISO_RANGES.findIndex(([a, b]) => d > a && d <= b);
  if (idx < 0) idx = d <= 1 ? 0 : ISO_RANGES.length - 1;
  const T = it[idx];
  if (letter.toLowerCase() === 'js') return { upper: T / 2000, lower: -T / 2000, T };
  const dev = FUND_DEV[letter];
  if (!dev) return null;
  const isHole = letter === letter.toUpperCase();
  const base = dev[idx];
  if (isHole) {
    // H, G, F, E, D: dolna odchyłka EI = base, górna = EI + T
    return { upper: (base + T) / 1000, lower: base / 1000, T };
  }
  if (base <= 0 && 'defgh'.includes(letter)) {
    return { upper: base / 1000, lower: (base - T) / 1000, T }; // es = base
  }
  return { upper: (base + T) / 1000, lower: base / 1000, T }; // ei = base
}

/** Stożki Morse'a i inne znormalizowane. */
export const TAPERS = [
  { name: 'Morse 1', ratio: '1:20.047', angle: 1.4287, dBig: 12.065 },
  { name: 'Morse 2', ratio: '1:20.020', angle: 1.4307, dBig: 17.780 },
  { name: 'Morse 3', ratio: '1:19.922', angle: 1.4377, dBig: 23.825 },
  { name: 'Morse 4', ratio: '1:19.254', angle: 1.4876, dBig: 31.267 },
  { name: 'Morse 5', ratio: '1:19.002', angle: 1.5073, dBig: 44.399 },
  { name: 'Metryczny 1:20', ratio: '1:20', angle: 1.4321 },
  { name: 'Metryczny 1:10', ratio: '1:10', angle: 2.8624 },
  { name: 'Metryczny 1:5', ratio: '1:5', angle: 5.7106 },
  { name: 'ISO 7/24 (SK/BT)', ratio: '7:24', angle: 8.2972 },
  { name: 'Jarno', ratio: '1:20', angle: 1.4321 },
  { name: '30° (60° zawarty)', ratio: '—', angle: 30 },
  { name: '45°', ratio: '—', angle: 45 }
];

/** Chropowatość — orientacja Ra vs proces. */
export const RA_GUIDE = [
  { ra: 0.4, desc: 'Szlifowanie / wykańczające toczenie diamentem' },
  { ra: 0.8, desc: 'Toczenie wykańczające, wytaczanie precyzyjne' },
  { ra: 1.6, desc: 'Toczenie / frezowanie wykańczające' },
  { ra: 3.2, desc: 'Toczenie / frezowanie półwykańczające' },
  { ra: 6.3, desc: 'Obróbka zgrubna, wiercenie' },
  { ra: 12.5, desc: 'Zgrubne, cięcie' }
];
