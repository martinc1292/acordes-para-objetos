import { html } from 'htm/preact';
import { $currentUser } from '@/stores/auth.js';
import {
  $locale,
  $presentationModeOpen,
  $theme,
  setLocale,
  setTheme,
  togglePresentationMode
} from '@/stores/ui.js';
import { useStoreValue } from '@/stores/useStoreValue.js';

const THEME_OPTIONS = ['system', 'dark', 'light'];
const LOCALE_OPTIONS = ['es', 'en'];

export function App() {
  const theme = useStoreValue($theme);
  const locale = useStoreValue($locale);
  const currentUser = useStoreValue($currentUser);
  const presentationModeOpen = useStoreValue($presentationModeOpen);

  return html`
    <main class="app-shell" data-theme=${theme}>
      <section class="intro-panel" aria-labelledby="app-title">
        <p class="eyebrow">Fase 0</p>
        <h1 id="app-title">Hello Preact</h1>
        <p class="lede">Base MVP lista para rescatar la logica del setlist actual.</p>

        <div class="status-grid" aria-label="Estado base">
          <div class="status-item">
            <span class="status-label">Runtime</span>
            <strong>Preact + htm</strong>
          </div>
          <div class="status-item">
            <span class="status-label">Auth</span>
            <strong>${currentUser ? currentUser.email : 'Guest'}</strong>
          </div>
          <div class="status-item">
            <span class="status-label">Mode</span>
            <strong>${presentationModeOpen ? 'Presentation' : 'Workspace'}</strong>
          </div>
        </div>
      </section>

      <aside class="control-panel" aria-label="Base controls">
        <div class="control-group">
          <span class="control-label">Theme</span>
          <div class="segmented-control">
            ${THEME_OPTIONS.map((option) => html`
              <button
                type="button"
                class=${option === theme ? 'segment segment-active' : 'segment'}
                onClick=${() => setTheme(option)}
              >
                ${option}
              </button>
            `)}
          </div>
        </div>

        <div class="control-group">
          <span class="control-label">Locale</span>
          <div class="segmented-control">
            ${LOCALE_OPTIONS.map((option) => html`
              <button
                type="button"
                class=${option === locale ? 'segment segment-active' : 'segment'}
                onClick=${() => setLocale(option)}
              >
                ${option}
              </button>
            `)}
          </div>
        </div>

        <button class="primary-action" type="button" onClick=${togglePresentationMode}>
          ${presentationModeOpen ? 'Close presentation' : 'Open presentation'}
        </button>
      </aside>
    </main>
  `;
}
