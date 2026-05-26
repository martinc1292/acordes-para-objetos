import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import { createBand, seedExampleSongs } from '@/db/bands.js';
import { addLocalBand, refreshBands } from '@/stores/auth.js';

function parseToken(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/invite\/([a-f0-9-]{36})/i);
  const token = match ? match[1] : trimmed;
  return /^[a-f0-9-]{36}$/i.test(token) ? token : null;
}

export function Onboarding({ navigate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [withSeed, setWithSeed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [warning, setWarning] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [createdBandPath, setCreatedBandPath] = useState('');
  const [createdBand, setCreatedBand] = useState(null);

  function rememberCreatedBand(bandId, bandName, bandDescription) {
    const band = {
      id: bandId,
      name: bandName,
      description: bandDescription,
      role: 'admin',
      joinedAt: new Date().toISOString()
    };
    setCreatedBand(band);
    setCreatedBandPath(`/band/${bandId}`);
    return band;
  }

  async function activateCreatedBandAndNavigate(supabase, band, path) {
    addLocalBand(band);
    try {
      await refreshBands(supabase);
    } catch (err) {
      console.error('refreshBands failed after createBand', err);
    }
    navigate(path, { replace: true });
  }

  async function onCreate(event) {
    event.preventDefault();
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nombre requerido.');
      return;
    }
    setError('');
    setInviteError('');
    setWarning('');
    setCreatedBandPath('');
    setCreatedBand(null);
    setCreating(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase no esta configurado.');
      }
      const bandId = await createBand(supabase, { name: trimmed, description: description.trim() || null });
      let seedWarning = '';
      if (withSeed) {
        try {
          await seedExampleSongs(supabase, { bandId });
        } catch (err) {
          seedWarning = `Banda creada, pero el seed fallo: ${err.message}`;
        }
      }
      const band = rememberCreatedBand(bandId, trimmed, description.trim() || null);
      if (seedWarning) {
        setWarning(seedWarning);
      } else {
        await activateCreatedBandAndNavigate(supabase, band, `/band/${bandId}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function onGoToInvite() {
    if (creating) return;
    const token = parseToken(tokenInput);
    if (!token) {
      setInviteError('Pega un link o token de invitacion valido.');
      return;
    }
    setInviteError('');
    navigate(`/invite/${encodeURIComponent(token)}`);
  }

  return html`
    <main class="onboarding-shell">
      <h1>Bienvenido</h1>

      <section>
        <h2>Crear banda nueva</h2>
        <form onSubmit=${onCreate}>
          <label>
            Nombre
            <input
              name="band-name"
              autocomplete="organization"
              value=${name}
              onInput=${(event) => setName(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            Descripcion
            <input
              name="band-description"
              value=${description}
              onInput=${(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked=${withSeed}
              onInput=${(event) => setWithSeed(event.currentTarget.checked)}
            />
            Empezar con canciones de ejemplo
          </label>
          <button type="submit" disabled=${creating || Boolean(createdBandPath)}>
            ${creating ? 'Creando...' : 'Crear banda'}
          </button>
        </form>
        <div aria-live="polite">
          ${error && html`<p class="auth-error" role="alert">${error}</p>`}
          ${warning && html`
            <p class="auth-warning">${warning}</p>
            <button
              type="button"
              onClick=${async () => {
                const supabase = getSupabase();
                if (!createdBand || !supabase) {
                  navigate(createdBandPath || '/', { replace: true });
                  return;
                }
                await activateCreatedBandAndNavigate(supabase, createdBand, createdBandPath);
              }}
            >Continuar</button>
          `}
        </div>
      </section>

      <section>
        <h2>Tengo un link de invitacion</h2>
        <form onSubmit=${(event) => { event.preventDefault(); onGoToInvite(); }}>
          <label>
            Link o token
            <input
              name="invite-token"
              value=${tokenInput}
              disabled=${creating}
              spellCheck=${false}
              aria-invalid=${Boolean(inviteError)}
              aria-describedby=${inviteError ? 'invite-error' : undefined}
              onInput=${(event) => {
                setTokenInput(event.currentTarget.value);
                if (inviteError) setInviteError('');
              }}
            />
          </label>
          <button type="submit" disabled=${creating}>Continuar</button>
        </form>
        <div aria-live="polite">
          ${inviteError && html`<p id="invite-error" class="auth-error" role="alert">${inviteError}</p>`}
        </div>
      </section>
    </main>
  `;
}
