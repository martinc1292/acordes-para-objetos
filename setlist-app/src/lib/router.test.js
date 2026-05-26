import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { matchRoute, resolveRoute, createRouter } from './router.js';

describe('matchRoute', () => {
  it('matches a literal path', () => {
    assert.deepEqual(matchRoute('/login', '/login'), {});
  });

  it('returns null when paths differ', () => {
    assert.equal(matchRoute('/login', '/settings'), null);
    assert.equal(matchRoute('/song', '/song/123'), null);
    assert.equal(matchRoute('/song/123', '/song'), null);
  });

  it('captures named segments', () => {
    assert.deepEqual(matchRoute('/song/:id', '/song/abc-123'), { id: 'abc-123' });
    assert.deepEqual(matchRoute('/band/:id', '/band/42'), { id: '42' });
  });

  it('captures multiple named segments', () => {
    assert.deepEqual(
      matchRoute('/band/:bandId/song/:songId', '/band/abc/song/xyz'),
      { bandId: 'abc', songId: 'xyz' }
    );
  });

  it('treats literal segments as exact matches alongside params', () => {
    assert.deepEqual(matchRoute('/song/new', '/song/new'), {});
    assert.equal(matchRoute('/song/new', '/song/42'), null);
  });

  it('treats query string and hash as not part of the match', () => {
    assert.deepEqual(matchRoute('/song/:id', '/song/123?ref=email'), { id: '123' });
    assert.deepEqual(matchRoute('/song/:id', '/song/123#section'), { id: '123' });
  });

  it('normalises trailing slashes', () => {
    assert.deepEqual(matchRoute('/login', '/login/'), {});
    assert.deepEqual(matchRoute('/song/:id', '/song/123/'), { id: '123' });
  });
});

describe('resolveRoute', () => {
  const routes = [
    { pattern: '/', name: 'home' },
    { pattern: '/login', name: 'login' },
    { pattern: '/song/new', name: 'song-new' },
    { pattern: '/song/:id', name: 'song-detail' },
    { pattern: '/band/:id', name: 'band-detail' },
    { pattern: '/settings', name: 'settings' }
  ];

  it('picks the first matching route in declaration order (literal before param)', () => {
    const result = resolveRoute(routes, '/song/new');
    assert.equal(result.name, 'song-new');
    assert.deepEqual(result.params, {});
  });

  it('falls back to the parameterised route when no literal matches', () => {
    const result = resolveRoute(routes, '/song/42');
    assert.equal(result.name, 'song-detail');
    assert.deepEqual(result.params, { id: '42' });
  });

  it('returns null for paths that do not match any route', () => {
    assert.equal(resolveRoute(routes, '/unknown/path'), null);
  });

  it('matches the root path', () => {
    const result = resolveRoute(routes, '/');
    assert.equal(result.name, 'home');
  });
});

describe('createRouter (with happy-dom)', () => {
  let window;
  let router;

  beforeEach(() => {
    window = new Window({ url: 'http://localhost/' });
  });

  afterEach(() => {
    if (router) router.dispose();
    router = null;
  });

  it('reflects the initial window location on creation', () => {
    window = new Window({ url: 'http://localhost/song/42' });
    router = createRouter(
      [
        { pattern: '/song/new', name: 'song-new' },
        { pattern: '/song/:id', name: 'song-detail' }
      ],
      { window }
    );
    const current = router.$route.get();
    assert.equal(current.name, 'song-detail');
    assert.deepEqual(current.params, { id: '42' });
    assert.equal(current.path, '/song/42');
  });

  it('navigate pushes onto history and updates the route store', () => {
    router = createRouter(
      [
        { pattern: '/', name: 'home' },
        { pattern: '/settings', name: 'settings' }
      ],
      { window }
    );
    assert.equal(router.$route.get().name, 'home');

    router.navigate('/settings');

    assert.equal(router.$route.get().name, 'settings');
    assert.equal(window.location.pathname, '/settings');
  });

  it('popstate triggers a route re-resolution from the current URL', () => {
    router = createRouter(
      [
        { pattern: '/', name: 'home' },
        { pattern: '/login', name: 'login' }
      ],
      { window }
    );
    router.navigate('/login');
    assert.equal(router.$route.get().name, 'login');

    // Simulate a back navigation: URL goes to '/', then popstate fires.
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new window.PopStateEvent('popstate'));

    assert.equal(router.$route.get().name, 'home');
    assert.equal(window.location.pathname, '/');
  });

  it('navigate to the same path does not push a duplicate state', () => {
    router = createRouter(
      [{ pattern: '/', name: 'home' }, { pattern: '/login', name: 'login' }],
      { window }
    );
    const initialLength = window.history.length;
    router.navigate('/login');
    const lengthAfter = window.history.length;
    router.navigate('/login');
    assert.equal(window.history.length, lengthAfter, 'no second push for same path');
    assert.ok(lengthAfter > initialLength);
  });

  it('navigate with replace=true uses replaceState instead of pushState', () => {
    router = createRouter(
      [{ pattern: '/', name: 'home' }, { pattern: '/login', name: 'login' }],
      { window }
    );
    const lengthBefore = window.history.length;
    router.navigate('/login', { replace: true });
    assert.equal(window.history.length, lengthBefore);
    assert.equal(router.$route.get().name, 'login');
  });

  it('dispose removes the popstate listener', () => {
    router = createRouter(
      [{ pattern: '/', name: 'home' }, { pattern: '/login', name: 'login' }],
      { window }
    );
    router.dispose();

    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new window.PopStateEvent('popstate'));

    assert.equal(router.$route.get().name, 'home', 'route store stays put after dispose');
  });
});
