import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { useTranslation } from '@/stores/useTranslation.js';

export function UpdateBanner() {
  const t = useTranslation('common');
  const [dismissed, setDismissed] = useState(false);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      if (r) console.info('[SW] registered');
    },
    onRegisterError(err) {
      console.error('[SW] registration error', err);
    }
  });

  if (!needRefresh || dismissed) return null;

  return html`
    <div
      role="alert"
      style="
        position:fixed;bottom:0;left:0;right:0;z-index:999;
        background:var(--panel);border-top:1px solid var(--line);
        padding:12px 16px;display:flex;align-items:center;
        justify-content:space-between;gap:12px;flex-wrap:wrap;
        font-family:var(--mono);font-size:0.85rem;
      "
    >
      <span style="color:var(--text)">
        ${t('update.available')}
      </span>
      <div style="display:flex;gap:8px">
        <button
          type="button"
          onClick=${() => updateServiceWorker(true)}
          style="
            background:var(--accent);color:var(--accent-contrast);
            border:none;border-radius:4px;padding:6px 14px;
            cursor:pointer;font:inherit;font-weight:600;
          "
        >${t('update.reload')}</button>
        <button
          type="button"
          onClick=${() => setDismissed(true)}
          style="
            background:transparent;color:var(--muted);
            border:1px solid var(--line);border-radius:4px;
            padding:6px 14px;cursor:pointer;font:inherit;
          "
        >${t('update.later')}</button>
      </div>
    </div>
  `;
}
