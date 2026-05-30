import { html } from 'htm/preact';
import { shouldHandleLinkClick } from '@/lib/dom.js';
import { useTranslation } from '@/stores/useTranslation.js';

const BRAND = {
  name: 'Atril',
  tag: 'Repertorio de banda'
};

function go(event, navigate, path, options) {
  if (!shouldHandleLinkClick(event)) return;
  event.preventDefault();
  navigate(path, options);
}

export function AtrilHeader({ band, bandId, navigate, view = 'list', canEdit = false }) {
  const t = useTranslation('common');
  const homePath = bandId ? `/band/${bandId}` : '/';
  const settingsPath = bandId ? `/band/${bandId}/settings` : '/';
  const newSongPath = bandId ? `/band/${bandId}/song/new` : '/';
  const bandName = band?.name ?? '';

  return html`
    <header class="ap-header">
      <div class="ap-header-inner">
        <a
          class="ap-brand"
          href=${homePath}
          onClick=${(event) => go(event, navigate, homePath)}
          aria-label=${BRAND.name}
        >
          <span class="ap-brand-mark" aria-hidden="true">&</span>
          <span class="ap-brand-text">
            <span class="ap-brand-name">${BRAND.name}</span>
            <span class="ap-brand-tag">${BRAND.tag}</span>
          </span>
        </a>

        <div class="ap-header-right">
          ${view === 'detail' ? html`
            <a
              class="ap-btn ap-btn-ghost"
              href=${homePath}
              onClick=${(event) => go(event, navigate, homePath)}
            >
              <span aria-hidden="true">←</span>
              <span>${t('nav.back_to_setlist')}</span>
            </a>
          ` : html`
            <a
              class="ap-band-chip"
              href=${settingsPath}
              onClick=${(event) => go(event, navigate, settingsPath)}
            >
              <span class="ap-band-dot" aria-hidden="true"></span>
              <span class="ap-band-name">${bandName}</span>
              <span class="ap-band-caret" aria-hidden="true">▾</span>
            </a>
            ${canEdit && html`
              <a
                class="ap-btn ap-btn-accent"
                href=${newSongPath}
                onClick=${(event) => go(event, navigate, newSongPath)}
              >
                <span aria-hidden="true">+</span>
                <span>${t('songs:action.new_song')}</span>
              </a>
            `}
          `}
        </div>
      </div>
    </header>
  `;
}
