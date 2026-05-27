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

function normalizeLocation(path) {
  const raw = String(path ?? '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    throw new Error(`Invalid app path: ${raw}`);
  }
  const cut = raw.search(/[?#]/);
  const pathname = normalizePath(cut === -1 ? raw : raw.slice(0, cut));
  const suffix = cut === -1 ? '' : raw.slice(cut);
  return `${pathname}${suffix}`;
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

  const currentPath = () => `${win.location.pathname}${win.location.search}${win.location.hash}`;
  const $route = atom(buildRouteState(routes, currentPath()));

  function refresh() {
    $route.set(buildRouteState(routes, currentPath()));
  }

  function navigate(path, { replace = false } = {}) {
    const target = normalizeLocation(path);
    const current = normalizeLocation(currentPath());
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
