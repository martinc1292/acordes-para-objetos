import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import { acceptInvitation } from '@/db/bands.js';
import { refreshBands } from '@/stores/auth.js';

function isInviteToken(value) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value ?? '');
}

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function InviteAccept({ token, navigate }) {
  const [invite, setInvite] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [configMissing, setConfigMissing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (active) {
        setConfigMissing(false);
        setError('');
      }
      if (!isInviteToken(token)) {
        if (active) {
          setError('Token de invitacion invalido.');
          setStatus('ready');
        }
        return;
      }
      try {
        const supabase = getSupabase();
        if (!supabase) {
          if (active) {
            setConfigMissing(true);
            setError('Supabase no esta configurado.');
          }
          return;
        }
        // Non-admin invitees may not be able to read this row because of RLS.
        // Acceptance still relies on the RPC's server-side validation.
        const { data, error: queryError } = await supabase
          .from('invitations')
          .select('band_id, role, expires_at, bands ( name )')
          .eq('token', token)
          .maybeSingle();
        if (queryError) console.warn('invite preload failed', queryError);
        if (active) setInvite(data);
      } catch (err) {
        if (active) setError(err.message || 'No pudimos cargar la invitacion.');
      } finally {
        if (active) setStatus('ready');
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [token]);

  async function onAccept() {
    if (status === 'accepting' || configMissing || !isInviteToken(token)) return;
    setStatus('accepting');
    setError('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      const bandId = await acceptInvitation(supabase, { token });
      try {
        await refreshBands(supabase);
      } catch (err) {
        console.error('refreshBands failed after acceptInvitation', err);
      }
      if (mountedRef.current) navigate(`/band/${bandId}`, { replace: true });
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        setStatus('ready');
      }
    }
  }

  if (status === 'loading') {
    return html`<main class="auth-shell"><p aria-live="polite">Cargando invitacion...</p></main>`;
  }

  return html`
    <main class="auth-shell">
      <h1>Invitacion</h1>
      ${invite
        ? html`<p>Te invitaron a unirte a <strong>${invite.bands?.name ?? 'una banda'}</strong> como ${invite.role}.</p>`
        : html`<p>No tenemos datos previos de esta invitacion. Si el token es valido, podes intentar aceptarla igualmente.</p>`}
      ${error && html`<p class="auth-error" role="alert">${error}</p>`}
      <div class="auth-actions">
        <button type="button" onClick=${onAccept} disabled=${status === 'accepting' || configMissing || !isInviteToken(token)}>
          ${status === 'accepting' ? 'Aceptando...' : 'Aceptar'}
        </button>
        <a
          href="/"
          onClick=${(event) => {
            if (!shouldHandleLinkClick(event)) return;
            if (status === 'accepting') {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            navigate('/', { replace: true });
          }}
          aria-disabled=${status === 'accepting'}
        >Rechazar</a>
      </div>
    </main>
  `;
}
