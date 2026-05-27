import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { getSupabase, isSupabaseConfigured } from '@/db/supabase.js';
import { useTranslation } from '@/stores/useTranslation.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normaliseMode(mode) {
  return mode === 'sign-up' ? 'sign-up' : 'sign-in';
}

function buildRedirect(next) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
  return `${window.location.origin}/auth/callback${suffix}`;
}

function authErrorMessage(error, mode, t) {
  const message = String(error?.message ?? '').toLowerCase();
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return t('login.error.invalid_credentials');
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return t('login.error.already_registered');
  }
  return mode === 'sign-up' ? t('login.error.sign_up_failed') : t('login.error.sign_in_failed');
}

export function Login({ next = null, initialMode = 'sign-in' }) {
  const t = useTranslation('auth');
  const [mode, setMode] = useState(() => normaliseMode(initialMode));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle' });
  const isSignUp = mode === 'sign-up';
  const describedBy = status.kind === 'error' || status.kind === 'success' ? 'login-status' : undefined;
  const busy = status.kind === 'submitting';

  useEffect(() => {
    setMode(normaliseMode(initialMode));
    setStatus({ kind: 'idle' });
  }, [initialMode]);

  function switchMode(nextMode) {
    if (busy) return;
    setMode(nextMode);
    setConfirmPassword('');
    setStatus({ kind: 'idle' });
  }

  if (!isSupabaseConfigured()) {
    return html`
      <main class="auth-shell">
        <section class="auth-panel auth-panel-compact" aria-labelledby="login-title">
          <p class="auth-eyebrow">${t('login.eyebrow')}</p>
          <h1 id="login-title" class="auth-title">${t('login.config_missing')}</h1>
          <p class="auth-copy">${t('login.config_detail')}</p>
        </section>
      </main>
    `;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', field: 'email', message: t('login.error.invalid_email') });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus({
        kind: 'error',
        field: 'password',
        message: t('login.error.password_short', { count: MIN_PASSWORD_LENGTH })
      });
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setStatus({ kind: 'error', field: 'confirm-password', message: t('login.error.password_mismatch') });
      return;
    }
    setStatus({ kind: 'submitting' });
    const supabase = getSupabase();
    try {
      const result = isSignUp
        ? await supabase.auth.signUp({
            email: trimmed,
            password,
            options: { emailRedirectTo: buildRedirect(next) }
          })
        : await supabase.auth.signInWithPassword({ email: trimmed, password });
      const { data, error } = result;
      if (error) {
        console.error(`${mode} failed`, error);
        setStatus({ kind: 'error', message: authErrorMessage(error, mode, t) });
        return;
      }
      setStatus({
        kind: 'success',
        message: isSignUp
          ? (data?.session ? t('login.success.signed_up_active') : t('login.success.signed_up'))
          : t('login.success.signed_in')
      });
    } catch (err) {
      console.error(`${mode} threw`, err);
      setStatus({ kind: 'error', message: authErrorMessage(err, mode, t) });
    }
  }

  return html`
    <main class="auth-shell" aria-labelledby="login-title">
      <section class="auth-brand" aria-hidden="true">
        <p class="auth-eyebrow">${t('login.eyebrow')}</p>
        <div class="auth-mark">
          <span>Am</span>
          <span>F</span>
          <span>G</span>
          <span>C</span>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-heading">
          <p class="auth-eyebrow">${isSignUp ? t('login.mode.sign_up') : t('login.mode.sign_in')}</p>
          <h1 id="login-title" class="auth-title">
            ${isSignUp ? t('login.sign_up_title') : t('login.sign_in_title')}
          </h1>
          <p class="auth-copy">
            ${isSignUp ? t('login.sign_up_subtitle') : t('login.sign_in_subtitle')}
          </p>
        </div>

        <div class="auth-mode-switch" role="tablist" aria-label=${t('login.mode_label')}>
          <button
            type="button"
            role="tab"
            class=${mode === 'sign-in' ? 'auth-mode auth-mode-active' : 'auth-mode'}
            aria-selected=${mode === 'sign-in'}
            onClick=${() => switchMode('sign-in')}
            disabled=${busy}
          >${t('login.mode.sign_in')}</button>
          <button
            type="button"
            role="tab"
            class=${mode === 'sign-up' ? 'auth-mode auth-mode-active' : 'auth-mode'}
            aria-selected=${mode === 'sign-up'}
            onClick=${() => switchMode('sign-up')}
            disabled=${busy}
          >${t('login.mode.sign_up')}</button>
        </div>

        <form onSubmit=${onSubmit} class="auth-form" noValidate>
          <label class="auth-field">
            <span>${t('login.email_label')}</span>
            <input
              class="auth-input"
              type="email"
              name="email"
              autocomplete="email"
              inputmode="email"
              spellCheck=${false}
              required
              value=${email}
              aria-invalid=${status.field === 'email'}
              aria-describedby=${describedBy}
              onInput=${(event) => {
                setEmail(event.currentTarget.value);
                if (status.kind !== 'idle' && status.kind !== 'submitting') setStatus({ kind: 'idle' });
              }}
              disabled=${busy}
            />
          </label>

          <label class="auth-field">
            <span>${t('login.password_label')}</span>
            <div class="auth-password-wrap">
              <input
                class="auth-input auth-input-with-action"
                type=${showPassword ? 'text' : 'password'}
                name="password"
                autocomplete=${isSignUp ? 'new-password' : 'current-password'}
                required
                value=${password}
                minlength=${MIN_PASSWORD_LENGTH}
                aria-invalid=${status.field === 'password'}
                aria-describedby=${describedBy}
                onInput=${(event) => {
                  setPassword(event.currentTarget.value);
                  if (status.kind !== 'idle' && status.kind !== 'submitting') setStatus({ kind: 'idle' });
                }}
                disabled=${busy}
              />
              <button
                type="button"
                class="auth-field-action"
                onClick=${() => setShowPassword((value) => !value)}
                disabled=${busy}
              >${showPassword ? t('login.hide_password') : t('login.show_password')}</button>
            </div>
          </label>

          ${isSignUp && html`
            <label class="auth-field">
              <span>${t('login.confirm_password_label')}</span>
              <input
                class="auth-input"
                type=${showPassword ? 'text' : 'password'}
                name="confirm-password"
                autocomplete="new-password"
                required
                value=${confirmPassword}
                minlength=${MIN_PASSWORD_LENGTH}
                aria-invalid=${status.field === 'confirm-password'}
                aria-describedby=${describedBy}
                onInput=${(event) => {
                  setConfirmPassword(event.currentTarget.value);
                  if (status.kind !== 'idle' && status.kind !== 'submitting') setStatus({ kind: 'idle' });
                }}
                disabled=${busy}
              />
            </label>
          `}

          <button class="auth-submit" type="submit" disabled=${busy}>
            ${busy
              ? (isSignUp ? t('login.submitting_sign_up') : t('login.submitting_sign_in'))
              : (isSignUp ? t('login.submit_sign_up') : t('login.submit_sign_in'))}
          </button>
        </form>

        <div id="login-status" class="auth-status" aria-live="polite">
          ${status.kind === 'success' && html`<p class="auth-success">${status.message}</p>`}
          ${status.kind === 'error' && html`<p class="auth-error" role="alert">${status.message}</p>`}
        </div>
      </section>
    </main>
  `;
}
