import { render } from 'preact';
import { html } from 'htm/preact';
import { App } from './app.js';
import { exposeDevtools } from './devtools.js';
import './style.css';

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

exposeDevtools();
render(html`<${App} />`, root);
