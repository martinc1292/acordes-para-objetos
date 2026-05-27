import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';

export function RouteLoader({ load, props }) {
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    let active = true;
    load().then((mod) => {
      if (active) setComponent(() => mod.default ?? Object.values(mod)[0]);
    });
    return () => { active = false; };
  }, [load]);

  if (!Component) {
    return html`<main style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--muted);font-family:var(--mono);font-size:0.85rem;">...</main>`;
  }
  return html`<${Component} ...${props} />`;
}
