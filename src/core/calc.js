// Czyste funkcje obliczeniowe — wspólne dla tokarki, frezarki i zakładki Kalkulatory.

/** n [obr/min] z Vc [m/min] i D [mm], z opcjonalnym limitem maszyny. */
export function rpm(vc, d, maxRpm = Infinity) {
  const n = (vc * 1000) / (Math.PI * Math.max(d, 0.5));
  return Math.min(Math.round(n), maxRpm);
}

/** Vc [m/min] z n i D. */
export function vc(n, d) {
  return (n * Math.PI * d) / 1000;
}

/** Posuw minutowy frezowania Vf = fz · z · n [mm/min]. */
export function vfMill(fz, z, n) {
  return fz * Math.max(1, z) * n;
}

/** Posuw minutowy toczenia Vf = f · n [mm/min]. */
export function vfTurn(f, n) {
  return f * n;
}

/** Wydajność objętościowa Q [cm³/min] dla frezowania. */
export function qMill(ap, ae, vf) {
  return (ap * ae * vf) / 1000;
}

/** Wydajność objętościowa Q [cm³/min] dla toczenia. */
export function qTurn(vcVal, ap, f) {
  return vcVal * ap * f; // m/min · mm · mm = cm³/min
}

/**
 * Moc skrawania wg Kienzle: Pc = Q · kc / 60000 [kW],
 * kc = kc1 / h^mc, h — grubość wióra (przybliżenie: fz·sin(κ) lub f·sin(κ)).
 */
export function cuttingPower(q, kc1, mc, h) {
  const hh = Math.max(h, 0.01);
  const kc = kc1 / Math.pow(hh, mc);
  return (q * kc) / 60000;
}

/** Moment na wrzecionie M = 9550 · P / n [Nm]. */
export function torque(pKw, n) {
  return n > 0 ? (9550 * pKw) / n : 0;
}

/** Czas skrawania [min] dla drogi L [mm] i Vf [mm/min]. */
export function cutTime(lengthMm, vf) {
  return vf > 0 ? lengthMm / vf : 0;
}

// ─── Gwinty ────────────────────────────────────────────────────────────────

/**
 * Gwint metryczny ISO: H = 0.866·P, wysokość profilu roboczego dla noża
 * (do G76 na Haas) hT ≈ 0.6134·P (zewnętrzny), d_minor = D − 2·hT.
 * Dla wewnętrznego: D_minor = D − 1.0825·P (średnica wiertła ≈ D − P).
 */
export function metricThread(d, p, internal = false) {
  const H = 0.866025 * p;
  const hT = internal ? 0.5413 * p : 0.6134 * p;
  const dMinor = internal ? d - 1.0825 * p : d - 2 * hT;
  const dPitch = d - 0.6495 * p;
  return {
    H, hT, dMinor, dPitch,
    drill: internal ? Math.round((d - p) * 100) / 100 : null,
    pUm: Math.round(hT * 1000),
    firstCutUm: Math.round(hT * 0.4 * 1000)
  };
}

/** Liczba przejść G76 wg głębokości (empiryczne: ~ sqrt) */
export function threadPasses(hT) {
  return Math.max(4, Math.min(16, Math.round(Math.sqrt(hT * 1000 / 12))));
}

// ─── Geometria ─────────────────────────────────────────────────────────────

/** Kąt stożka [°] (połówkowy) z różnicy średnic i długości. */
export function taperAngle(dBig, dSmall, len) {
  return (Math.atan((dBig - dSmall) / 2 / Math.max(len, 0.001)) * 180) / Math.PI;
}

/** Zbieżność stożka 1:k. */
export function taperRatio(dBig, dSmall, len) {
  const diff = Math.abs(dBig - dSmall);
  return diff > 0 ? len / diff : Infinity;
}

/** Trójkąt prostokątny: podaj 2 z {a, b, c, alpha} → reszta. */
export function rightTriangle({ a, b, c, alpha }) {
  const toR = (x) => (x * Math.PI) / 180, toD = (x) => (x * 180) / Math.PI;
  if (a && b) { c = Math.hypot(a, b); alpha = toD(Math.atan2(a, b)); }
  else if (a && c) { b = Math.sqrt(Math.max(0, c * c - a * a)); alpha = toD(Math.asin(a / c)); }
  else if (b && c) { a = Math.sqrt(Math.max(0, c * c - b * b)); alpha = toD(Math.acos(b / c)); }
  else if (a && alpha) { b = a / Math.tan(toR(alpha)); c = a / Math.sin(toR(alpha)); }
  else if (b && alpha) { a = b * Math.tan(toR(alpha)); c = b / Math.cos(toR(alpha)); }
  else if (c && alpha) { a = c * Math.sin(toR(alpha)); b = c * Math.cos(toR(alpha)); }
  return { a, b, c, alpha, beta: alpha !== undefined ? 90 - alpha : undefined };
}

/** Rozkład otworów na okręgu (PCD). */
export function boltCircle(cx, cy, pcd, n, startDeg = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push({ x: cx + (pcd / 2) * Math.cos(a), y: cy + (pcd / 2) * Math.sin(a) });
  }
  return pts;
}

/** Chropowatość teoretyczna Rt ≈ f² / (8·rε) ·1000 [µm] (toczenie). */
export function roughnessRt(f, rEps) {
  return rEps > 0 ? (f * f) / (8 * rEps) * 1000 : 0;
}

/** Posuw z żądanej chropowatości Ra (Ra ≈ Rt/4): f = sqrt(32·rε·Ra/1000). */
export function feedForRa(ra, rEps) {
  return Math.sqrt((32 * rEps * ra) / 1000);
}

export const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');

/** Komentarz dla sterownika Haas: wielkie litery, bez polskich znaków, bez zagnieżdżonych nawiasów. */
export function ascii(t) {
  return String(t).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ł/g, 'L').replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '');
}
