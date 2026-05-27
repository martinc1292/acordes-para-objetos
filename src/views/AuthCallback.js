import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import { useTranslation } from '@/stores/useTranslation.js';

function safeNextPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function AuthCallback({ navigate }) {
  const t = useTranslation('auth');
  const [status, setStatus] = useState('exchanging');
  const [errorMessage, setErrorMessage] = useState('');
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let active = true;

    function fail(message) {
      if (!active) return;
      setStatus('error');
      setErrorMessage(message);
    }

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const next = safeNextPath(params.get('next'));
      if (!code) {
        fail(t('callback.error'));
        return;
      }
      try {
        const supabase = getSupabase();
        if (!supabase) {
          fail(t('callback.error'));
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('exchangeCodeForSession failed', error);
          fail(t('callback.error'));
          return;
        }
        if (active) navigateRef.current(next, { replace: true });
      } catch (err) {
        console.error('AuthCallback run failed', err);
        fail(t('callback.error'));
      }
    }
    run();

    return () => {
      active = false;
    };
  }, []);

  if (status === 'error') {
    return html`
      <main class="auth-shell">
        <h1>${t('callback.error')}</h1>
        <p role="alert">${errorMessage}</p>
        <a
          href="/login"
          onClick=${(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            navigateRef.current('/login', { replace: true });
          }}
        >${t('common:action.back')}</a>
      </main>
    `;
  }

  return html`
    <main class="auth-shell">
      <p aria-live="polite">${t('callback.loading')}</p>
    </main>
  `;
}
