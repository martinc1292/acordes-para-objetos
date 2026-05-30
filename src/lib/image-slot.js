const STORAGE_PREFIX = 'atril.image-slot.';
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function storageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

function readSlot(id) {
  if (!id) return null;
  try {
    return window.localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
}

function writeSlot(id, value) {
  if (!id) return;
  try {
    if (value) window.localStorage.setItem(storageKey(id), value);
    else window.localStorage.removeItem(storageKey(id));
  } catch {
    // Ignore storage pressure or private-mode errors. The preview still works
    // for the current session because the element keeps the in-memory data.
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

class ImageSlot extends HTMLElement {
  static get observedAttributes() {
    return ['placeholder', 'id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.preview = '';
    this.render();
  }

  connectedCallback() {
    this.preview = readSlot(this.id) ?? '';
    this.addEventListener('dragenter', this);
    this.addEventListener('dragover', this);
    this.addEventListener('dragleave', this);
    this.addEventListener('drop', this);
    this.render();
  }

  disconnectedCallback() {
    this.removeEventListener('dragenter', this);
    this.removeEventListener('dragover', this);
    this.removeEventListener('dragleave', this);
    this.removeEventListener('drop', this);
  }

  attributeChangedCallback() {
    this.render();
  }

  handleEvent(event) {
    if (event.type === 'dragenter' || event.type === 'dragover') {
      event.preventDefault();
      this.setAttribute('data-over', '');
      return;
    }
    if (event.type === 'dragleave') {
      this.removeAttribute('data-over');
      return;
    }
    if (event.type === 'drop') {
      event.preventDefault();
      this.removeAttribute('data-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    }
  }

  async loadFile(file) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      this.setError('Usa PNG, JPEG, WebP o AVIF.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      this.preview = dataUrl;
      writeSlot(this.id, dataUrl);
      this.render();
    } catch {
      this.setError('No pudimos leer esa imagen.');
    }
  }

  setError(message) {
    this.error = message;
    this.render();
    window.setTimeout(() => {
      if (this.error === message) {
        this.error = '';
        this.render();
      }
    }, 2600);
  }

  clear() {
    this.preview = '';
    writeSlot(this.id, null);
    this.render();
  }

  render() {
    if (!this.shadowRoot) return;
    const placeholder = this.getAttribute('placeholder') || 'Agregar imagen';
    const safePlaceholder = escapeHtml(placeholder);
    const safePreview = this.preview.startsWith('data:image/') ? escapeHtml(this.preview) : '';
    const radius = Number.parseInt(this.getAttribute('radius') || '6', 10);
    const safeRadius = Number.isFinite(radius) ? radius : 6;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 220px;
          border-radius: ${safeRadius}px;
          color: var(--muted, #8a8580);
          font-family: var(--mono, ui-monospace, monospace);
        }

        .slot {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: inherit;
          overflow: hidden;
          border: 1.5px dashed var(--line, #2a2a2a);
          border-radius: inherit;
          background: var(--bg, #0f0f0f);
          display: grid;
          place-items: center;
          text-align: center;
        }

        :host([data-over]) .slot,
        .slot:hover {
          border-color: var(--accent, #ff5722);
          color: var(--accent, #ff5722);
        }

        .empty {
          display: grid;
          gap: 8px;
          justify-items: center;
          padding: 18px;
        }

        .plus {
          font-size: 2rem;
          line-height: 1;
        }

        .hint {
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        img {
          width: 100%;
          height: 100%;
          min-height: inherit;
          object-fit: cover;
          display: block;
        }

        input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .clear {
          position: absolute;
          right: 8px;
          top: 8px;
          border: 1px solid rgba(255,255,255,0.24);
          border-radius: 4px;
          background: rgba(0,0,0,0.68);
          color: #fff;
          padding: 5px 8px;
          font: 11px/1 var(--mono, ui-monospace, monospace);
          cursor: pointer;
          z-index: 2;
        }

        .error {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 8px;
          border-radius: 4px;
          background: rgba(127,29,29,0.9);
          color: #fff;
          padding: 6px 8px;
          font-size: 0.7rem;
          z-index: 3;
        }
      </style>
      <div class="slot">
        ${safePreview ? `<img src="${safePreview}" alt="${safePlaceholder}">` : `
          <div class="empty" aria-hidden="true">
            <span class="plus">+</span>
            <span class="hint">${safePlaceholder}</span>
          </div>
        `}
        <input type="file" accept="${Array.from(ACCEPTED_TYPES).join(',')}">
        ${this.preview ? '<button class="clear" type="button">Quitar</button>' : ''}
        ${this.error ? `<div class="error" role="alert">${escapeHtml(this.error)}</div>` : ''}
      </div>
    `;
    this.shadowRoot.querySelector('input')?.addEventListener('change', (event) => {
      const file = event.currentTarget.files?.[0];
      if (file) this.loadFile(file);
      event.currentTarget.value = '';
    });
    this.shadowRoot.querySelector('.clear')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.clear();
    });
  }
}

if (!customElements.get('image-slot')) {
  customElements.define('image-slot', ImageSlot);
}
