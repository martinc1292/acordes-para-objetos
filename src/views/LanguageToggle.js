import { html } from 'htm/preact';
import i18n from '@/lib/i18n.js';
import { useTranslation } from '@/stores/useTranslation.js';

export function LanguageToggle() {
  const t = useTranslation('common');
  const current = i18n.language?.slice(0, 2) ?? 'es';

  function setLang(lang) {
    i18n.changeLanguage(lang);
  }

  const btnStyle = (lang) => `
    padding:6px 14px;border-radius:4px;border:1px solid var(--line);cursor:pointer;font:inherit;
    background:${current === lang ? 'var(--accent)' : 'transparent'};
    color:${current === lang ? 'var(--accent-contrast)' : 'var(--text)'};
  `;

  return html`
    <div style="display:flex;gap:8px;align-items:center">
      <button type="button" style=${btnStyle('es')} onClick=${() => setLang('es')}
        aria-pressed=${current === 'es'}>${t('lang.es')}</button>
      <button type="button" style=${btnStyle('en')} onClick=${() => setLang('en')}
        aria-pressed=${current === 'en'}>${t('lang.en')}</button>
    </div>
  `;
}
