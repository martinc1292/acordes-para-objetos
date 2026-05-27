import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import commonEs from '@/locales/es/common.json';
import songsEs from '@/locales/es/songs.json';
import bandsEs from '@/locales/es/bands.json';
import authEs from '@/locales/es/auth.json';
import commonEn from '@/locales/en/common.json';
import songsEn from '@/locales/en/songs.json';
import bandsEn from '@/locales/en/bands.json';
import authEn from '@/locales/en/auth.json';

i18n.use(LanguageDetector).init({
  fallbackLng: 'es',
  defaultNS: 'common',
  ns: ['common', 'songs', 'bands', 'auth'],
  resources: {
    es: { common: commonEs, songs: songsEs, bands: bandsEs, auth: authEs },
    en: { common: commonEn, songs: songsEn, bands: bandsEn, auth: authEn }
  },
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
    lookupLocalStorage: 'i18nextLng'
  }
});

export default i18n;
