// Ekran Ustawienia: wybór post-procesora dla maszyny, podgląd bloków, edycja formatowania,
// import postów z plików .spm (VisualMill), motyw i informacje o programie.
import { BUILTIN_POSTS, postsFor, getPost, postSummary, parseSpm, withDefaults, tpl, finalize, CONTROLS } from '../core/posts.js';
import { storage } from '../core/storage.js';
import { t, tg, LANGS } from '../i18n/index.js';
import { ascii } from '../core/calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function customPosts() { return storage.get('posts', []); }
function saveCustom(list) { storage.set('posts', list); }

/** Post aktywny dla danej maszyny. */
export function activePost(machine) {
  const sel = storage.get('postSel', {});
  const post = getPost(sel[machine], machine, customPosts());
  const ov = (storage.get('postOverrides', {}) || {})[post.id];
  return ov ? mergeOverride(post, ov) : post;
}
function mergeOverride(post, ov) {
  const p = { ...post, seq: { ...withDefaults(post).seq, ...(ov.seq || {}) }, prec: { ...withDefaults(post).prec, ...(ov.prec || {}) } };
  if (ov.spaces !== undefined) p.spaces = ov.spaces;
  if (ov.trimZeros !== undefined) p.trimZeros = ov.trimZeros;
  p.modified = true;
  return p;
}
function overrides() { return storage.get('postOverrides', {}) || {}; }

/** Przykładowy program (kilka bloków), żeby widać było różnicę między postami. */
function samplePreview(post) {
  const p = withDefaults(post);
  const lathe = p.machine === 'lathe';
  const head = tpl(p.header, {
    START: p.startChar, PROG: lathe ? '1001' : '2001', HEAD: ascii(tg('PRZYKŁAD')), TITLE: ascii(tg('TULEJA 42')),
    STOCK: ascii(lathe ? tg('SURÓWKA: FI{d} x L{l} mm', { d: 30, l: 80 }) : tg('DETAL: X{x} x Y{y} x Z{z} mm  BAZA {w}: {b}', { x: 100, y: 80, z: 20, w: 'G54', b: tg('Lewy-dolny') })),
    GEN: 'CNC VPS', MAXRPM: lathe ? 4000 : 8100
  });
  const tc = tpl(p.toolChange, {
    TT: '01', TSTR: 'T0101', S: lathe ? 2600 : 2546, SAFEZ: '50.', MAXRPM: lathe ? 4000 : 8100,
    TOOLDIA: lathe ? '' : 50, TOOLLEN: '', TOOLDESC: ascii(lathe ? tg('Nóż zewn. zgrubny CNMG') : tg('Frez czołowy') + ' D50 Z5')
  });
  const body = lathe
    ? [`${p.codes.css} S250 ${p.codes.spinCW}`, `${p.codes.rapid} X32. Z1.5`, `${p.codes.lin} Z-0.5 F0.4`, `X-1.5 F0.2`]
    : [`${p.codes.rapid} X-27. Y0.`, `${p.codes.rapid} Z2.`, `${p.codes.lin} Z0. F306`, `${p.cycles.peck} Z-15. Q4. R2. F1685 ${p.cycles.ret}`, p.cycles.off];
  const foot = tpl(p.footer, { COOLOFF: p.codes.coolOff, END: p.endChar });
  return finalize([...head, '', ...tc, p.codes.coolOn || 'M08', ...body, '', ...foot], p);
}

function hl(line) {
  return esc(line)
    .replace(/\(([^)]*)\)/g, '<span class="c">($1)</span>')
    .replace(/^(O\d+)/, '<span class="o">$1</span>')
    .replace(/\b(N\d+)/g, '<span class="n">$1</span>')
    .replace(/\b(G\d+\.?\d*)/g, '<span class="g">$1</span>')
    .replace(/\b(M\d+)/g, '<span class="m">$1</span>')
    .replace(/\b(T\d+)/g, '<span class="t">$1</span>');
}

export function renderSettings(app) {
  const machine = app.machine;
  const custom = customPosts();
  const list = postsFor(machine, custom);
  const active = activePost(machine);
  const p = withDefaults(active);
  const other = machine === 'lathe' ? 'mill' : 'lathe';
  const otherActive = activePost(other);
  const preview = samplePreview(active);

  const ctrl = p.control || 'HCC';
  const filtered = list.filter((x) => (withDefaults(x).control || 'HCC') === ctrl);
  const shown = filtered.length ? filtered : list;
  const lang = app.lang || 'pl';
  const gcLang = app.gcLang || 'same';
  return `
  <div class="sec">${t('Język')} <span class="sp"></span><small>Language · Idioma · Sprache</small></div>
  <div class="card">
    <div class="lang-grid">${LANGS.map((l) => `<button data-act="lang-pick" data-l="${l.id}" class="${l.id === lang ? 'on' : ''}" lang="${l.id}"><b>${l.id.toUpperCase()}</b><span>${esc(l.native)}</span></button>`).join('')}</div>
    <div class="fl" style="margin-top:10px"><label>${t('Język komentarzy w G-kodzie')}</label>
      <select data-set="gcLang">
        <option value="same" ${gcLang === 'same' ? 'selected' : ''}>${t('jak język aplikacji')}</option>
        ${LANGS.map((l) => `<option value="${l.id}" ${gcLang === l.id ? 'selected' : ''}>${esc(l.native)}</option>`).join('')}
      </select></div>
    <p class="muted" style="font-size:11px;margin-top:6px">${t('Komentarze w programie są zapisywane wielkimi literami bez znaków diakrytycznych, tak jak wymaga sterownik.')}</p>
  </div>

  <div class="sec">${t('Sterowanie')} <span class="sp"></span><small>${t(machine === 'lathe' ? 'tokarka' : 'frezarka')}</small></div>
  <div class="card">
    <div class="ctrl-seg">${CONTROLS.map((c) => `<button data-act="ctrl-pick" data-c="${c.id}" class="${c.id === ctrl ? 'on' : ''}">${esc(c.short)}</button>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin-top:8px">${esc(t((CONTROLS.find((c) => c.id === ctrl) || {}).note || ''))}</p>
  </div>

  <div class="sec">${t('Post-procesor')} <span class="sp"></span><small>${t('{n} dla {c}', { n: shown.length, c: esc(ctrl) })}</small></div>
  <div class="card">
    <div class="fl"><label>${t('Aktywny post dla tej maszyny')}</label>
      <select data-set="post">${shown.map((x) => `<option value="${esc(x.id)}" ${x.id === active.id ? 'selected' : ''}>${esc(x.name)}${x.builtin ? '' : ' ●'}</option>`).join('')}</select></div>
    <p class="muted" style="font-size:12px;margin-top:8px">${esc(t(active.note || ''))}</p>
    <p class="mono muted" style="font-size:11px;margin-top:4px">${esc(postSummary(active))}${active.modified ? ` · <b style="color:var(--warn)">${t('zmodyfikowany')}</b>` : ''}</p>
    <div class="row" style="margin-top:10px">
      <button class="btn sm" data-act="post-import">⤒ ${t('Wczytaj .spm')}</button>
      <button class="btn sm" data-act="post-export">⤓ ${t('Zapisz jako JSON')}</button>
      ${active.builtin ? '' : `<button class="btn sm danger" data-act="post-delete" data-id="${esc(active.id)}">✕ ${t('Usuń post')}</button>`}
      ${active.modified ? `<button class="btn sm" data-act="post-reset" data-id="${esc(active.id)}">↺ ${t('Przywróć oryginał')}</button>` : ''}
      <input type="file" id="spm-file" accept=".spm,.json" hidden>
    </div>
    <p class="muted" style="font-size:11px;margin-top:6px">${t('Drugie stanowisko ({m}):', { m: t(other === 'lathe' ? 'tokarka' : 'frezarka') })} <b>${esc(otherActive.name)}</b> — ${t('przełącz maszynę u góry, żeby je zmienić.')}</p>
  </div>

  <div class="sec">${t('Format programu')} <span class="sp"></span><small>${t('nadpisuje ustawienia postu')}</small></div>
  <div class="card grid g3 narrow">
    <div class="fl"><label>${t('Numeracja N')}</label><select data-set="seq.on"><option value="0" ${p.seq.on ? '' : 'selected'}>${t('wyłączona')}</option><option value="1" ${p.seq.on ? 'selected' : ''}>${t('włączona')}</option></select></div>
    <div class="fl"><label>${t('Start')}</label><input type="number" inputmode="numeric" data-set="seq.start" value="${p.seq.start}" step="1" min="0"></div>
    <div class="fl"><label>${t('Krok')}</label><input type="number" inputmode="numeric" data-set="seq.inc" value="${p.seq.inc}" step="1" min="1"></div>
    <div class="fl"><label>${t('Cyfry (zera wiodące)')}</label><input type="number" inputmode="numeric" data-set="seq.digits" value="${p.seq.digits}" step="1" min="0" max="6"></div>
    <div class="fl"><label>${t('Miejsca dziesiętne')}</label><input type="number" inputmode="numeric" data-set="prec.xyz" value="${p.prec.xyz}" step="1" min="1" max="5"></div>
    <div class="fl"><label>${t('Spacje w bloku')}</label><select data-set="spaces"><option value="1" ${p.spaces ? 'selected' : ''}>${t('tak')} (G00 X10.)</option><option value="0" ${p.spaces ? '' : 'selected'}>${t('nie')} (G00X10.)</option></select></div>
  </div>

  <div class="sec">${t('Podgląd programu')} <span class="sp"></span><small>${t('przykładowe bloki tym postem')}</small></div>
  <div class="gc-wrap" style="max-height:44vh"><div class="gc">${preview.map((l) => `<span class="ln">${l.trim() === '' ? '&nbsp;' : hl(l)}</span>`).join('')}</div></div>

  <div class="sec">${t('Kody i cykle')} <span class="sp"></span><small>${t('czym post steruje generatorem')}</small></div>
  <div class="card tbl-wrap"><table class="tbl">
    <tr><th>${t('Funkcja')}</th><th>${t('Kod')}</th><th>${t('Funkcja')}</th><th>${t('Kod')}</th></tr>
    ${codeRows(p)}
  </table></div>

  <div class="sec">${t('Aplikacja')}</div>
  <div class="card grid g2">
    <div class="fl"><label>${t('Motyw')}</label><select data-set="theme"><option value="dark" ${app.theme === 'dark' ? 'selected' : ''}>${t('ciemny')}</option><option value="light" ${app.theme === 'light' ? 'selected' : ''}>${t('jasny')}</option></select></div>
    <div class="fl"><label>${t('Jednostki')}</label><select disabled><option>${t('milimetry (G21)')}</option></select></div>
  </div>
  <div class="card">
    <div class="row"><button class="btn" data-act="proj-open">📂 ${t('Projekty')}</button><button class="btn" data-act="export-json">⤓ ${t('Eksport projektu')}</button></div>
    <p class="muted" style="font-size:11px;line-height:1.6;margin-top:10px">⚠ ${t('Wygenerowany program zawsze sprawdź w trybie graficznym maszyny i przejedź pierwszą sztukę ze zmniejszonym posuwem szybkim. Post-procesor odwzorowuje składnię sterownika, ale nie zna Twoich offsetów, mocowania ani stanu narzędzi.')}</p>
    <p class="muted mono" style="font-size:10px;margin-top:8px">CNC VPS v${typeof __APP_VERSION__ === 'undefined' ? '0.1.0' : __APP_VERSION__} · ${t('posty wbudowane: {a} · własne: {b}', { a: BUILTIN_POSTS.length, b: custom.length })}</p>
  </div>`;
}

function codeRows(p) {
  const pairs = p.machine === 'lathe'
    ? [['Ruch szybki', p.codes.rapid], ['Interpolacja', p.codes.lin], ['Stała Vc', p.codes.css], ['Stałe RPM', p.codes.rpmConst],
       ['Limit obrotów', p.codes.rpmLimit], ['Posuw', p.codes.feedRev], ['Cykl zgrubny', p.cycles.rough], ['Wykończenie', p.cycles.finish],
       ['Rowkowanie', p.cycles.groove], ['Gwint', p.cycles.thread], ['Wiercenie', p.cycles.peck], ['Łamanie wióra', p.cycles.chip],
       ['Komp. lewa/prawa', p.codes.compL + ' / ' + p.codes.compR], ['Koniec', p.codes.end]]
    : [['Ruch szybki', p.codes.rapid], ['Interpolacja', p.codes.lin], ['Łuk CW/CCW', p.codes.cw + ' / ' + p.codes.ccw], ['Płaszczyzna', p.codes.plane],
       ['Komp. długości', p.codes.lenComp], ['Komp. lewa/prawa', p.codes.compL + ' / ' + p.codes.compR], ['Wiercenie', p.cycles.drill], ['Peck', p.cycles.peck],
       ['Łamanie wióra', p.cycles.chip], ['Gwintowanie', p.cycles.tap], ['Sztywne gwint.', p.cycles.rigid || '—'], ['Wytaczanie', p.cycles.bore],
       ['Powrót w cyklu', p.cycles.ret], ['Odwołanie cyklu', p.cycles.off], ['Wrzeciono', p.codes.spinCW + ' / ' + p.codes.spinOff], ['Koniec', p.codes.end]];
  let html = '';
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1] || ['', ''];
    html += `<tr><td>${esc(t(a[0]))}</td><td><b>${esc(a[1] || '—')}</b></td><td>${esc(b[0] ? t(b[0]) : '')}</td><td><b>${esc(b[1] || '')}</b></td></tr>`;
  }
  return html;
}

/** Podpina zdarzenia ekranu; `rerender` odświeża widok. */
export function bindSettings(app, rerender, toast) {
  const root = document.getElementById('screen');
  if (!root) return;
  const machine = app.machine;
  const active = activePost(machine);

  root.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('change', () => {
    const key = el.dataset.set;
    if (key === 'post') {
      const sel = storage.get('postSel', {}); sel[machine] = el.value; storage.set('postSel', sel);
      rerender(); return;
    }
    if (key === 'gcLang') {
      app.gcLang = el.value; storage.set('gcLang', el.value); app.applyLang && app.applyLang(); rerender(); return;
    }
    if (key === 'theme') {
      app.theme = el.value; document.documentElement.dataset.theme = app.theme; storage.set('theme', app.theme); rerender(); return;
    }
    const ovs = overrides();
    const ov = ovs[active.id] || {};
    const raw = el.type === 'number' ? parseFloat(el.value) || 0 : el.value;
    if (key.startsWith('seq.')) { ov.seq = ov.seq || {}; const k = key.slice(4); ov.seq[k] = k === 'on' ? raw === '1' : raw; }
    else if (key.startsWith('prec.')) { ov.prec = ov.prec || {}; ov.prec[key.slice(5)] = raw; }
    else if (key === 'spaces') ov.spaces = raw === '1';
    ovs[active.id] = ov; storage.set('postOverrides', ovs);
    rerender();
  }));

  const file = document.getElementById('spm-file');
  if (file) file.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((text) => {
      try {
        const post = /\.json$/i.test(f.name) ? JSON.parse(text) : parseSpm(text, f.name);
        if (!post.machine) post.machine = machine;
        if (!post.id) post.id = 'user-' + Math.random().toString(36).slice(2, 8);
        post.builtin = false;
        const list = customPosts().filter((x) => x.id !== post.id);
        list.push(post); saveCustom(list);
        const sel = storage.get('postSel', {}); sel[post.machine] = post.id; storage.set('postSel', sel);
        if (post.machine !== machine) app.machine = post.machine;
        toast(t('Wczytano post: {name}', { name: post.name }));
        rerender();
      } catch (err) {
        toast(t('Nie udało się wczytać: {e}', { e: err.message }));
      }
    });
  });
}

export function settingsAction(act, el, app, rerender, toast) {
  const machine = app.machine;
  const active = activePost(machine);
  switch (act) {
    case 'lang-pick': {
      app.lang = el.dataset.l; storage.set('lang', app.lang);
      app.applyLang && app.applyLang();
      rerender(); return true;
    }
    case 'ctrl-pick': {
      const want = el.dataset.c;
      const cand = postsFor(machine, customPosts()).filter((x) => (withDefaults(x).control || 'HCC') === want);
      if (!cand.length) { toast(t('Brak postu dla tego sterowania — wczytaj .spm')); return true; }
      const sel = storage.get('postSel', {}); sel[machine] = cand[0].id; storage.set('postSel', sel);
      rerender(); return true;
    }
    case 'post-import': document.getElementById('spm-file').click(); return true;
    case 'post-export': {
      const blob = new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = active.id + '.post.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(t('Zapisano {f}', { f: active.id + '.post.json' })); return true;
    }
    case 'post-delete': {
      if (!confirm(t('Usunąć post „{name}”?', { name: active.name }))) return true;
      saveCustom(customPosts().filter((x) => x.id !== el.dataset.id));
      const sel = storage.get('postSel', {}); delete sel[machine]; storage.set('postSel', sel);
      rerender(); return true;
    }
    case 'post-reset': {
      const ovs = overrides(); delete ovs[el.dataset.id]; storage.set('postOverrides', ovs);
      toast(t('Przywrócono ustawienia postu')); rerender(); return true;
    }
  }
  return false;
}
