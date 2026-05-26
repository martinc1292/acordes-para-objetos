import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $currentUser, $bands, $activeBandId, signOut } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function Home({ navigate }) {
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const user = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const activeBandId = useStoreValue($activeBandId);
  const activeBand = bands.find((band) => band.id === activeBandId);
  const userLabel = user?.email || 'tu cuenta';

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut(getSupabase());
      navigate('/login', { replace: true });
    } catch (err) {
      setSignOutError(err.message || 'No pudimos cerrar sesion.');
    } finally {
      setSigningOut(false);
    }
  }

  return html`
    <main class="app-shell">
      <header class="app-header">
        <h1>${activeBand ? activeBand.name : 'Setlist'}</h1>
        <nav>
          ${activeBand && html`
            <a
              href=${`/band/${activeBand.id}/settings`}
              onClick=${(event) => {
                if (!shouldHandleLinkClick(event)) return;
                event.preventDefault();
                navigate(`/band/${activeBand.id}/settings`);
              }}
            >Ajustes</a>
          `}
          <button
            type="button"
            onClick=${onSignOut}
            disabled=${signingOut}
          >${signingOut ? 'Saliendo...' : 'Salir'}</button>
        </nav>
      </header>
      <section>
        <p>Hola ${userLabel}. Las canciones llegan en Fase 2.</p>
        ${signOutError && html`<p class="auth-error" role="alert">${signOutError}</p>`}
      </section>
    </main>
  `;
}
