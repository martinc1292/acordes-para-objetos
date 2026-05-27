import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { getSupabase, isSupabaseConfigured } from '@/db/supabase.js';
import { useTranslation } from '@/stores/useTranslation.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ next = null }) {
  const t = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: 'idle' });
  const describedBy = status.kind === 'error' || status.kind === 'sent' ? 'login-status' : undefined;

  if (!isSupabaseConfigured()) {
    return html`
      <main class="auth-shell">
        <h1>${t('login.config_missing')}</h1>
        <p>${t('login.config_detail')}</p>
      </main>
    `;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', message: t('login.error.invalid_email') });
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
        console.error('signInWithOtp failed', error);
        setStatus({ kind: 'error', message: t('login.error.send_failed') });
        return;
      }
      setStatus({ kind: 'sent' });
    } catch (err) {
      console.error('signInWithOtp threw', err);
      setStatus({ kind: 'error', message: t('login.error.send_failed') });
    }
  }

  return html`
    <main class="auth-shell" aria-labelledby="login-title">
      <h1 id="login-title">${t('login.title')}</h1>
      <p>${t('login.subtitle')}</p>

      <form onSubmit=${onSubmit} class="auth-form">
        <label>
          ${t('login.email_label')}
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
          ${status.kind === 'sending' ? t('login.submitting') : t('login.submit')}
        </button>
      </form>

      <div id="login-status" aria-live="polite">
        ${status.kind === 'sent' && html`<p class="auth-success">${t('login.success')}</p>`}
        ${status.kind === 'error' && html`<p class="auth-error">${status.message}</p>`}
      </div>
    </main>
  `;
}
