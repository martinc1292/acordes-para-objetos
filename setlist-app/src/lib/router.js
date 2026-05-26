import { atom } from 'nanostores';
import { useStoreValue } from '../stores/useStoreValue.js';

function normalizePath(path) {
  let p = String(path ?? '');
  const cut = p.search(/[?#]/);
  if (cut !== -1) p = p.slice(0, cut);
  if (!p) p = '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function splitSegments(path) {
  return normalizePath(path).split('/').filter(Boolean);
}

export function matchRoute(pattern, path) {
  const patternParts = splitSegments(pattern);
  const pathParts = splitSegments(path);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const segPattern = patternParts[i];
    const segPath = pathParts[i];
    if (segPattern.startsWith(':')) {
      params[segPattern.slice(1)] = segPath;
    } else if (segPattern !== segPath) {
      return null;
    }
  }
  return params;
}

export function resolveRoute(routes, path) {
  const normalised = normalizePath(path);
  for (const route of routes) {
    const params = matchRoute(route.pattern, normalised);
    if (params !== null) {
      return { ...route, params, path: normalised };
    }
  }
  return null;
}

function buildRouteState(routes, path) {
  return (
    resolveRoute(routes, path) ?? {
      name: null,
      params: {},
      path: normalizePath(path)
    }
  );
}

export function createRouter(routes, options = {}) {
  const win = options.window ?? (typeof window !== 'undefined' ? window : null);
  if (!win) {
    throw new Error('createRouter requires a window (DOM or happy-dom).');
  }

  const $route = atom(buildRouteState(routes, win.location.pathname));

  function refresh() {
    $route.set(buildRouteState(routes, win.location.pathname));
  }

  function navigate(path, { replace = false } = {}) {
    const target = normalizePath(path);
    const current = normalizePath(win.location.pathname);
    if (target === current && !replace) return;
    if (replace) {
      win.history.replaceState({}, '', target);
    } else {
      win.history.pushState({}, '', target);
    }
    refresh();
  }

  function onPopState() {
    refresh();
  }

  win.addEventListener('popstate', onPopState);

  function dispose() {
    win.removeEventListener('popstate', onPopState);
  }

  function useRoute() {
    return useStoreValue($route);
  }

  return { $route, navigate, dispose, useRoute };
}
