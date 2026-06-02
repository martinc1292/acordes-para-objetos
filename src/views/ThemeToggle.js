import { html } from 'htm/preact';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $theme, setTheme } from '@/stores/ui.js';
import { useTranslation } from '@/stores/useTranslation.js';

const THEME_OPTIONS = ['system', 'light', 'dark'];

export function ThemeToggle() {
  const t = useTranslation('common');
  const theme = useStoreValue($theme);

  const btnStyle = (value) => `
    padding:6px 14px;border-radius:4px;border:1px solid var(--line);cursor:pointer;font:inherit;
    background:${theme === value ? 'var(--accent)' : 'transparent'};
    color:${theme === value ? 'var(--accent-contrast)' : 'var(--text)'};
  `;

  return html`
    <div style="display:flex;gap:8px;align-items:center" role="group" aria-label=${t('theme.label')}>
      ${THEME_OPTIONS.map((value) => html`
        <button
          key=${value}
          type="button"
          style=${btnStyle(value)}
          aria-pressed=${theme === value}
          onClick=${() => setTheme(value)}
        >${t(`theme.${value}`)}</button>
      `)}
    </div>
  `;
}
