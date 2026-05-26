import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase, isSupabaseConfigured } from '@/db/supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ next = null }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: 'idle' });
  const describedBy = status.kind === 'error' || status.kind === 'sent' ? 'login-status' : undefined;

  if (!isSupabaseConfigured()) {
    return html`
      <main class="auth-shell">
        <h1>Configuracion incompleta</h1>
        <p>Faltan <code>VITE_SUPABASE_URL</code> o <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env.local</code>.</p>
      </main>
    `;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', message: 'Ingresa un email valido.' });
      return;
    }
    setStatus({ kind: 'sending' });
    const supabase = getSupabase();
    const redirect = `${window.location.origin}/auth/callback`
      + (next ? `?next=${encodeURIComponent(next)}` : '');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirect }
      });
      if (error) {
        setStatus({ kind: 'error', message: error.message });
        return;
      }
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'No pudimos enviar el link.' });
    }
  }

  return html`
    <main class="auth-shell" aria-labelledby="login-title">
      <h1 id="login-title">Ingresar</h1>
      <p>Te enviaremos un link al email para acceder.</p>

      <form onSubmit=${onSubmit} class="auth-form">
        <label>
          Email
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            spellCheck=${false}
            required
            value=${email}
            aria-invalid=${status.kind === 'error'}
            aria-describedby=${describedBy}
            onInput=${(event) => {
              setEmail(event.currentTarget.value);
              if (status.kind !== 'idle' && status.kind !== 'sending') setStatus({ kind: 'idle' });
            }}
            disabled=${status.kind === 'sending'}
          />
        </label>
        <button type="submit" disabled=${status.kind === 'sending'}>
          ${status.kind === 'sending' ? 'Enviando...' : 'Enviar magic link'}
        </button>
      </form>

      <div id="login-status" aria-live="polite">
        ${status.kind === 'sent' && html`<p class="auth-success">Revisa tu email para continuar.</p>`}
        ${status.kind === 'error' && html`<p class="auth-error">${status.message}</p>`}
      </div>
    </main>
  `;
}
