import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import i18n from '@/lib/i18n.js';

export function RouteLoader({ load, props }) {
  const [Component, setComponent] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    load()
      .then((mod) => {
        if (active) setComponent(() => mod.default ?? Object.values(mod)[0]);
      })
      .catch((err) => {
        // A dynamic import can reject when a chunk is stale after a deploy.
        // Without this the view would hang on the loading state forever.
        console.error('route chunk load failed', err);
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [load]);

  if (failed) {
    return html`
      <main style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:100vh;padding:24px;text-align:center;color:var(--muted);font-family:var(--mono);font-size:0.85rem">
        <p style="margin:0">${i18n.t('common:error.load_failed')}</p>
        <button
          type="button"
          onClick=${() => window.location.reload()}
          style="background:var(--accent);color:var(--accent-contrast);border:none;border-radius:4px;padding:8px 16px;cursor:pointer;font:inherit"
        >${i18n.t('common:action.retry')}</button>
      </main>
    `;
  }

  if (!Component) {
    return html`<main style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--muted);font-family:var(--mono);font-size:0.85rem;">...</main>`;
  }
  return html`<${Component} ...${props} />`;
}
