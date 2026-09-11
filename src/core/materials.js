// Wspólna baza materiałów dla tokarki i frezarki.
// Wartości orientacyjne (węglik, chłodzenie emulsją) — użytkownik może je nadpisać
// we własnych materiałach (storage.js → customMaterials).
//
// turn: vc [m/min] czoło / zgrubne / wykończ. / rowek / gwint / wiercenie,
//       f [mm/obr] zgrubne / wykończ. / rowek / wiercenie, ap [mm]
// mill: vc frezowanie, fz [mm/ząb], ap, ae (ułamek D), vcD wiercenie, fzD [mm/obr], vcT gwintowanie
// kc1: właściwa siła skrawania [N/mm²] przy h=1mm, mc: wykładnik Kienzle
export const MATERIALS = {
  S235: {
    name: 'S235 / S355 stal konstrukcyjna', group: 'P',
    turn: { vc_f: 280, vc_r: 250, vc_fn: 350, vc_gr: 150, vc_th: 160, vc_dr: 140, f_r: 0.3, f_fn: 0.12, f_gr: 0.08, f_dr: 0.1, ap: 2.5 },
    mill: { vc: 180, fz: 0.05, ap: 2, ae: 0.5, vcD: 35, fzD: 0.1, vcT: 12 },
    kc1: 1800, mc: 0.24,
    vcRange: [120, 400]
  },
  C45: {
    name: 'C45 stal do ulepszania', group: 'P',
    turn: { vc_f: 240, vc_r: 200, vc_fn: 300, vc_gr: 130, vc_th: 140, vc_dr: 110, f_r: 0.3, f_fn: 0.12, f_gr: 0.07, f_dr: 0.1, ap: 2.5 },
    mill: { vc: 150, fz: 0.05, ap: 2, ae: 0.5, vcD: 30, fzD: 0.1, vcT: 10 },
    kc1: 2100, mc: 0.25,
    vcRange: [100, 350]
  },
  INOX: {
    name: 'INOX 304 / 316', group: 'M',
    turn: { vc_f: 160, vc_r: 140, vc_fn: 200, vc_gr: 100, vc_th: 100, vc_dr: 80, f_r: 0.2, f_fn: 0.08, f_gr: 0.05, f_dr: 0.07, ap: 1.5 },
    mill: { vc: 100, fz: 0.04, ap: 1.5, ae: 0.4, vcD: 20, fzD: 0.07, vcT: 8 },
    kc1: 2300, mc: 0.21,
    vcRange: [60, 220]
  },
  AL: {
    name: 'Aluminium 7075 / 6061', group: 'N',
    turn: { vc_f: 600, vc_r: 500, vc_fn: 700, vc_gr: 300, vc_th: 250, vc_dr: 300, f_r: 0.25, f_fn: 0.1, f_gr: 0.07, f_dr: 0.12, ap: 2 },
    mill: { vc: 400, fz: 0.06, ap: 3, ae: 0.6, vcD: 150, fzD: 0.12, vcT: 40 },
    kc1: 700, mc: 0.25,
    vcRange: [200, 1200]
  },
  BRASS: {
    name: 'Mosiądz CuZn39Pb3', group: 'N',
    turn: { vc_f: 400, vc_r: 350, vc_fn: 500, vc_gr: 200, vc_th: 200, vc_dr: 200, f_r: 0.25, f_fn: 0.1, f_gr: 0.07, f_dr: 0.12, ap: 2 },
    mill: { vc: 300, fz: 0.06, ap: 3, ae: 0.6, vcD: 100, fzD: 0.12, vcT: 30 },
    kc1: 780, mc: 0.20,
    vcRange: [150, 800]
  },
  PA: {
    name: 'PA / POM / tworzywa', group: 'N',
    turn: { vc_f: 400, vc_r: 350, vc_fn: 500, vc_gr: 200, vc_th: 200, vc_dr: 200, f_r: 0.2, f_fn: 0.1, f_gr: 0.06, f_dr: 0.1, ap: 2 },
    mill: { vc: 350, fz: 0.08, ap: 3, ae: 0.6, vcD: 120, fzD: 0.15, vcT: 30 },
    kc1: 300, mc: 0.3,
    vcRange: [150, 800]
  },
  CAST: {
    name: 'Żeliwo GG25', group: 'K',
    turn: { vc_f: 180, vc_r: 160, vc_fn: 220, vc_gr: 110, vc_th: 120, vc_dr: 100, f_r: 0.25, f_fn: 0.1, f_gr: 0.07, f_dr: 0.08, ap: 2 },
    mill: { vc: 150, fz: 0.06, ap: 2.5, ae: 0.5, vcD: 30, fzD: 0.1, vcT: 10 },
    kc1: 1100, mc: 0.26,
    vcRange: [80, 300]
  },
  TI: {
    name: 'Tytan Ti6Al4V', group: 'S',
    turn: { vc_f: 60, vc_r: 50, vc_fn: 80, vc_gr: 35, vc_th: 40, vc_dr: 25, f_r: 0.15, f_fn: 0.08, f_gr: 0.04, f_dr: 0.05, ap: 1 },
    mill: { vc: 45, fz: 0.04, ap: 1, ae: 0.3, vcD: 12, fzD: 0.05, vcT: 5 },
    kc1: 1400, mc: 0.23,
    vcRange: [25, 100]
  }
};

export const MATERIAL_KEYS = Object.keys(MATERIALS);

/** Zwraca materiał (wbudowany lub własny). */
export function getMaterial(key, custom = {}) {
  return custom[key] || MATERIALS[key] || MATERIALS.S235;
}

/** Ocena Vc względem zakresu materiału: 'ok' | 'low' | 'high'. */
export function rateVc(vc, mat) {
  if (!mat || !mat.vcRange) return 'ok';
  if (vc < mat.vcRange[0]) return 'low';
  if (vc > mat.vcRange[1]) return 'high';
  return 'ok';
}
