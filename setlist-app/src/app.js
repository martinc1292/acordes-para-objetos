import { html } from 'htm/preact';
import { useCallback, useEffect, useMemo } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $currentUser, $bands, $authReady } from '@/stores/auth.js';
import { Login } from '@/views/Login.js';
import { AuthCallback } from '@/views/AuthCallback.js';
import { Onboarding } from '@/views/Onboarding.js';
import { InviteAccept } from '@/views/InviteAccept.js';
import { BandSettings } from '@/views/BandSettings.js';
import { Home } from '@/views/Home.js';

function getSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function getNext(search) {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

function decidePostLogin({ route, bands, search }) {
  const REENTRY = new Set(['login', 'auth-callback', 'home', 'onboarding']);
  const next = getNext(search);
  if (REENTRY.has(route.name) && next && next !== route.path) return { path: next, replace: true };
  if (bands.length === 0) {
    return route.name === 'onboarding' || route.name === 'invite-accept'
      ? null
      : { path: '/onboarding', replace: true };
  }
  if (REENTRY.has(route.name)) return { path: `/band/${bands[0].id}`, replace: true };
  return null;
}

function decideUnauthRedirect({ route }) {
  const PUBLIC = new Set(['login', 'auth-callback']);
  if (PUBLIC.has(route.name)) return null;
  const target = route.name === 'invite-accept'
    ? `/login?next=${encodeURIComponent(route.path)}`
    : '/login';
  return { path: target, replace: true };
}

export function App({ router }) {
  const route = useStoreValue(router.$route);
  const user = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const ready = useStoreValue($authReady);
  const navigate = useCallback((path, opts) => router.navigate(path, opts), [router]);
  const redirect = useMemo(() => {
    if (!ready || !route?.name) return null;
    return user
      ? decidePostLogin({ route, bands, search: getSearch() })
      : decideUnauthRedirect({ route });
  }, [bands, ready, route, user]);

  useEffect(() => {
    if (redirect) navigate(redirect.path, { replace: redirect.replace });
  }, [navigate, redirect]);

  if (!ready) {
    return html`<main class="app-shell"><p>Cargando...</p></main>`;
  }

  if (!route?.name) {
    return html`<main class="app-shell"><h1>404</h1></main>`;
  }

  if (redirect) return null;

  switch (route.name) {
    case 'login':
      return html`<${Login} next=${getNext(getSearch())} />`;
    case 'auth-callback':
      return html`<${AuthCallback} navigate=${navigate} />`;
    case 'onboarding':
      return html`<${Onboarding} navigate=${navigate} />`;
    case 'invite-accept':
      return html`<${InviteAccept} token=${route.params.token} navigate=${navigate} />`;
    case 'band-settings':
      return html`<${BandSettings} bandId=${route.params.bandId} navigate=${navigate} />`;
    case 'band-home':
      return html`<${Home} navigate=${navigate} />`;
    case 'home':
    default:
      return html`<${Home} navigate=${navigate} />`;
  }
}
