// Karta ustawcza — samodzielny dokument HTML do druku lub wysłania operatorowi.
// Zawiera nagłówek programu, rysunek poglądowy (SVG z podglądu), listę narzędzi
// z parametrami i kolejność operacji z czasami.
import { getMaterial } from '../core/materials.js';
import { isProbeOp } from '../core/probe.js';
import { LATHE_OPS } from '../core/lathe.js';
import { MILL_OPS } from '../core/mill.js';
import { rpm as calcRpm, vfMill } from '../core/calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildSetupSheet(app) {
  const lathe = app.machine === 'lathe';
  const s = app[app.machine];
  const post = app.post || {};
  const mat = getMaterial(s.material);
  const OPS = lathe ? LATHE_OPS : MILL_OPS;
  const gc = app.gc || { lines: [], time: { total: 0, toolChanges: 0 }, warnings: [] };
  const svg = document.getElementById('pv-svg');
  const drawing = svg ? svg.outerHTML.replace(/touch-action:[^;"]*;?/g, '') : '';

  const used = [...new Set(s.ops.map((o) => o.tool))].sort((a, b) => a - b);
  const toolRows = used.map((no) => {
    const t = s.tools[no - 1] || {};
    const ops = s.ops.filter((o) => o.tool === no).map((o) => OPS[o.type].label).join(', ');
    const isProbe = s.ops.some((o) => o.tool === no && isProbeOp(o.type));
    const tname = t.type || (isProbe ? 'Sonda pomiarowa' : '—');
    if (lathe) {
      return `<tr><td class="n">T${String(no).padStart(2, '0')}${String(no).padStart(2, '0')}</td><td>${esc(tname)}</td>
        <td class="n">${t.vc || '—'}</td><td class="n">${t.f || '—'}</td><td class="n">${t.ap || '—'}</td><td class="n">${t.r ?? t.w ?? '—'}</td><td>${esc(ops)}</td></tr>`;
    }
    const n = calcRpm(t.vc || 200, t.d || 6, s.maxRpm);
    return `<tr><td class="n">T${String(no).padStart(2, '0')}</td><td>${esc(tname)}</td>
      <td class="n">${t.d || '—'}</td><td class="n">${t.z || '—'}</td>
      <td class="n">${isProbe ? '—' : n}</td><td class="n">${isProbe ? '—' : Math.round(vfMill(t.fz || 0.05, t.z || 2, n))}</td><td>${esc(ops)}</td></tr>`;
  }).join('');

  const opRows = s.ops.map((o, i) => {
    const d = OPS[o.type];
    const detail = lathe ? latheDetail(o) : millDetail(o, s);
    return `<tr><td class="n">${i + 1}</td><td><span class="dot" style="background:${d.color}"></span>${esc(d.full)}</td>
      <td class="n">T${String(o.tool).padStart(2, '0')}</td><td>${esc(detail)}</td></tr>`;
  }).join('');

  const warn = gc.warnings.length
    ? `<div class="warn"><b>Uwagi z generatora</b><ul>${gc.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';

  const stock = lathe
    ? `⌀${s.stock.d} × L${s.stock.l} mm (min ⌀${s.stock.dmin})`
    : `${s.stock.x} × ${s.stock.y} × ${s.stock.z} mm`;

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">
<title>Karta ustawcza O${esc(String(s.prog).padStart(4, '0'))}${s.title ? ' — ' + esc(s.title) : ''}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #12181f; margin: 0; font-size: 12px; line-height: 1.4; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #5b6672; margin: 16px 0 6px; border-bottom: 1px solid #d5dbe3; padding-bottom: 3px; }
  .top { display: flex; gap: 16px; align-items: flex-start; border-bottom: 2px solid #12181f; padding-bottom: 8px; }
  .top .meta { flex: 1; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin-top: 6px; }
  .kv span { color: #5b6672; }
  .kv b { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .stamp { text-align: right; font-size: 11px; color: #5b6672; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; background: #eef1f5; padding: 5px 6px; border: 1px solid #d5dbe3; font-weight: 600; }
  td { padding: 5px 6px; border: 1px solid #d5dbe3; vertical-align: top; }
  td.n { font-family: ui-monospace, Menlo, Consolas, monospace; white-space: nowrap; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .draw { border: 1px solid #d5dbe3; border-radius: 6px; padding: 4px; background: #0d1117; width: 46%; }
  .draw svg { width: 100%; height: 150px; display: block; }
  .warn { border: 1px solid #d29922; background: #fff8e6; border-radius: 6px; padding: 8px 12px; margin-top: 10px; }
  .warn ul { margin: 4px 0 0 16px; padding: 0; }
  .sign { display: flex; gap: 24px; margin-top: 18px; }
  .sign div { flex: 1; border-top: 1px solid #98a2ae; padding-top: 4px; color: #5b6672; font-size: 10px; }
  .foot { margin-top: 14px; font-size: 10px; color: #5b6672; border-top: 1px solid #d5dbe3; padding-top: 6px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="top">
  <div class="meta">
    <h1>${esc(s.title || 'Karta ustawcza')}</h1>
    <div class="kv">
      <span>Program</span><b>O${esc(String(s.prog).padStart(4, '0'))}</b>
      <span>Maszyna</span><b>${lathe ? 'Tokarka' : 'Frezarka'} — ${esc(post.name || '')}</b>
      <span>Sterowanie</span><b>${esc(post.control || 'HCC')}</b>
      <span>Materiał</span><b>${esc(mat.name)} (ISO ${esc(mat.group)})</b>
      <span>Półfabrykat</span><b>${esc(stock)}</b>
      <span>Układ</span><b>${esc(String(s.wcs || 'G54').replace(/^G154P(\d+)$/, 'G154 P$1'))}${lathe ? '' : ' · baza ' + esc(baseName(s.base))}</b>
      <span>Chłodzenie</span><b>${esc(s.coolant || 'brak')}</b>
      <span>Czas szac.</span><b>${gc.time.total.toFixed(1)} min · ${gc.time.toolChanges} zmian narzędzia</b>
    </div>
  </div>
  ${drawing ? `<div class="draw">${drawing}</div>` : ''}
</div>

<h2>Narzędzia</h2>
<table><thead><tr>
  ${lathe
    ? '<th>Pozycja</th><th>Opis</th><th>Vc</th><th>f</th><th>ap</th><th>rε / szer.</th><th>Operacje</th>'
    : '<th>Nr</th><th>Opis</th><th>⌀</th><th>z</th><th>S obr/min</th><th>F mm/min</th><th>Operacje</th>'}
</tr></thead><tbody>${toolRows || '<tr><td colspan="7">brak</td></tr>'}</tbody></table>

<h2>Kolejność operacji</h2>
<table><thead><tr><th>#</th><th>Operacja</th><th>Narz.</th><th>Parametry</th></tr></thead>
<tbody>${opRows || '<tr><td colspan="4">brak</td></tr>'}</tbody></table>
${warn}

<div class="sign"><div>Przygotował / data</div><div>Sprawdził / data</div><div>Operator / data</div></div>
<div class="foot">Wygenerowano w CNC VPS ${new Date().toLocaleString('pl-PL')}. Program sprawdź w trybie graficznym maszyny; parametry skrawania są wartościami startowymi.</div>
<p class="noprint" style="margin-top:14px"><button onclick="window.print()" style="padding:8px 16px;font-size:13px">Drukuj / zapisz PDF</button></p>
</body></html>`;
}

function baseName(i) {
  return ['Lewy-górny', 'Środek-górny', 'Prawy-górny', 'Lewy-środek', 'Centrum', 'Prawy-środek', 'Lewy-dolny', 'Środek-dolny', 'Prawy-dolny'][i ?? 6];
}
function millDetail(o, s) {
  if (isProbeOp(o.type)) return `start X${o.sx} Y${o.sy} Z${o.sz}${o.d ? ', ⌀nom ' + o.d : ''}${o.x ? ', X ' + o.x : ''}${o.y ? ', Y ' + o.y : ''}`;
  const p = [];
  if (o.zt !== undefined) p.push(`Z${o.zt}`);
  if (o.ap) p.push(`ap ${o.ap}`);
  if (o.ae) p.push(`ae ${Math.round(o.ae * 100)}%D`);
  if (o.pattern) p.push(o.pattern === 'pcd' ? `PCD ⌀${o.pcd} × ${Math.round(o.n)} otw.` : `siatka ${o.nx}×${o.ny} od X${o.x1} Y${o.y1}, rozstaw ${o.dx}/${o.dy}`);
  else if (o.x1 !== undefined && o.x2 !== undefined) p.push(`X${o.x1}…${o.x2} Y${o.y1}…${o.y2}`);
  if (o.cx !== undefined && o.r) p.push(`środek ${o.cx},${o.cy} R${o.r}`);
  if (o.d) p.push(`⌀${o.d}`);
  if (o.dia) p.push(`⌀${o.dia}`);
  if (o.peck) p.push(`peck ${o.peck}`);
  if (o.pitch) p.push(`skok ${o.pitch}`);
  if (o.comp) p.push('G' + o.comp);
  return p.join(' · ');
}
function latheDetail(o) {
  const p = [];
  if (o.vc) p.push(`Vc ${Math.round(o.vc)}`);
  if (o.f) p.push(`f ${o.f}`);
  if (o.ap) p.push(`ap ${o.ap}`);
  if (o.profile) p.push(`profil ${o.profile.length} pkt`);
  if (o.x !== undefined) p.push(`X${o.x}`);
  if (o.z !== undefined) p.push(`Z${o.z}`);
  if (o.dnom) p.push(`M${o.dnom}×${o.pitch}`);
  if (o.dbore) p.push(`⌀${o.dbore} gł.${o.depth}`);
  if (o.fi) p.push(`⌀${o.fi} gł.${o.depth}`);
  if (o.xb !== undefined) p.push(`dno ⌀${o.xb} szer.${o.w}`);
  return p.join(' · ');
}

/** Otwiera kartę w nowym oknie (druk/PDF) lub udostępnia jako plik HTML. */
export async function openSetupSheet(app, mode = 'print') {
  const html = buildSetupSheet(app);
  const s = app[app.machine];
  const name = `karta_O${String(s.prog).padStart(4, '0')}${s.title ? '_' + s.title.replace(/[^\w-]+/g, '_') : ''}.html`;
  if (mode === 'share') {
    const file = new File([html], name, { type: 'text/html' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return;
  }
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = name; a.click();
  }
}
