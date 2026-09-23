// Eksport programu .NC: Web Share API (Android/iOS), pobranie, lub Capacitor Filesystem + Share.
import { toast } from './app.js';
import { t } from '../i18n/index.js';

function fileName(app) {
  const s = app[app.machine];
  return `O${String(s.prog).padStart(4, '0')}${s.title ? '_' + s.title.replace(/[^\w-]+/g, '_') : ''}.nc`;
}

export async function exportNc(app, mode) {
  const text = '%\n' + app.gc.lines.join('\n') + '\n';
  const name = fileName(app);
  const cap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  try {
    if (cap) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const res = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: 'utf8' });
      if (mode === 'share') await Share.share({ title: name, url: res.uri });
      else { await Filesystem.writeFile({ path: name, data: text, directory: Directory.Documents, encoding: 'utf8' }); toast(t('Zapisano w Dokumentach: {name}', { name })); }
      return;
    }
    const file = new File([text], name, { type: 'text/plain' });
    if (mode === 'share' && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ files: [file], title: name });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('Pobrano {name}', { name }));
  } catch (e) {
    if (e && e.name !== 'AbortError') { console.warn(e); toast(t('Nie udało się udostępnić — skopiuj kod')); }
  }
}
