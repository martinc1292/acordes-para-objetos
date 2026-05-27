import { atom } from 'nanostores';

const THEME_STORAGE_KEY = 'setlist.theme';
const LOCALE_STORAGE_KEY = 'setlist.locale';
const THEMES = new Set(['system', 'dark', 'light']);
const LOCALES = new Set(['es', 'en']);

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private or restricted contexts.
  }
}

function initialTheme() {
  const stored = readStorage(THEME_STORAGE_KEY);
  return THEMES.has(stored) ? stored : 'system';
}

function initialLocale() {
  const stored = readStorage(LOCALE_STORAGE_KEY);
  return LOCALES.has(stored) ? stored : 'es';
}

export const $theme = atom(initialTheme());
export const $locale = atom(initialLocale());
export const $presentationModeOpen = atom(false);

export function setTheme(theme) {
  if (!THEMES.has(theme)) return;
  $theme.set(theme);
  writeStorage(THEME_STORAGE_KEY, theme);
}

export function setLocale(locale) {
  if (!LOCALES.has(locale)) return;
  $locale.set(locale);
  writeStorage(LOCALE_STORAGE_KEY, locale);
}

export function setPresentationModeOpen(open) {
  $presentationModeOpen.set(Boolean(open));
}

export function togglePresentationMode() {
  $presentationModeOpen.set(!$presentationModeOpen.get());
}
