const routes = [];

export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

function matchRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';

  for (const { pattern, handler } of routes) {
    const keys = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    const match = path.match(new RegExp(`^${regexStr}$`));

    if (match) {
      const params = {};
      keys.forEach((key, i) => { params[key] = match[i + 1]; });
      return { handler, params };
    }
  }

  return null;
}

export function navigate(path) {
  window.location.hash = path;
}

export function startRouter() {
  function dispatch() {
    const matched = matchRoute(window.location.hash);
    if (matched) {
      matched.handler(matched.params);
    }
  }

  window.addEventListener('hashchange', dispatch);
  dispatch();

  return () => window.removeEventListener('hashchange', dispatch);
}
