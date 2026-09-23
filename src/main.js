import { boot } from './ui/app.js';
import { registerSW } from 'virtual:pwa-register';
import * as i18n from './i18n/index.js';

// Narzędzie deweloperskie: ?i18n-debug zbiera brakujące tłumaczenia (window.__i18n.missingKeys()).
if (/[?&]i18n-debug/.test(location.search)) { i18n.trackMissing(true); window.__i18n = i18n; }

registerSW({ immediate: true });
boot();
