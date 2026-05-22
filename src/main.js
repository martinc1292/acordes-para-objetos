import './style.css';
import {
  addChatMessage,
  addSongComment,
  addSuggestion,
  createSong,
  deleteChatMessage,
  deleteSong,
  deleteSongComment,
  deleteSuggestion,
  getChatMessages,
  getPendingCount,
  getSongComments,
  getSongs,
  getSuggestions,
  processPendingQueue,
  subscribeToComments,
  subscribeToSongMeta,
  syncFromRemote,
  unsubscribe,
  updateSong,
  updateSongMeta
} from './lib/api.js';
import { isAdmin, login, logout, onAuthChange } from './lib/auth.js';
import {
  getBpm,
  isRunning,
  onMetronomeChange,
  parseTempo,
  resetTaps,
  setBpm,
  tap as metronomeTap,
  toggle as metronomeToggle
} from './lib/metronome.js';
import { dbPruneTombstones } from './lib/db.js';
import { navigate, route, startRouter } from './lib/router.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app">
    <div id="connectivity-bar" class="connectivity-bar connectivity-bar--hidden" aria-live="polite"></div>
    <div id="view"></div>
  </div>
  <div class="hint" id="install-hint" hidden>Instalá la app: compartir → Añadir a inicio</div>
  <button class="metro-fab" id="metro-fab" type="button" aria-label="Metrónomo" hidden>
    <span class="metro-fab-icon">♩</span>
    <span class="metro-fab-bpm" id="metro-fab-bpm"></span>
  </button>
  <div class="metro-float-panel" id="metro-float-panel" hidden></div>
  <div class="present-overlay" id="present-overlay" hidden></div>
  <div class="drawer-overlay" id="drawer-overlay" hidden></div>
  <nav class="drawer" id="drawer" aria-label="Menú" hidden>
    <div class="drawer-header">
      <div class="drawer-title">Sala &amp; Ensayo</div>
      <button class="drawer-close" id="drawer-close" type="button" aria-label="Cerrar menú">✕</button>
    </div>
    <ul class="drawer-nav">
      <li><a class="drawer-link" href="#/" id="dnav-setlist">🎵 Setlist</a></li>
      <li><a class="drawer-link" href="#/favoritos" id="dnav-favs">★ Favoritos</a></li>
      <li><a class="drawer-link" href="#/sugerencias" id="dnav-suggestions">+ Sugerencias</a></li>
      <li><a class="drawer-link" href="#/chat" id="dnav-chat">💬 Chat</a></li>
      <li><a class="drawer-link" href="#/admin" id="dnav-admin">Admin</a></li>
    </ul>
  </nav>
`;

// ── Conectividad ──────────────────────────────────────────────────────────────

const connectivityBar = document.querySelector('#connectivity-bar');

async function updateConnectivityBar() {
  const online = navigator.onLine;
  const pending = await getPendingCount();

  connectivityBar.className = online
    ? (pending > 0 ? 'connectivity-bar connectivity-bar--syncing' : 'connectivity-bar connectivity-bar--online')
    : 'connectivity-bar connectivity-bar--offline';

  if (!online) {
    connectivityBar.textContent = 'Sin conexión — los cambios se guardarán localmente';
    connectivityBar.classList.remove('connectivity-bar--hidden');
  } else if (pending > 0) {
    connectivityBar.textContent = `Sincronizando ${pending} cambio${pending === 1 ? '' : 's'}...`;
    connectivityBar.classList.remove('connectivity-bar--hidden');
  } else {
    connectivityBar.classList.add('connectivity-bar--hidden');
  }
}

window.addEventListener('online', async () => {
  await processPendingQueue();
  await syncFromRemote().catch(() => {});
  await updateConnectivityBar();
});

window.addEventListener('offline', () => {
  updateConnectivityBar();
});

// Actualiza el badge cada 30 segundos si hay pendientes
setInterval(async () => {
  const pending = await getPendingCount();
  if (pending > 0) updateConnectivityBar();
}, 30_000);

// ── Prompt de instalación PWA ─────────────────────────────────────────────────

let deferredInstallPrompt = null;
const installHint = document.querySelector('#install-hint');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installHint.hidden = false;
  installHint.style.cursor = 'pointer';
  installHint.textContent = 'Instalá la app en tu celular — tocá aquí';
  installHint.addEventListener('click', () => {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      installHint.hidden = true;
    });
  }, { once: true });
});

window.addEventListener('appinstalled', () => {
  installHint.hidden = true;
});

const view = document.querySelector('#view');

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'rehearsing', label: 'Ensayando' },
  { value: 'ready', label: 'Lista' }
];
const COMMENT_COLORS = [
  { value: 'yellow', label: 'Amarillo' },
  { value: 'pink', label: 'Rosa' },
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'orange', label: 'Naranja' }
];
const AUTHOR_STORAGE_KEY = 'setlist-comment-author';

let songs = [];
let currentSongId = null;
let currentComments = [];
let commentsState = 'idle';
let adminMode = false;
let realtimeMetaChannel = null;
let realtimeCommentsChannel = null;
let realtimeChatChannel = null;
let presentMode = false;
let chatMessages = [];
let chatState = 'idle';

// ─── Metrónomo ───────────────────────────────────────────────────────────────

function renderMetronomeHtml(bpm, running) {
  return `
    <div class="metro-section" id="metro-section">
      <div class="section-label">Metrónomo</div>
      <div class="metro-panel">
        <div class="metro-controls">
          <button class="metro-toggle" id="metro-toggle" type="button">
            ${running ? '⏹ Stop' : '▶ Play'}
          </button>
          <div class="metro-bpm-display">
            <button class="metro-adj" id="metro-minus" type="button" aria-label="Bajar BPM">−</button>
            <div class="metro-bpm-value" id="metro-bpm-value">${bpm}</div>
            <button class="metro-adj" id="metro-plus" type="button" aria-label="Subir BPM">+</button>
          </div>
          <button class="metro-tap" id="metro-tap" type="button">Tap</button>
        </div>
        <input
          class="metro-slider"
          id="metro-slider"
          type="range"
          min="20" max="300"
          value="${bpm}"
          aria-label="BPM"
        />
        <div class="metro-labels">
          <span>20</span><span>BPM</span><span>300</span>
        </div>
      </div>
    </div>
  `;
}

function attachMetronomeHandlers(container) {
  const toggle = container.querySelector('#metro-toggle');
  const minus = container.querySelector('#metro-minus');
  const plus = container.querySelector('#metro-plus');
  const tapBtn = container.querySelector('#metro-tap');
  const slider = container.querySelector('#metro-slider');

  toggle?.addEventListener('click', () => { metronomeToggle(); });
  minus?.addEventListener('click', () => { setBpm(getBpm() - 1); });
  plus?.addEventListener('click', () => { setBpm(getBpm() + 1); });
  tapBtn?.addEventListener('click', () => { metronomeTap(); });
  slider?.addEventListener('input', (e) => { resetTaps(); setBpm(Number(e.target.value)); });
}

function syncMetronomeUI(bpm, running) {
  // Actualiza todos los paneles de metrónomo en la página sin re-renderizar
  document.querySelectorAll('#metro-toggle').forEach((el) => {
    el.textContent = running ? '⏹ Stop' : '▶ Play';
    el.closest('.metro-panel')?.classList.toggle('metro-panel--running', running);
  });
  document.querySelectorAll('#metro-bpm-value').forEach((el) => { el.textContent = bpm; });
  document.querySelectorAll('#metro-slider').forEach((el) => { el.value = bpm; });
  document.querySelectorAll('#metro-fab-bpm').forEach((el) => { el.textContent = running ? `${bpm}` : ''; });
  document.querySelectorAll('.metro-fab').forEach((el) => {
    el.classList.toggle('metro-fab--running', running);
  });
  // Panel flotante si está abierto
  const floatPanel = document.querySelector('#metro-float-panel');
  if (floatPanel && !floatPanel.hidden) renderFloatPanel();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  if (!value) return '';

  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function highlightChords(progression) {
  return escapeHtml(progression).replace(
    /\b([A-G][#b]?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G][#b]?)?)\b/g,
    '<span class="chord">$1</span>'
  );
}

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label || 'Pendiente';
}

function getStoredAuthor() {
  try { return localStorage.getItem(AUTHOR_STORAGE_KEY) || ''; } catch { return ''; }
}

function setStoredAuthor(author) {
  try { localStorage.setItem(AUTHOR_STORAGE_KEY, author); } catch { /* private context */ }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

function openDrawer() {
  document.querySelector('#drawer').hidden = false;
  document.querySelector('#drawer-overlay').hidden = false;
  document.querySelector('#drawer').querySelector('a').focus();
}

function closeDrawer() {
  document.querySelector('#drawer').hidden = true;
  document.querySelector('#drawer-overlay').hidden = true;
}

function initDrawer() {
  document.querySelector('#drawer-close').addEventListener('click', closeDrawer);
  document.querySelector('#drawer-overlay').addEventListener('click', closeDrawer);
  document.querySelector('#drawer').addEventListener('click', (e) => {
    if (e.target.closest('.drawer-link')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('#drawer').hidden) closeDrawer();
  });
}

// ─── Vista Lista ─────────────────────────────────────────────────────────────

function renderListView(filter = '') {
  const normalizedFilter = filter.toLowerCase().trim();
  const filtered = songs.filter((s) =>
    s.title.toLowerCase().includes(normalizedFilter) ||
    s.artist.toLowerCase().includes(normalizedFilter)
  );

  const adminLink = `<a class="admin-link" href="#/admin">${adminMode ? 'Admin' : 'Entrar'}</a>`;

  const suggestBtn = `
    <div class="list-cta-row">
      <button class="suggest-btn" id="suggest-btn" type="button">+ Sugerir canción</button>
      <button class="create-song-btn" id="create-song-btn" type="button">+ Agregar canción</button>
    </div>
  `;

  const items = filtered.map((song) => {
    const status = song.meta?.status || 'pending';
    const favorite = song.meta?.isFavorite;
    return `
      <li class="song-item" data-id="${escapeHtml(song.id)}" tabindex="0">
        <div class="song-num">${String(filtered.indexOf(song) + 1).padStart(2, '0')}</div>
        <div class="song-info">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div class="song-tags">
          ${favorite ? '<div class="song-favorite" aria-label="Favorita">★</div>' : ''}
          <div class="song-status status-${escapeHtml(status)}">${escapeHtml(getStatusLabel(status))}</div>
          <div class="song-key">${escapeHtml(song.key)}</div>
        </div>
        ${adminMode ? `
          <div class="song-row-actions">
            <button class="item-edit-btn" data-id="${escapeHtml(song.id)}" type="button">Editar</button>
            <button class="item-delete-btn" data-id="${escapeHtml(song.id)}" aria-label="Eliminar canción" title="Eliminar">✕</button>
          </div>
        ` : ''}
      </li>
    `;
  }).join('');

  view.innerHTML = `
    <header>
      <div class="header-row">
        <button class="hamburger-btn" id="hamburger-btn" type="button" aria-label="Abrir menú">☰</button>
        <div class="eyebrow">Setlist</div>
        <div class="header-actions">
          ${adminLink}
        </div>
      </div>
      <h1>Sala <span class="ampersand">&amp;</span> Ensayo</h1>
      <div class="subtitle">Letras · acordes · tabs · notas</div>
    </header>

    ${suggestBtn}

    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input
        id="search"
        class="search"
        type="search"
        placeholder="buscar canción o artista..."
        autocomplete="off"
        value="${escapeHtml(filter)}"
      />
    </div>

    <div class="count" id="count">${filtered.length} canci${filtered.length === 1 ? 'ón' : 'ones'}</div>
    <ol class="songs" id="song-list">${items || '<div class="empty">Sin resultados</div>'}</ol>
  `;

  const searchInput = view.querySelector('#search');
  searchInput.addEventListener('input', (e) => renderListView(e.target.value));
  searchInput.focus({ preventScroll: true });

  view.querySelector('#song-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.item-edit-btn');
    if (editBtn) {
      e.stopPropagation();
      openEditSongModal(editBtn.dataset.id, {
        onSaved: () => renderListView(view.querySelector('#search')?.value || '')
      });
      return;
    }

    const deleteBtn = e.target.closest('.item-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.id;
      const song = songs.find((s) => s.id === id);
      if (!song) return;
      if (!confirm(`¿Eliminar "${song.title}" del setlist?`)) return;
      deleteBtn.disabled = true;
      songs = songs.filter((s) => s.id !== id);
      renderListView(view.querySelector('#search')?.value || '');
      try {
        await deleteSong(id);
      } catch {
        songs = await getSongs();
        renderListView(view.querySelector('#search')?.value || '');
      }
      return;
    }
    const item = e.target.closest('.song-item');
    if (item) navigate(`/song/${item.dataset.id}`);
  });

  view.querySelector('#song-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.song-item');
    if (item) { e.preventDefault(); navigate(`/song/${item.dataset.id}`); }
  });

  view.querySelector('#suggest-btn').addEventListener('click', () => {
    openSuggestModal();
  });
  view.querySelector('#create-song-btn').addEventListener('click', () => {
    openCreateSongModal();
  });
  view.querySelector('#hamburger-btn').addEventListener('click', openDrawer);
}

function renderListLoading() {
  view.innerHTML = `
    <header>
      <div class="eyebrow">Setlist</div>
      <h1>Sala <span class="ampersand">&amp;</span> Ensayo</h1>
    </header>
    <div class="count">Cargando repertorio</div>
    <div class="empty">Cargando canciones...</div>
  `;
}

function renderListError(error) {
  view.innerHTML = `
    <div class="empty">
      No se pudo cargar el repertorio.<br>${escapeHtml(error.message)}
    </div>
  `;
}

// ─── Vista Detalle ───────────────────────────────────────────────────────────

function renderCommentsHtml(comments, state) {
  if (state === 'loading') return '<div class="comments-empty">Cargando comentarios...</div>';
  if (state === 'error') return '<div class="comments-empty comments-empty--error">No se pudieron cargar los comentarios.</div>';
  if (comments.length === 0) return '<div class="comments-empty">Sin comentarios todavía</div>';

  const myAuthor = getStoredAuthor();

  return comments.map((c) => {
    const canDelete = myAuthor && myAuthor === c.author;
    return `
    <article class="comment comment-${escapeHtml(c.color)}" data-comment-id="${escapeHtml(c.id)}">
      <div class="comment-meta">
        <span>${escapeHtml(c.author)}</span>
        <time>${escapeHtml(formatDate(c.createdAt))}</time>
        ${canDelete ? `<button class="comment-delete-btn" data-id="${escapeHtml(c.id)}" type="button" aria-label="Borrar comentario">✕</button>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
    </article>
  `;
  }).join('');
}

function renderCollabHtml(song, comments, state, feedback = '') {
  const status = song.meta?.status || 'pending';
  const isFavorite = Boolean(song.meta?.isFavorite);
  const author = getStoredAuthor();

  const statusOptions = STATUS_OPTIONS.map((o) =>
    `<option value="${o.value}" ${o.value === status ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  const colorOptions = COMMENT_COLORS.map((c, i) => `
    <label class="color-swatch color-${c.value}" title="${escapeHtml(c.label)}">
      <input type="radio" name="color" value="${c.value}" ${i === 0 ? 'checked' : ''} />
      <span>${escapeHtml(c.label)}</span>
    </label>
  `).join('');

  return `
    <div class="section">
      <div class="section-label">Ensayo compartido</div>
      <div class="collab-panel">
        <div class="collab-toolbar">
          <button class="favorite-btn ${isFavorite ? 'is-active' : ''}" id="favorite-btn" type="button"
            aria-pressed="${isFavorite}" title="${isFavorite ? 'Quitar favorita' : 'Marcar favorita'}">
            <span class="favorite-symbol">${isFavorite ? '★' : '☆'}</span>
            <span>Favorita</span>
          </button>
          <label class="status-control">
            <span>Estado</span>
            <select id="status-select">${statusOptions}</select>
          </label>
        </div>
        <div class="collab-feedback" id="collab-feedback" role="status">${escapeHtml(feedback)}</div>
        <div class="comments-head">
          <div>Comentarios</div><span>${comments.length}</span>
        </div>
        <div class="comments-list" id="comments-list">${renderCommentsHtml(comments, state)}</div>
        <form class="comment-form" id="comment-form">
          <div class="comment-row">
            <input class="comment-author" name="author" type="text" placeholder="Nombre"
              autocomplete="name" value="${escapeHtml(author)}" />
            <div class="comment-colors" aria-label="Color del comentario">${colorOptions}</div>
          </div>
          <textarea class="comment-input" name="text" rows="3"
            placeholder="Comentario de ensayo..." required></textarea>
          <button class="comment-submit" type="submit">Agregar comentario</button>
        </form>
      </div>
    </div>
  `;
}

function renderSongView(song, options = {}) {
  const comments = options.comments ?? currentComments;
  const state = options.commentsState ?? commentsState;
  const feedback = options.feedback ?? '';

  const tabsHtml = song.tabs.length > 0
    ? song.tabs.map((t) => `
        <div class="tab-title">${escapeHtml(t.title)}</div>
        <div class="tabs-block">${escapeHtml(t.tab)}</div>
      `).join('')
    : '<div class="lyrics-placeholder">Sin tabs cargadas</div>';

  const lyricsHtml = song.lyrics.trim()
    ? `<div class="lyrics-block">${escapeHtml(song.lyrics)}</div>`
    : '<div class="lyrics-placeholder">Pegá la letra en src/data/songs.js cuando esté lista.</div>';

  view.innerHTML = `
    <div class="song-action-bar">
      <button class="back-btn" id="back-btn">← Volver al setlist</button>
      <div class="song-action-actions">
        ${adminMode ? `<button class="edit-song-btn" id="edit-song-btn" type="button">Editar canción</button>` : ''}
        <button class="present-btn" id="present-btn" type="button">⛶ Presentar</button>
      </div>
    </div>
    <div class="song-header">
      <h2>${escapeHtml(song.title)}</h2>
      <div class="song-meta">
        <span>${escapeHtml(song.artist)}</span>
        <span class="dot"></span>
        <span class="key-tag">${escapeHtml(song.key)}</span>
        ${song.tempo ? `<span class="dot"></span><span>${escapeHtml(song.tempo)}</span>` : ''}
      </div>
    </div>

    ${renderMetronomeHtml(getBpm(), isRunning())}

    ${song.structure ? `
      <div class="section">
        <div class="section-label">Estructura</div>
        <div class="structure">${escapeHtml(song.structure)}</div>
      </div>` : ''}

    ${song.progression ? `
      <div class="section">
        <div class="section-label">Progresión</div>
        <div class="chords-block">${highlightChords(song.progression)}</div>
      </div>` : ''}

    <div class="section">
      <div class="section-label">Tabs / Riffs</div>
      ${tabsHtml}
    </div>

    <div class="section">
      <div class="section-label">
        Letra
        ${adminMode ? `<button class="edit-lyrics-btn" id="edit-lyrics-btn" type="button">Editar letra</button>` : ''}
      </div>
      ${lyricsHtml}
    </div>

    ${song.notes ? `
      <div class="section">
        <div class="section-label">Notas</div>
        <div class="notes-block">${escapeHtml(song.notes)}</div>
      </div>` : ''}

    ${renderCollabHtml(song, comments, state, feedback)}
  `;

  view.querySelector('#back-btn').addEventListener('click', () => navigate('/'));
  view.querySelector('#present-btn').addEventListener('click', () => openPresentMode(song));
  view.querySelector('#edit-song-btn')?.addEventListener('click', () => {
    openEditSongModal(song.id, {
      onSaved: (updatedSong) => {
        if (currentSongId === song.id && updatedSong) {
          setBpm(parseTempo(updatedSong.tempo));
          renderSongView(updatedSong);
        }
      }
    });
  });
  view.querySelector('#edit-lyrics-btn')?.addEventListener('click', () => openEditLyricsModal(song));
  view.querySelector('#favorite-btn').addEventListener('click', handleFavoriteToggle);
  view.querySelector('#status-select').addEventListener('change', handleStatusChange);
  view.querySelector('#comment-form').addEventListener('submit', handleCommentSubmit);
  view.querySelector('#comments-list').addEventListener('click', handleCommentDelete);

  attachMetronomeHandlers(view);

  // Muestra el FAB flotante
  const fab = document.querySelector('#metro-fab');
  if (fab) {
    fab.hidden = false;
    document.querySelector('#metro-fab-bpm').textContent = isRunning() ? `${getBpm()}` : '';
    fab.classList.toggle('metro-fab--running', isRunning());
  }
}

function getSongById(id) {
  return songs.find((s) => s.id === id) || null;
}

function teardownRealtimeChannels() {
  unsubscribe(realtimeMetaChannel);
  unsubscribe(realtimeCommentsChannel);
  if (realtimeChatChannel) clearInterval(realtimeChatChannel);
  realtimeMetaChannel = null;
  realtimeCommentsChannel = null;
  realtimeChatChannel = null;
}

async function loadSongView(id) {
  const song = getSongById(id);
  if (!song) { navigate('/'); return; }

  teardownRealtimeChannels();

  currentSongId = id;
  currentComments = [];
  commentsState = 'loading';
  window.scrollTo(0, 0);
  // Ajusta el BPM al tempo de la canción solo al cargarla, no en cada re-render
  setBpm(parseTempo(song.tempo));
  renderSongView(song);

  try {
    const comments = await getSongComments(song.id);
    if (currentSongId !== id) return;
    currentComments = comments;
    commentsState = 'loaded';
    renderSongView(song);
  } catch {
    if (currentSongId !== id) return;
    currentComments = [];
    commentsState = 'error';
    renderSongView(song);
  }

  realtimeMetaChannel = subscribeToSongMeta(song.id, (updatedMeta) => {
    const s = getSongById(currentSongId);
    if (!s || currentSongId !== id) return;
    s.meta = updatedMeta;
    renderSongView(s);
  });

  realtimeCommentsChannel = subscribeToComments(song.id, (newComment) => {
    if (currentSongId !== id) return;
    // Reemplaza un comentario local optimista con el mismo texto+autor, o ignora si ya existe
    const localIdx = currentComments.findIndex(
      (c) => c.id.startsWith('local-') && c.text === newComment.text && c.author === newComment.author
    );
    if (localIdx !== -1) {
      currentComments = [
        ...currentComments.slice(0, localIdx),
        newComment,
        ...currentComments.slice(localIdx + 1)
      ];
    } else if (!currentComments.some((c) => c.id === newComment.id)) {
      currentComments = [...currentComments, newComment];
    } else {
      return;
    }
    commentsState = 'loaded';
    const s = getSongById(currentSongId);
    if (s) renderSongView(s);
  });
}

function showCollabFeedback(message) {
  const el = view.querySelector('#collab-feedback');
  if (el) el.textContent = message;
}

async function handleFavoriteToggle(event) {
  const song = getSongById(currentSongId);
  if (!song) return;
  const previousMeta = { ...song.meta };
  const nextFavorite = !previousMeta.isFavorite;
  event.currentTarget.disabled = true;
  song.meta = { ...previousMeta, isFavorite: nextFavorite };
  renderSongView(song);

  try {
    song.meta = await updateSongMeta(song.id, { isFavorite: nextFavorite, status: previousMeta.status });
    renderSongView(song);
  } catch {
    song.meta = previousMeta;
    renderSongView(song, { feedback: 'No se pudo actualizar favorita.' });
  }
}

async function handleStatusChange(event) {
  const song = getSongById(currentSongId);
  if (!song) return;
  const previousMeta = { ...song.meta };
  const nextStatus = event.target.value;
  event.target.disabled = true;
  song.meta = { ...previousMeta, status: nextStatus };
  renderSongView(song);

  try {
    song.meta = await updateSongMeta(song.id, { isFavorite: previousMeta.isFavorite, status: nextStatus });
    renderSongView(song);
  } catch {
    song.meta = previousMeta;
    renderSongView(song, { feedback: 'No se pudo actualizar el estado.' });
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();
  const song = getSongById(currentSongId);
  if (!song) return;
  const form = event.currentTarget;
  const formData = new FormData(form);
  const author = String(formData.get('author') || '').trim();
  const text = String(formData.get('text') || '').trim();
  const color = String(formData.get('color') || 'yellow');

  if (!text) { showCollabFeedback('El comentario no puede estar vacío.'); return; }

  form.querySelector('button[type="submit"]').disabled = true;
  setStoredAuthor(author);

  try {
    const comment = await addSongComment(song.id, { author, text, color });
    currentComments = [...currentComments, comment];
    commentsState = 'loaded';
    renderSongView(song);
  } catch {
    showCollabFeedback('No se pudo guardar el comentario.');
    form.querySelector('button[type="submit"]').disabled = false;
  }
}

async function handleCommentDelete(event) {
  const btn = event.target.closest('.comment-delete-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const song = getSongById(currentSongId);
  if (!song) return;
  btn.disabled = true;
  currentComments = currentComments.filter((c) => c.id !== id);
  const s = getSongById(currentSongId);
  if (s) renderSongView(s);
  try {
    await deleteSongComment(id);
  } catch {
    showCollabFeedback('No se pudo borrar el comentario.');
  }
}

// ─── Modal Sugerir Canción ───────────────────────────────────────────────────

function openSuggestModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Sugerir canción">
      <div class="modal-header">
        <div class="modal-title">Sugerir canción</div>
        <button class="modal-close" id="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <form class="modal-form" id="suggest-form">
        <label class="field-label">Título <input class="field-input" name="title" type="text" required placeholder="Hey Jude" /></label>
        <label class="field-label">Artista <input class="field-input" name="artist" type="text" required placeholder="The Beatles" /></label>
        <label class="field-label">Tu nombre <input class="field-input" name="suggestedBy" type="text" placeholder="Martín" /></label>
        <label class="field-label">Notas <textarea class="field-input" name="notes" rows="2" placeholder="Por qué la incluirías..."></textarea></label>
        <div class="modal-feedback" id="modal-feedback"></div>
        <button class="comment-submit" type="submit">Enviar sugerencia</button>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#suggest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const feedback = overlay.querySelector('#modal-feedback');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      await addSuggestion({
        title: String(fd.get('title') || ''),
        artist: String(fd.get('artist') || ''),
        suggestedBy: String(fd.get('suggestedBy') || ''),
        notes: String(fd.get('notes') || '')
      });
      feedback.textContent = '¡Sugerencia enviada!';
      feedback.className = 'modal-feedback modal-feedback--ok';
      setTimeout(() => overlay.remove(), 1200);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'modal-feedback modal-feedback--error';
      btn.disabled = false;
    }
  });
}

// ─── Modal Crear Canción (público) ────────────────────────────────────────────

function openCreateSongModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-label="Agregar canción">
      <div class="modal-header">
        <div class="modal-title">Agregar canción al setlist</div>
        <button class="modal-close" id="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <form class="modal-form" id="create-song-form">
        <div class="admin-form-grid">
          <label class="field-label">Título * <input class="field-input" name="title" type="text" required placeholder="Hey Jude" /></label>
          <label class="field-label">Artista * <input class="field-input" name="artist" type="text" required placeholder="The Beatles" /></label>
          <label class="field-label">Tonalidad <input class="field-input" name="key" type="text" placeholder="Am" /></label>
          <label class="field-label">Tempo <input class="field-input" name="tempo" type="text" placeholder="120 bpm" /></label>
        </div>
        <label class="field-label">Estructura <input class="field-input" name="structure" type="text" placeholder="Intro - Verso - Coro..." /></label>
        <label class="field-label">Progresión <input class="field-input" name="progression" type="text" placeholder="Am - G - F - E" /></label>
        <label class="field-label">Letra <textarea class="field-input" name="lyrics" rows="5" placeholder="Pegá la letra acá..."></textarea></label>
        <label class="field-label">Notas <textarea class="field-input" name="notes" rows="2" placeholder="Referencias, links, observaciones..."></textarea></label>
        <div class="modal-feedback" id="modal-feedback"></div>
        <div class="admin-form-actions">
          <button class="comment-submit" type="submit">Agregar canción</button>
          <button class="admin-cancel" id="cancel-create" type="button">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#cancel-create').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#create-song-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const feedback = overlay.querySelector('#modal-feedback');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      await createSong({
        title: String(fd.get('title') || ''),
        artist: String(fd.get('artist') || ''),
        key: String(fd.get('key') || ''),
        tempo: String(fd.get('tempo') || ''),
        structure: String(fd.get('structure') || ''),
        progression: String(fd.get('progression') || ''),
        lyrics: String(fd.get('lyrics') || ''),
        notes: String(fd.get('notes') || ''),
        tabs: [],
        sortOrder: songs.length
      });
      songs = await getSongs();
      feedback.textContent = '¡Canción agregada al setlist!';
      feedback.className = 'modal-feedback modal-feedback--ok';
      setTimeout(() => {
        close();
        renderListView();
      }, 1200);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'modal-feedback modal-feedback--error';
      btn.disabled = false;
    }
  });
}

// ─── Modal Editar Letra ───────────────────────────────────────────────────────

function openEditLyricsModal(song) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-label="Editar letra">
      <div class="modal-header">
        <div class="modal-title">Editar letra: ${escapeHtml(song.title)}</div>
        <button class="modal-close" id="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <form class="modal-form" id="edit-lyrics-form">
        <label class="field-label">
          Letra
          <textarea class="field-input" name="lyrics" rows="16" placeholder="Pegá la letra acá...">${escapeHtml(song.lyrics)}</textarea>
        </label>
        <div class="modal-feedback" id="modal-feedback"></div>
        <div class="admin-form-actions">
          <button class="comment-submit" type="submit">Guardar letra</button>
          <button class="admin-cancel" id="cancel-lyrics" type="button">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#cancel-lyrics').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#edit-lyrics-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const lyrics = String(new FormData(form).get('lyrics') || '');
    const btn = form.querySelector('button[type="submit"]');
    const feedback = overlay.querySelector('#modal-feedback');
    btn.disabled = true;

    try {
      await updateSong(song.id, { lyrics });
      song.lyrics = lyrics;
      songs = songs.map((s) => s.id === song.id ? { ...s, lyrics } : s);
      close();
      renderSongView(song);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'modal-feedback modal-feedback--error';
      btn.disabled = false;
    }
  });
}

// ─── Vista Admin ─────────────────────────────────────────────────────────────

function songFormHtml(song = null) {
  const v = (field) => escapeHtml(song?.[field] ?? '');
  return `
    <form class="admin-form" id="song-form">
      <div class="admin-form-grid">
        <label class="field-label">Título * <input class="field-input" name="title" type="text" required value="${v('title')}" /></label>
        <label class="field-label">Artista * <input class="field-input" name="artist" type="text" required value="${v('artist')}" /></label>
        <label class="field-label">Tonalidad <input class="field-input" name="key" type="text" value="${v('key')}" /></label>
        <label class="field-label">Tempo <input class="field-input" name="tempo" type="text" value="${v('tempo')}" /></label>
      </div>
      <label class="field-label">Estructura <input class="field-input" name="structure" type="text" value="${v('structure')}" /></label>
      <label class="field-label">Progresión <input class="field-input" name="progression" type="text" value="${v('progression')}" /></label>
      <label class="field-label">Letra <textarea class="field-input" name="lyrics" rows="6">${v('lyrics')}</textarea></label>
      <label class="field-label">Notas <textarea class="field-input" name="notes" rows="3">${v('notes')}</textarea></label>
      <div class="admin-form-actions">
        <button class="comment-submit" type="submit">${song ? 'Guardar cambios' : 'Crear canción'}</button>
        <button class="admin-cancel" id="cancel-form" type="button">Cancelar</button>
      </div>
      <div class="admin-form-feedback" id="form-feedback"></div>
    </form>
  `;
}

async function renderAdminView() {
  const admin = await isAdmin();

  if (!admin) {
    renderLoginView();
    return;
  }

  adminMode = true;

  const suggestionsHtml = await renderSuggestionsSection();

  view.innerHTML = `
    <div class="admin-header">
      <a class="back-btn" href="#/">← Setlist</a>
      <button class="admin-logout" id="logout-btn" type="button">Cerrar sesión</button>
    </div>
    <h2 class="admin-title">Panel admin</h2>

    <div class="section">
      <div class="section-label">Nueva canción</div>
      ${songFormHtml()}
    </div>

    <div class="section">
      <div class="section-label">Canciones (${songs.length})</div>
      <div class="admin-table-wrap">
        <table class="admin-table" id="songs-table">
          <thead><tr>
            <th>Título</th><th>Artista</th><th>Ton.</th><th></th>
          </tr></thead>
          <tbody>
            ${songs.map((s) => `
              <tr data-id="${escapeHtml(s.id)}">
                <td>${escapeHtml(s.title)}</td>
                <td>${escapeHtml(s.artist)}</td>
                <td>${escapeHtml(s.key)}</td>
                <td class="admin-actions">
                  <button class="admin-edit-btn" data-id="${escapeHtml(s.id)}" type="button">Editar</button>
                  <button class="admin-delete-btn" data-id="${escapeHtml(s.id)}" type="button">Borrar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${suggestionsHtml}
  `;

  attachAdminHandlers();
}

async function renderSuggestionsSection() {
  try {
    const suggestions = await getSuggestions();
    if (suggestions.length === 0) return '';

    const rows = suggestions.map((s) => `
      <tr>
        <td>${escapeHtml(s.title)}</td>
        <td>${escapeHtml(s.artist)}</td>
        <td>${escapeHtml(s.suggestedBy)}</td>
        <td><span class="suggestion-status">${escapeHtml(s.status)}</span></td>
      </tr>
    `).join('');

    return `
      <div class="section">
        <div class="section-label">Sugerencias</div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Título</th><th>Artista</th><th>Por</th><th>Estado</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch {
    return '';
  }
}

function attachAdminHandlers() {
  view.querySelector('#logout-btn').addEventListener('click', async () => {
    await logout();
    adminMode = false;
    renderLoginView();
  });

  const form = view.querySelector('#song-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    const feedback = view.querySelector('#form-feedback');
    btn.disabled = true;

    try {
      const data = {
        title: String(fd.get('title') || ''),
        artist: String(fd.get('artist') || ''),
        key: String(fd.get('key') || ''),
        tempo: String(fd.get('tempo') || ''),
        structure: String(fd.get('structure') || ''),
        progression: String(fd.get('progression') || ''),
        lyrics: String(fd.get('lyrics') || ''),
        notes: String(fd.get('notes') || ''),
        tabs: [],
        sortOrder: songs.length
      };
      await createSong(data);
      songs = await getSongs();
      renderAdminView();
    } catch (err) {
      feedback.textContent = err.message;
      btn.disabled = false;
    }
  });

  view.querySelector('#songs-table').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.admin-edit-btn');
    const deleteBtn = e.target.closest('.admin-delete-btn');

    if (editBtn) {
      openEditSongModal(editBtn.dataset.id, { onSaved: renderAdminView });
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const song = getSongById(id);
      if (!song) return;
      if (!confirm(`¿Borrar "${song.title}"?`)) return;

      try {
        await deleteSong(id);
        songs = songs.filter((s) => s.id !== id);
        renderAdminView();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    }
  });
}

function openEditSongModal(id, options = {}) {
  const song = getSongById(id);
  if (!song) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Editar: ${escapeHtml(song.title)}</div>
        <button class="modal-close" id="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      ${songFormHtml(song)}
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#cancel-form').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#song-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    const feedback = overlay.querySelector('#form-feedback');
    btn.disabled = true;

    try {
      const data = {
        title: String(fd.get('title') || ''),
        artist: String(fd.get('artist') || ''),
        key: String(fd.get('key') || ''),
        tempo: String(fd.get('tempo') || ''),
        structure: String(fd.get('structure') || ''),
        progression: String(fd.get('progression') || ''),
        lyrics: String(fd.get('lyrics') || ''),
        notes: String(fd.get('notes') || '')
      };
      await updateSong(id, data);
      songs = await getSongs();
      const updatedSong = getSongById(id) || { ...song, ...data };
      overlay.remove();
      if (typeof options.onSaved === 'function') {
        options.onSaved(updatedSong);
      } else {
        renderAdminView();
      }
    } catch (err) {
      feedback.textContent = err.message;
      btn.disabled = false;
    }
  });
}

// ─── Vista Login ─────────────────────────────────────────────────────────────

function renderLoginView() {
  view.innerHTML = `
    <a class="back-btn" href="#/">← Setlist</a>
    <h2 class="admin-title">Acceso admin</h2>
    <form class="login-form" id="login-form">
      <label class="field-label">Email
        <input class="field-input" name="email" type="email" required autocomplete="username" />
      </label>
      <label class="field-label">Contraseña
        <input class="field-input" name="password" type="password" required autocomplete="current-password" />
      </label>
      <div class="login-feedback" id="login-feedback"></div>
      <button class="comment-submit" type="submit">Entrar</button>
    </form>
  `;

  view.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    const feedback = view.querySelector('#login-feedback');
    btn.disabled = true;

    try {
      await login(String(fd.get('email') || ''), String(fd.get('password') || ''));
      adminMode = true;
      renderAdminView();
    } catch (err) {
      feedback.textContent = err.message;
      btn.disabled = false;
    }
  });
}

// ─── Metrónomo flotante ───────────────────────────────────────────────────────

function renderFloatPanel() {
  const panel = document.querySelector('#metro-float-panel');
  if (!panel) return;
  const bpm = getBpm();
  const running = isRunning();
  panel.innerHTML = `
    <div class="metro-float-inner">
      <div class="metro-float-header">
        <span class="metro-float-title">Metrónomo</span>
        <button class="metro-float-close" id="metro-float-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="metro-panel metro-panel--float">
        <div class="metro-controls">
          <button class="metro-toggle" id="metro-toggle" type="button">
            ${running ? '⏹ Stop' : '▶ Play'}
          </button>
          <div class="metro-bpm-display">
            <button class="metro-adj" id="metro-minus" type="button" aria-label="Bajar BPM">−</button>
            <div class="metro-bpm-value" id="metro-bpm-value">${bpm}</div>
            <button class="metro-adj" id="metro-plus" type="button" aria-label="Subir BPM">+</button>
          </div>
          <button class="metro-tap" id="metro-tap" type="button">Tap</button>
        </div>
        <input class="metro-slider" id="metro-slider" type="range" min="20" max="300" value="${bpm}" aria-label="BPM" />
        <div class="metro-labels"><span>20</span><span>BPM</span><span>300</span></div>
      </div>
    </div>
  `;
  panel.hidden = false;
  attachMetronomeHandlers(panel);
  panel.querySelector('#metro-float-close').addEventListener('click', () => { panel.hidden = true; });
}

function initMetronomeFloat() {
  const fab = document.querySelector('#metro-fab');
  const panel = document.querySelector('#metro-float-panel');
  if (!fab || !panel) return;

  fab.addEventListener('click', () => {
    if (panel.hidden) {
      renderFloatPanel();
    } else {
      panel.hidden = true;
    }
  });

  // Cierra el panel al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      panel.hidden = true;
    }
  });
}

// Oculta el FAB cuando el usuario vuelve al listado
function hideFab() {
  const fab = document.querySelector('#metro-fab');
  if (fab) fab.hidden = true;
  const panel = document.querySelector('#metro-float-panel');
  if (panel) panel.hidden = true;
}

// ─── Modo presentación ────────────────────────────────────────────────────────

function openPresentMode(song) {
  const overlay = document.querySelector('#present-overlay');
  if (!overlay) return;

  const lyricsHtml = song.lyrics.trim()
    ? `<div class="present-lyrics">${escapeHtml(song.lyrics)}</div>`
    : `<div class="present-lyrics present-lyrics--empty">Sin letra cargada todavía.</div>`;

  overlay.innerHTML = `
    <div class="present-header">
      <div class="present-song-info">
        <span class="present-title">${escapeHtml(song.title)}</span>
        <span class="present-artist">${escapeHtml(song.artist)}</span>
        ${song.key ? `<span class="present-key">${escapeHtml(song.key)}</span>` : ''}
      </div>
      <button class="present-close" id="present-close" type="button" aria-label="Cerrar presentación">✕ Cerrar</button>
    </div>
    <div class="present-body">
      ${lyricsHtml}
    </div>
  `;

  overlay.hidden = false;
  presentMode = true;
  document.body.classList.add('presenting');

  overlay.querySelector('#present-close').addEventListener('click', closePresentMode);
}

function closePresentMode() {
  const overlay = document.querySelector('#present-overlay');
  if (overlay) overlay.hidden = true;
  presentMode = false;
  document.body.classList.remove('presenting');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && presentMode) closePresentMode();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// ─── Vista Favoritos ──────────────────────────────────────────────────────────

function renderFavoritesView() {
  teardownRealtimeChannels();
  currentSongId = null;
  hideFab();

  const favs = songs.filter((s) => s.meta?.isFavorite);

  const items = favs.map((song) => {
    const status = song.meta?.status || 'pending';
    return `
      <li class="song-item" data-id="${escapeHtml(song.id)}" tabindex="0">
        <div class="song-num">★</div>
        <div class="song-info">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div class="song-tags">
          <div class="song-status status-${escapeHtml(status)}">${escapeHtml(getStatusLabel(status))}</div>
          <div class="song-key">${escapeHtml(song.key)}</div>
        </div>
        <div class="song-arrow">→</div>
      </li>
    `;
  }).join('');

  view.innerHTML = `
    <header>
      <div class="header-row">
        <button class="hamburger-btn" id="hamburger-btn" type="button" aria-label="Abrir menú">☰</button>
        <div class="eyebrow">Favoritos</div>
      </div>
      <h1>Favoritas</h1>
    </header>
    <div class="count">${favs.length} canci${favs.length === 1 ? 'ón' : 'ones'}</div>
    <ol class="songs" id="song-list">${items || '<div class="empty">Sin favoritas todavía — marcalas desde la vista de cada canción.</div>'}</ol>
  `;

  view.querySelector('#hamburger-btn').addEventListener('click', openDrawer);
  view.querySelector('#song-list').addEventListener('click', (e) => {
    const item = e.target.closest('.song-item');
    if (item) navigate(`/song/${item.dataset.id}`);
  });
}

// ─── Vista Sugerencias ────────────────────────────────────────────────────────

async function renderSuggestionsView() {
  teardownRealtimeChannels();
  currentSongId = null;
  hideFab();

  view.innerHTML = `
    <header>
      <div class="header-row">
        <button class="hamburger-btn" id="hamburger-btn" type="button" aria-label="Abrir menú">☰</button>
        <div class="eyebrow">Sugerencias</div>
      </div>
      <h1>Sugerencias</h1>
    </header>
    <button class="suggest-btn" id="suggest-btn" type="button">+ Sugerir canción</button>
    <div class="count suggestions-loading">Cargando...</div>
    <div id="suggestions-list"></div>
  `;

  view.querySelector('#hamburger-btn').addEventListener('click', openDrawer);
  view.querySelector('#suggest-btn').addEventListener('click', openSuggestModal);

  try {
    const suggestions = await getSuggestions();
    const listEl = view.querySelector('#suggestions-list');
    const countEl = view.querySelector('.suggestions-loading');
    if (countEl) countEl.textContent = `${suggestions.length} sugerencia${suggestions.length === 1 ? '' : 's'}`;

    if (suggestions.length === 0) {
      listEl.innerHTML = '<div class="empty">Sin sugerencias todavía.</div>';
      return;
    }

    let currentSuggestions = suggestions;

    const renderList = () => {
      listEl.innerHTML = currentSuggestions.map((s) => `
        <div class="suggestion-card" data-id="${escapeHtml(s.id)}">
          <div class="suggestion-info">
            <div class="suggestion-title">${escapeHtml(s.title)}</div>
            <div class="suggestion-artist">${escapeHtml(s.artist)}</div>
            ${s.notes ? `<div class="suggestion-notes">${escapeHtml(s.notes)}</div>` : ''}
          </div>
          <div class="suggestion-meta">
            <span class="suggestion-by">${escapeHtml(s.suggestedBy || 'Banda')}</span>
            <span class="suggestion-status suggestion-status--${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
            <button class="item-delete-btn suggestion-delete-btn" data-id="${escapeHtml(s.id)}" aria-label="Eliminar sugerencia" title="Eliminar">✕</button>
          </div>
        </div>
      `).join('') || '<div class="empty">Sin sugerencias todavía.</div>';
    };

    renderList();

    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.suggestion-delete-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      btn.disabled = true;
      currentSuggestions = currentSuggestions.filter((s) => s.id !== id);
      const countEl = view.querySelector('.suggestions-loading');
      if (countEl) countEl.textContent = `${currentSuggestions.length} sugerencia${currentSuggestions.length === 1 ? '' : 's'}`;
      renderList();
      try {
        await deleteSuggestion(id);
      } catch {
        // best-effort, ya se eliminó localmente
      }
    });
  } catch {
    const listEl = view.querySelector('#suggestions-list');
    if (listEl) listEl.innerHTML = '<div class="empty">No se pudieron cargar las sugerencias.</div>';
  }
}

// ─── Vista Chat ───────────────────────────────────────────────────────────────

function renderChatMessages(msgs) {
  if (msgs.length === 0) return '<div class="chat-empty">Sin mensajes todavía. ¡Rompé el hielo!</div>';
  const myAuthor = getStoredAuthor();
  return msgs.map((m) => {
    const isMe = myAuthor && myAuthor === m.author;
    return `
      <div class="chat-msg ${isMe ? 'chat-msg--me' : ''}" data-id="${escapeHtml(m.id)}">
        <div class="chat-msg-header">
          <div class="chat-msg-author">${escapeHtml(m.author)}</div>
          <button class="item-delete-btn chat-delete-btn" data-id="${escapeHtml(m.id)}" aria-label="Eliminar mensaje" title="Eliminar">✕</button>
        </div>
        <div class="chat-msg-text">${escapeHtml(m.text)}</div>
        <div class="chat-msg-time">${escapeHtml(formatDate(m.createdAt))}</div>
      </div>
    `;
  }).join('');
}

async function renderChatView() {
  teardownRealtimeChannels();
  currentSongId = null;
  hideFab();
  chatState = 'loading';
  chatMessages = [];

  const author = getStoredAuthor();

  view.innerHTML = `
    <header>
      <div class="header-row">
        <button class="hamburger-btn" id="hamburger-btn" type="button" aria-label="Abrir menú">☰</button>
        <div class="eyebrow">Chat</div>
      </div>
      <h1>Chat de la Banda</h1>
    </header>
    <div class="chat-messages" id="chat-messages"><div class="chat-empty">Cargando mensajes...</div></div>
    <form class="chat-form" id="chat-form">
      <input class="chat-author" name="author" type="text" placeholder="Tu nombre"
        autocomplete="name" value="${escapeHtml(author)}" />
      <div class="chat-input-row">
        <textarea class="chat-input" name="text" rows="2" placeholder="Escribí algo..." required></textarea>
        <button class="chat-submit" type="submit">Enviar</button>
      </div>
    </form>
  `;

  view.querySelector('#hamburger-btn').addEventListener('click', openDrawer);

  const messagesEl = view.querySelector('#chat-messages');

  const scrollToBottom = () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  try {
    chatMessages = await getChatMessages();
    chatState = 'loaded';
    messagesEl.innerHTML = renderChatMessages(chatMessages);
    scrollToBottom();
  } catch {
    chatState = 'error';
    messagesEl.innerHTML = '<div class="chat-empty">No se pudieron cargar los mensajes.</div>';
  }

  // Polling cada 8 segundos — no necesita Realtime de Supabase
  realtimeChatChannel = setInterval(async () => {
    if (!view.querySelector('#chat-messages')) return;
    try {
      const fresh = await getChatMessages();
      const prevIds = new Set(chatMessages.map((m) => m.id));
      const freshIds = new Set(fresh.map((m) => m.id));
      const hasNew = fresh.some((m) => !prevIds.has(m.id));
      const hasResolved = chatMessages.some((m) => m.id.startsWith('local-') && !freshIds.has(m.id));
      if (!hasNew && !hasResolved) return;
      chatMessages = fresh;
      const el = view.querySelector('#chat-messages');
      if (el) {
        const wasAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
        el.innerHTML = renderChatMessages(chatMessages);
        if (wasAtBottom) el.scrollTop = el.scrollHeight;
      }
    } catch { /* silencioso */ }
  }, 8000);

  messagesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.chat-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    chatMessages = chatMessages.filter((m) => m.id !== id);
    messagesEl.innerHTML = renderChatMessages(chatMessages);
    try {
      await deleteChatMessage(id);
    } catch {
      // best-effort
    }
  });

  view.querySelector('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const authorVal = String(fd.get('author') || '').trim();
    const text = String(fd.get('text') || '').trim();
    if (!text) return;
    setStoredAuthor(authorVal);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    form.querySelector('.chat-input').value = '';
    try {
      const msg = await addChatMessage({ author: authorVal, text });
      chatMessages = [...chatMessages, msg];
      const el = view.querySelector('#chat-messages');
      if (el) { el.innerHTML = renderChatMessages(chatMessages); el.scrollTop = el.scrollHeight; }
    } catch {
      form.querySelector('.chat-input').value = text;
    } finally {
      btn.disabled = false;
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

route('/', () => {
  teardownRealtimeChannels();
  currentSongId = null;
  hideFab();
  renderListView();
  syncFromRemote().then((fresh) => {
    if (!fresh) return;
    const currentIds = new Set(songs.map((s) => s.id));
    const freshIds = new Set(fresh.map((s) => s.id));
    const changed = fresh.length !== songs.length ||
      fresh.some((s) => !currentIds.has(s.id)) ||
      songs.some((s) => !freshIds.has(s.id));
    if (changed && !currentSongId) {
      songs = fresh;
      renderListView(view.querySelector('#search')?.value || '');
    }
  }).catch(() => {});
});

route('/song/:id', ({ id }) => {
  loadSongView(id);
});

route('/favoritos', () => {
  renderFavoritesView();
});

route('/sugerencias', () => {
  renderSuggestionsView();
});

route('/chat', () => {
  renderChatView();
});

route('/admin', () => {
  teardownRealtimeChannels();
  renderAdminView();
});

async function init() {
  renderListLoading();

  // Poda tombstones vencidos para que el store no crezca sin límite.
  dbPruneTombstones().catch(() => {});

  try {
    [songs, adminMode] = await Promise.all([getSongs(), isAdmin()]);
  } catch (error) {
    renderListError(error);
    return;
  }

  onAuthChange((loggedIn) => { adminMode = loggedIn; });

  // Suscribe la UI al estado del metrónomo
  onMetronomeChange((bpm) => syncMetronomeUI(bpm, isRunning()));

  initMetronomeFloat();
  initDrawer();
  startRouter();
}

init();
