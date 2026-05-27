import { render } from 'preact';
import { html } from 'htm/preact';
import { App } from './app.js';
import { exposeDevtools } from './devtools.js';
import { createRouter } from '@/lib/router.js';
import { clearCurrentUser, initAuthStore } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import './style.css';

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

const routes = [
  { pattern: '/', name: 'home' },
  { pattern: '/login', name: 'login' },
  { pattern: '/auth/callback', name: 'auth-callback' },
  { pattern: '/onboarding', name: 'onboarding' },
  { pattern: '/invite/:token', name: 'invite-accept' },
  { pattern: '/band/:bandId/settings', name: 'band-settings' },
  { pattern: '/band/:bandId/song/new', name: 'song-new' },
  { pattern: '/band/:bandId/song/:songId', name: 'song-detail' },
  { pattern: '/band/:bandId', name: 'band-home' }
];

const router = createRouter(routes, { window });
let supabase = null;

try {
  supabase = getSupabase();
} catch (err) {
  console.error('getSupabase failed', err);
}

exposeDevtools();
initAuthStore(supabase).catch((err) => {
  console.error('initAuthStore failed', err);
  clearCurrentUser();
});

render(html`<${App} router=${router} />`, root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    router.dispose();
  });
}
