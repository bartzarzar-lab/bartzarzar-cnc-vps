// Ekran Kalkulatory + tabele. Wartości trzymane w app.calc, wyniki odświeżane bez przebudowy formularza.
import { MATERIALS, MATERIAL_KEYS, getMaterial, rateVc } from '../core/materials.js';
import { rpm, vc, vfMill, vfTurn, qMill, qTurn, cuttingPower, torque, metricThread, threadPasses, taperAngle, taperRatio, rightTriangle, boltCircle, roughnessRt, feedForRa, fmt } from '../core/calc.js';
import { METRIC_THREADS, tapDrill, isoTolerance, TAPERS, RA_GUIDE } from '../core/tables.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function defaults(app) {
  const s = app[app.machine];
  const lathe = app.machine === 'lathe';
  const m = getMaterial(s.material);
  return {
    mat: s.material, d: lathe ? s.stock.d : 12, vc: lathe ? m.turn.vc_r : m.mill.vc, n: 0, maxRpm: s.maxRpm,
    fz: m.mill.fz, z: 3, f: m.turn.f_r, ap: lathe ? m.turn.ap : m.mill.ap, ae: 8, kw: lathe ? 15 : 22.4,
    tD: 20, tP: 2.5, tInt: false,
    tolD: 25, tolFit: 'H7', tolFit2: 'g6',
    tpBig: 30, tpSmall: 20, tpLen: 50,
    trA: 10, trB: 0, trC: 0, trAlpha: 0,
    pcdCx: 0, pcdCy: 0, pcd: 40, pcdN: 6, pcdStart: 0,
    raF: 0.15, raR: 0.4, raTarget: 1.6,
    mode: lathe ? 'turn' : 'mill'
  };
}

function inp(app, label, key, o = {}) {
  const v = app.calc[key];
  return `<div class="fl"><label>${label}</label><input type="${o.text ? 'text' : 'number'}" ${o.text ? '' : 'inputmode="decimal"'} data-calc="${key}" value="${esc(v)}" ${o.step ? `step="${o.step}"` : ''}></div>`;
}
function selc(app, label, key, opts) {
  return `<div class="fl"><label>${label}</label><select data-calc="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(app.calc[key]) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}

export function renderCalc(app) {
  app.calc ??= defaults(app);
  const c = app.calc;
  const matOpts = MATERIAL_KEYS.map((k) => [k, MATERIALS[k].name]);
  return `
  <div class="sec">Kalkulatory <span class="sp"></span><small>wartości startowe z bieżącego detalu</small></div>
  <div class="calc-grid">
    <div class="cc"><div class="ct">Obroty · prędkość · posuw</div>
      <div class="grid g2" style="margin-bottom:6px">${selc(app, 'Materiał', 'mat', matOpts)}${selc(app, 'Tryb', 'mode', [['turn', 'toczenie (f mm/obr)'], ['mill', 'frezowanie (fz·z)']])}</div>
      <div class="grid g3 narrow">${inp(app, 'Vc m/min', 'vc', { step: 5 })}${inp(app, 'D mm', 'd', { step: 0.5 })}${inp(app, 'Max RPM', 'maxRpm', { step: 100 })}</div>
      <div class="chips" id="vc-chips"></div>
      <div class="grid g3 narrow" style="margin-top:6px">${inp(app, 'f mm/obr', 'f', { step: 0.01 })}${inp(app, 'fz mm/ząb', 'fz', { step: 0.01 })}${inp(app, 'z zęby', 'z', { step: 1 })}</div>
      <div id="r-rpm"></div>
    </div>
    <div class="cc"><div class="ct">Wydajność · moc · moment</div>
      <div class="grid g3 narrow">${inp(app, 'ap mm', 'ap', { step: 0.5 })}${inp(app, 'ae mm (frez.)', 'ae', { step: 0.5 })}${inp(app, 'Moc wrzec. kW', 'kw', { step: 0.5 })}</div>
      <div id="r-power"></div>
    </div>
    <div class="cc"><div class="ct">Gwint metryczny · G76 · wiertło</div>
      <div class="grid g3 narrow">${inp(app, 'D nom mm', 'tD', { step: 1 })}${inp(app, 'Skok P', 'tP', { step: 0.25 })}${selc(app, 'Typ', 'tInt', [['false', 'zewnętrzny'], ['true', 'wewnętrzny']])}</div>
      <div class="chips" id="th-chips">${METRIC_THREADS.filter((t) => t.d >= 6 && t.d <= 30).map((t) => `<button data-thread="${t.d},${t.p}">M${t.d}</button>`).join('')}</div>
      <div id="r-thread"></div>
    </div>
    <div class="cc"><div class="ct">Tolerancje ISO 286</div>
      <div class="grid g3 narrow">${inp(app, 'Wymiar mm', 'tolD', { step: 1 })}${inp(app, 'Otwór', 'tolFit', { text: true })}${inp(app, 'Wałek', 'tolFit2', { text: true })}</div>
      <div class="chips">${['H6', 'H7', 'H8', 'H9', 'H11', 'g6', 'h6', 'h7', 'k6', 'm6', 'n6', 'p6', 'f7', 'e8', 'js9'].map((f) => `<button data-fit="${f}">${f}</button>`).join('')}</div>
      <div id="r-tol"></div>
    </div>
    <div class="cc"><div class="ct">Stożek</div>
      <div class="grid g3 narrow">${inp(app, 'D duże', 'tpBig', { step: 0.5 })}${inp(app, 'd małe', 'tpSmall', { step: 0.5 })}${inp(app, 'Długość', 'tpLen', { step: 1 })}</div>
      <div id="r-taper"></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tr><th>Stożek</th><th>Zbieżność</th><th>Kąt ½</th></tr>${TAPERS.map((t) => `<tr><td>${t.name}</td><td>${t.ratio}</td><td>${t.angle.toFixed(4)}°</td></tr>`).join('')}</table></div>
    </div>
    <div class="cc"><div class="ct">Trójkąt prostokątny <span class="muted" style="font-weight:400">(podaj 2 wartości, resztę zostaw 0)</span></div>
      <div class="grid g4">${inp(app, 'a (przypr.)', 'trA', { step: 0.5 })}${inp(app, 'b (przypr.)', 'trB', { step: 0.5 })}${inp(app, 'c (przeciwpr.)', 'trC', { step: 0.5 })}${inp(app, 'α °', 'trAlpha', { step: 1 })}</div>
      <div id="r-tri"></div>
    </div>
    <div class="cc"><div class="ct">Otwory na okręgu (PCD)</div>
      <div class="grid g3 narrow">${inp(app, 'Xc', 'pcdCx', { step: 1 })}${inp(app, 'Yc', 'pcdCy', { step: 1 })}${inp(app, 'PCD ⌀', 'pcd', { step: 1 })}${inp(app, 'Ilość', 'pcdN', { step: 1 })}${inp(app, 'Kąt start °', 'pcdStart', { step: 15 })}</div>
      <div id="r-pcd" class="tbl-wrap"></div>
    </div>
    <div class="cc"><div class="ct">Chropowatość (toczenie)</div>
      <div class="grid g3 narrow">${inp(app, 'f mm/obr', 'raF', { step: 0.01 })}${inp(app, 'rε płytki', 'raR', { step: 0.1 })}${inp(app, 'Ra docelowe', 'raTarget', { step: 0.1 })}</div>
      <div id="r-ra"></div>
      <div class="kv" style="margin-top:6px">${RA_GUIDE.map((g) => `<span>Ra ${g.ra}</span>${g.desc}<br>`).join('')}</div>
    </div>
    <div class="cc" style="grid-column:1/-1"><div class="ct">Tabela gwintów metrycznych ISO</div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>Gwint</th><th>Skok</th><th>Wiertło</th><th>d minor (nóż)</th><th>P (G76)</th><th>Drobnozw.</th></tr>
      ${METRIC_THREADS.map((t) => { const th = metricThread(t.d, t.p); return `<tr><td>M${t.d}</td><td>${t.p}</td><td>⌀${tapDrill(t.d, t.p)}</td><td>${th.dMinor.toFixed(3)}</td><td>P${th.pUm}</td><td>${t.fine.map((p) => 'M' + t.d + 'x' + p + ' (⌀' + tapDrill(t.d, p) + ')').join(', ') || '—'}</td></tr>`; }).join('')}</table></div>
    </div>
    <div class="cc" style="grid-column:1/-1"><div class="ct">Materiały — parametry startowe</div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>Materiał</th><th>ISO</th><th>Vc tocz. zgr/wyk</th><th>f zgr/wyk</th><th>Vc frez.</th><th>fz</th><th>Vc wierc.</th><th>Vc gwint</th><th>kc1</th></tr>
      ${MATERIAL_KEYS.map((k) => { const m = MATERIALS[k]; return `<tr><td>${m.name}</td><td>${m.group}</td><td>${m.turn.vc_r}/${m.turn.vc_fn}</td><td>${m.turn.f_r}/${m.turn.f_fn}</td><td>${m.mill.vc}</td><td>${m.mill.fz}</td><td>${m.turn.vc_dr}/${m.mill.vcD}</td><td>${m.turn.vc_th}</td><td>${m.kc1}</td></tr>`; }).join('')}</table></div>
    </div>
  </div>`;
}

export function bindCalc(app) {
  const root = document.getElementById('screen');
  root.querySelectorAll('[data-calc]').forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.calc;
    app.calc[k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
    if (k === 'mat') { const m = getMaterial(el.value); app.calc.vc = app.calc.mode === 'turn' ? m.turn.vc_r : m.mill.vc; app.calc.fz = m.mill.fz; app.calc.f = m.turn.f_r; root.querySelector('[data-calc=vc]').value = app.calc.vc; root.querySelector('[data-calc=fz]').value = app.calc.fz; root.querySelector('[data-calc=f]').value = app.calc.f; }
    update(app);
  }));
  root.querySelectorAll('[data-thread]').forEach((b) => b.addEventListener('click', () => { const [d, p] = b.dataset.thread.split(',').map(Number); app.calc.tD = d; app.calc.tP = p; root.querySelector('[data-calc=tD]').value = d; root.querySelector('[data-calc=tP]').value = p; update(app); }));
  root.querySelectorAll('[data-fit]').forEach((b) => b.addEventListener('click', () => { const f = b.dataset.fit; const key = f[0] === f[0].toUpperCase() ? 'tolFit' : 'tolFit2'; app.calc[key] = f; root.querySelector(`[data-calc=${key}]`).value = f; update(app); }));
  update(app);
}

function update(app) {
  const c = app.calc, m = getMaterial(c.mat);
  const set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  // chips Vc
  const chips = c.mode === 'turn'
    ? [['czoło', m.turn.vc_f], ['zgrubne', m.turn.vc_r], ['wykończ.', m.turn.vc_fn], ['rowek', m.turn.vc_gr], ['gwint', m.turn.vc_th], ['wiercenie', m.turn.vc_dr]]
    : [['frezowanie', m.mill.vc], ['wiercenie', m.mill.vcD], ['gwintownik', m.mill.vcT]];
  const ch = document.getElementById('vc-chips');
  if (ch) { ch.innerHTML = chips.map(([l, v]) => `<button data-vc="${v}" class="${v === c.vc ? 'on' : ''}">${l} ${v}</button>`).join(''); ch.querySelectorAll('button').forEach((b) => b.onclick = () => { c.vc = +b.dataset.vc; document.querySelector('[data-calc=vc]').value = c.vc; update(app); }); }
  // RPM
  const nRaw = rpm(c.vc, c.d), n = Math.min(nRaw, c.maxRpm || Infinity), lim = nRaw > (c.maxRpm || Infinity);
  const vcReal = vc(n, c.d), rate = rateVc(vcReal, m);
  const vf = c.mode === 'turn' ? vfTurn(c.f, n) : vfMill(c.fz, c.z, n);
  set('r-rpm', `<div class="cr ${lim ? 'warn' : ''}">${n.toLocaleString('pl-PL')} RPM ${lim ? `<small style="font-size:12px">(ogr. z ${nRaw.toLocaleString('pl-PL')})</small>` : ''}</div>
    <div class="cu">n = Vc·1000 / (π·D)${lim ? ` · rzeczywiste Vc = <b>${vcReal.toFixed(0)}</b> m/min` : ''} ${rate !== 'ok' ? `<span style="color:var(--warn)">— Vc ${rate === 'low' ? 'poniżej' : 'powyżej'} zakresu ${m.vcRange[0]}–${m.vcRange[1]} dla ${m.name.split(' ')[0]}</span>` : ''}</div>
    <div class="cr" style="font-size:18px">${Math.round(vf).toLocaleString('pl-PL')} mm/min</div>
    <div class="cu">${c.mode === 'turn' ? 'Vf = f · n' : 'Vf = fz · z · n'} · czas 100 mm: <b>${vf > 0 ? (100 / vf * 60).toFixed(1) : '—'} s</b></div>`);
  // moc
  const q = c.mode === 'turn' ? qTurn(vcReal, c.ap, c.f) : qMill(c.ap, c.ae, vf);
  const h = c.mode === 'turn' ? c.f * 0.94 : c.fz * Math.sqrt(Math.min(1, c.ae / Math.max(c.d, 0.1)));
  const P = cuttingPower(q, m.kc1, m.mc, h), Pm = P / 0.8, M = torque(Pm, n);
  const util = c.kw > 0 ? (Pm / c.kw) * 100 : 0;
  set('r-power', `<div class="cr">${q.toFixed(1)} cm³/min</div><div class="cu">Q = ${c.mode === 'turn' ? 'Vc·ap·f' : 'ap·ae·Vf/1000'}</div>
    <div class="kv" style="margin-top:6px"><span>Moc skrawania Pc</span><b>${P.toFixed(2)}</b> kW (kc1 ${m.kc1}, h ${h.toFixed(3)})<br><span>Moc na wrzecionie</span><b>${Pm.toFixed(2)}</b> kW (η 0.8)<br><span>Moment</span><b>${M.toFixed(1)}</b> Nm @ ${n} RPM<br><span>Obciążenie</span><b style="color:${util > 90 ? 'var(--danger)' : util > 70 ? 'var(--warn)' : 'var(--accent2)'}">${util.toFixed(0)} %</b> z ${c.kw} kW</div>`);
  // gwint
  const int = String(c.tInt) === 'true';
  const th = metricThread(c.tD, c.tP, int), passes = threadPasses(th.hT);
  const nT = Math.min(rpm(m.turn.vc_th, c.tD), c.maxRpm || 4000, 1200);
  const pp = String(passes).padStart(2, '0');
  set('r-thread', `<div class="kv"><span>${int ? 'Wiertło pod gwint' : 'd minor (dno)'}</span><b>⌀${int ? th.drill : th.dMinor.toFixed(3)}</b> mm<br><span>d podziałowa</span><b>${th.dPitch.toFixed(3)}</b> mm<br><span>H profilu (nóż)</span><b>${th.hT.toFixed(4)}</b> mm → P${th.pUm}<br><span>1. wcięcie Q</span><b>${th.firstCutUm}</b> µm · przejść ≈ <b>${passes}</b><br><span>RPM (G97)</span><b>${nT}</b> · Vf ${Math.round(nT * c.tP)} mm/min</div>
    <div class="gc-wrap" style="margin-top:6px"><div class="gc" style="padding:6px 10px;font-size:11px">G97 S${nT} M03<br>G00 X${int ? (th.dMinor - 2).toFixed(3) : (c.tD + 3).toFixed(3)} Z${(c.tP * 2).toFixed(1)}<br>G76 P${pp}0060 Q50 R0.05<br>G76 X${int ? c.tD.toFixed(3) : th.dMinor.toFixed(3)} Z-${(20 + c.tP * 1.5).toFixed(3)} P${th.pUm} Q${th.firstCutUm} F${c.tP.toFixed(4)}</div></div>
    <div class="cu" style="margin-top:4px">Frezarka G84: F = n × P = ${Math.min(nT, 800)} × ${c.tP} = <b>${Math.round(Math.min(nT, 800) * c.tP)}</b> mm/min</div>`);
  // tolerancje
  const t1 = isoTolerance(c.tolD, c.tolFit || 'H7'), t2 = isoTolerance(c.tolD, c.tolFit2 || 'g6');
  const fmtT = (t) => t ? `<b>${t.upper >= 0 ? '+' : ''}${(t.upper * 1000).toFixed(0)}</b> / <b>${t.lower >= 0 ? '+' : ''}${(t.lower * 1000).toFixed(0)}</b> µm → ${(c.tolD + t.lower).toFixed(3)} – ${(c.tolD + t.upper).toFixed(3)}` : '<span style="color:var(--danger)">nieznane pasowanie</span>';
  let fit = '';
  if (t1 && t2) { const cmax = (t1.upper - t2.lower) * 1000, cmin = (t1.lower - t2.upper) * 1000; fit = `<br><span>Luz min / max</span><b>${cmin.toFixed(0)}</b> / <b>${cmax.toFixed(0)}</b> µm ${cmin < 0 && cmax < 0 ? '(wcisk)' : cmin < 0 ? '(mieszane)' : '(luźne)'}`; }
  set('r-tol', `<div class="kv"><span>⌀${c.tolD} ${esc(c.tolFit)}</span>${fmtT(t1)}<br><span>⌀${c.tolD} ${esc(c.tolFit2)}</span>${fmtT(t2)}${fit}</div>`);
  // stożek
  const ang = taperAngle(c.tpBig, c.tpSmall, c.tpLen), ratio = taperRatio(c.tpBig, c.tpSmall, c.tpLen);
  set('r-taper', `<div class="cr">${ang.toFixed(4)}°</div><div class="cu">kąt połówkowy · zawarty <b>${(2 * ang).toFixed(4)}°</b> · zbieżność <b>1:${Number.isFinite(ratio) ? ratio.toFixed(3) : '∞'}</b> · tg = ${Math.tan(ang * Math.PI / 180).toFixed(5)} · G01 X${c.tpSmall.toFixed(3)} Z0. → X${c.tpBig.toFixed(3)} Z-${c.tpLen.toFixed(3)}</div>`);
  // trójkąt
  const tr = rightTriangle({ a: c.trA || undefined, b: c.trB || undefined, c: c.trC || undefined, alpha: c.trAlpha || undefined });
  set('r-tri', `<div class="kv"><span>a</span><b>${fmt(tr.a)}</b> &nbsp; <span>b</span><b>${fmt(tr.b)}</b><br><span>c</span><b>${fmt(tr.c)}</b> &nbsp; <span>α / β</span><b>${fmt(tr.alpha, 3)}° / ${fmt(tr.beta, 3)}°</b></div>`);
  // PCD
  const pts = boltCircle(c.pcdCx, c.pcdCy, c.pcd, Math.max(1, Math.round(c.pcdN)), c.pcdStart);
  set('r-pcd', `<table class="tbl"><tr><th>#</th><th>X</th><th>Y</th><th>kąt</th></tr>${pts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.x.toFixed(3)}</td><td>${p.y.toFixed(3)}</td><td>${(c.pcdStart + (360 / pts.length) * i).toFixed(1)}°</td></tr>`).join('')}</table>`);
  // Ra
  const rt = roughnessRt(c.raF, c.raR), fRa = feedForRa(c.raTarget, c.raR);
  set('r-ra', `<div class="kv"><span>Rt teoret.</span><b>${rt.toFixed(2)}</b> µm ≈ Ra <b>${(rt / 4).toFixed(2)}</b> µm<br><span>f dla Ra ${c.raTarget}</span><b>${fRa.toFixed(3)}</b> mm/obr (rε ${c.raR})</div>`);
}
