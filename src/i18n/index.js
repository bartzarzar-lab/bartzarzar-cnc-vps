// Tłumaczenia. Językiem źródłowym jest polski: tekst w kodzie jest jednocześnie kluczem,
// a słowniki en/es/de mapują polskie zdanie na tłumaczenie. Brak tłumaczenia → polski oryginał,
// więc aplikacja nigdy nie pokaże pustego pola.
//
//   t(tekst, zmienne)  — interfejs aplikacji (język z Ustawień)
//   tg(tekst, zmienne) — komentarze i ostrzeżenia w G-kodzie (osobny wybór; domyślnie jak interfejs)
//
// Zmienne w tekście: {nazwa} → t('OP {n}: brak narzędzia', { n: 3 }).

import en from './en.js';
import es from './es.js';
import de from './de.js';

export const LANGS = [
  { id: 'pl', name: 'Polski', native: 'Polski', locale: 'pl-PL' },
  { id: 'en', name: 'English', native: 'English', locale: 'en-GB' },
  { id: 'es', name: 'Español', native: 'Español', locale: 'es-ES' },
  { id: 'de', name: 'Deutsch', native: 'Deutsch', locale: 'de-DE' }
];

const DICT = { pl: null, en, es, de };

let uiLang = 'pl';
let gcLang = 'pl';
let missing = null; // Set — zbieranie brakujących kluczy w trybie deweloperskim

export function setLang(l) { if (DICT[l] !== undefined) uiLang = l; }
export function setCommentLang(l) { if (DICT[l] !== undefined) gcLang = l; }
export function getLang() { return uiLang; }
export function getCommentLang() { return gcLang; }
export function locale() { return (LANGS.find((x) => x.id === uiLang) || LANGS[0]).locale; }

/** Włącza zbieranie brakujących tłumaczeń (testy / narzędzie deweloperskie). */
export function trackMissing(on = true) { missing = on ? new Set() : null; return missing; }
export function missingKeys() { return missing ? [...missing] : []; }

function tr(lang, s, vars) {
  if (s === undefined || s === null) return '';
  const key = String(s);
  // Klucz z kontekstem 'kontekst|tekst' (np. krótsza etykieta do paska nawigacji):
  // bez własnego tłumaczenia używa zwykłego tłumaczenia samego tekstu.
  const bar = key.indexOf('|');
  let out = bar > 0 ? key.slice(bar + 1) : key;
  const d = DICT[lang];
  if (d) {
    if (Object.prototype.hasOwnProperty.call(d, key)) out = d[key];
    else if (bar > 0 && Object.prototype.hasOwnProperty.call(d, out)) out = d[out];
    else if (missing && /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{2}/.test(key)) missing.add(key);
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return out;
}

export const t = (s, vars) => tr(uiLang, s, vars);
export const tg = (s, vars) => tr(gcLang, s, vars);
/** Tłumaczenie na konkretny język (np. do testów). */
export const tIn = (lang, s, vars) => tr(lang, s, vars);
export const DICTS = DICT;
