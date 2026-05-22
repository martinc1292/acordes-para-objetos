import './style.css';
import {
  addSongComment,
  addSuggestion,
  createSong,
  deleteSong,
  getSongComments,
  getSongs,
  getSuggestions,
  updateSong,
  updateSongMeta
} from './lib/api.js';
import { isAdmin, login, logout, onAuthChange } from './lib/auth.js';
import { navigate, route, startRouter } from './lib/router.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app">
    <div id="view"></div>
  </div>
  <div class="hint">Tip: agregá al inicio (compartir → añadir a inicio)</div>
`;

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

// ─── Vista Lista ─────────────────────────────────────────────────────────────

function renderListView(filter = '') {
  const normalizedFilter = filter.toLowerCase().trim();
  const filtered = songs.filter((s) =>
    s.title.toLowerCase().includes(normalizedFilter) ||
    s.artist.toLowerCase().includes(normalizedFilter)
  );

  const adminLink = adminMode
    ? `<a class="admin-link" href="#/admin">Admin</a>`
    : '';

  const suggestBtn = `<button class="suggest-btn" id="suggest-btn" type="button">+ Sugerir canción</button>`;

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
        <div class="song-arrow">→</div>
      </li>
    `;
  }).join('');

  view.innerHTML = `
    <header>
      <div class="header-row">
        <div class="eyebrow">Setlist</div>
        ${adminLink}
      </div>
      <h1>Sala <span class="ampersand">&amp;</span> Ensayo</h1>
      <div class="subtitle">Letras · acordes · tabs · notas</div>
    </header>

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
    ${suggestBtn}
  `;

  const searchInput = view.querySelector('#search');
  searchInput.addEventListener('input', (e) => renderListView(e.target.value));
  searchInput.focus({ preventScroll: true });

  view.querySelector('#song-list').addEventListener('click', (e) => {
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

  return comments.map((c) => `
    <article class="comment comment-${escapeHtml(c.color)}">
      <div class="comment-meta">
        <span>${escapeHtml(c.author)}</span>
        <time>${escapeHtml(formatDate(c.createdAt))}</time>
      </div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
    </article>
  `).join('');
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
    <button class="back-btn" id="back-btn">← Volver al setlist</button>
    <div class="song-header">
      <h2>${escapeHtml(song.title)}</h2>
      <div class="song-meta">
        <span>${escapeHtml(song.artist)}</span>
        <span class="dot"></span>
        <span class="key-tag">${escapeHtml(song.key)}</span>
        ${song.tempo ? `<span class="dot"></span><span>${escapeHtml(song.tempo)}</span>` : ''}
      </div>
    </div>

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
      <div class="section-label">Letra</div>
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
  view.querySelector('#favorite-btn').addEventListener('click', handleFavoriteToggle);
  view.querySelector('#status-select').addEventListener('change', handleStatusChange);
  view.querySelector('#comment-form').addEventListener('submit', handleCommentSubmit);
}

function getSongById(id) {
  return songs.find((s) => s.id === id) || null;
}

async function loadSongView(id) {
  const song = getSongById(id);
  if (!song) { navigate('/'); return; }

  currentSongId = id;
  currentComments = [];
  commentsState = 'loading';
  window.scrollTo(0, 0);
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
      openEditModal(editBtn.dataset.id);
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

function openEditModal(id) {
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
      await updateSong(id, {
        title: String(fd.get('title') || ''),
        artist: String(fd.get('artist') || ''),
        key: String(fd.get('key') || ''),
        tempo: String(fd.get('tempo') || ''),
        structure: String(fd.get('structure') || ''),
        progression: String(fd.get('progression') || ''),
        lyrics: String(fd.get('lyrics') || ''),
        notes: String(fd.get('notes') || '')
      });
      songs = await getSongs();
      overlay.remove();
      renderAdminView();
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

// ─── Init ─────────────────────────────────────────────────────────────────────

route('/', () => {
  currentSongId = null;
  renderListView();
});

route('/song/:id', ({ id }) => {
  loadSongView(id);
});

route('/admin', () => {
  renderAdminView();
});

async function init() {
  renderListLoading();

  try {
    [songs, adminMode] = await Promise.all([getSongs(), isAdmin()]);
  } catch (error) {
    renderListError(error);
    return;
  }

  onAuthChange((loggedIn) => { adminMode = loggedIn; });

  startRouter();
}

init();
