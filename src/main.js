import './style.css';
import {
  addSongComment,
  getSongComments,
  getSongs,
  updateSongMeta
} from './lib/api.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app">
    <div id="list-view">
      <header>
        <div class="eyebrow">Setlist</div>
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
        />
      </div>

      <div class="count" id="count"></div>
      <ol class="songs" id="song-list"></ol>
    </div>

    <div id="song-view" class="hidden"></div>
  </div>

  <div class="hint">Tip: agregá al inicio (compartir → añadir a inicio)</div>
`;

const listView = document.querySelector('#list-view');
const songView = document.querySelector('#song-view');
const songList = document.querySelector('#song-list');
const searchInput = document.querySelector('#search');
const countEl = document.querySelector('#count');
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
let currentSongIndex = null;
let currentComments = [];
let commentsState = 'idle';

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
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Pendiente';
}

function getStoredAuthor() {
  try {
    return localStorage.getItem(AUTHOR_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredAuthor(author) {
  try {
    localStorage.setItem(AUTHOR_STORAGE_KEY, author);
  } catch {
    // localStorage can be unavailable in private contexts.
  }
}

function formatCommentDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderList(filter = '') {
  const normalizedFilter = filter.toLowerCase().trim();
  const filteredSongs = songs.filter((song) =>
    song.title.toLowerCase().includes(normalizedFilter) ||
    song.artist.toLowerCase().includes(normalizedFilter)
  );

  countEl.textContent = `${filteredSongs.length} canci${filteredSongs.length === 1 ? 'ón' : 'ones'}`;

  if (filteredSongs.length === 0) {
    songList.innerHTML = '<div class="empty">Sin resultados</div>';
    return;
  }

  songList.innerHTML = filteredSongs.map((song, index) => {
    const originalIndex = songs.indexOf(song);
    const status = song.meta?.status || 'pending';
    const favorite = song.meta?.isFavorite;

    return `
      <li class="song-item" data-index="${originalIndex}" tabindex="0">
        <div class="song-num">${String(index + 1).padStart(2, '0')}</div>
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
}

function renderComments(comments, state) {
  if (state === 'loading') {
    return '<div class="comments-empty">Cargando comentarios...</div>';
  }

  if (state === 'error') {
    return '<div class="comments-empty comments-empty--error">No se pudieron cargar los comentarios.</div>';
  }

  if (comments.length === 0) {
    return '<div class="comments-empty">Sin comentarios todavía</div>';
  }

  return comments.map((comment) => `
    <article class="comment comment-${escapeHtml(comment.color)}">
      <div class="comment-meta">
        <span>${escapeHtml(comment.author)}</span>
        <time>${escapeHtml(formatCommentDate(comment.createdAt))}</time>
      </div>
      <div class="comment-text">${escapeHtml(comment.text)}</div>
    </article>
  `).join('');
}

function renderCollaboration(song, comments, state, feedback = '') {
  const status = song.meta?.status || 'pending';
  const isFavorite = Boolean(song.meta?.isFavorite);
  const author = getStoredAuthor();

  const statusOptions = STATUS_OPTIONS.map((option) => `
    <option value="${option.value}" ${option.value === status ? 'selected' : ''}>
      ${escapeHtml(option.label)}
    </option>
  `).join('');

  const colorOptions = COMMENT_COLORS.map((color, index) => `
    <label class="color-swatch color-${color.value}" title="${escapeHtml(color.label)}">
      <input type="radio" name="color" value="${color.value}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(color.label)}</span>
    </label>
  `).join('');

  return `
    <div class="section">
      <div class="section-label">Ensayo compartido</div>
      <div class="collab-panel">
        <div class="collab-toolbar">
          <button
            class="favorite-btn ${isFavorite ? 'is-active' : ''}"
            id="favorite-btn"
            type="button"
            aria-pressed="${isFavorite}"
            title="${isFavorite ? 'Quitar favorita' : 'Marcar favorita'}"
          >
            <span class="favorite-symbol">${isFavorite ? '★' : '☆'}</span>
            <span>Favorita</span>
          </button>

          <label class="status-control">
            <span>Estado</span>
            <select id="status-select">
              ${statusOptions}
            </select>
          </label>
        </div>

        <div class="collab-feedback" id="collab-feedback" role="status">${escapeHtml(feedback)}</div>

        <div class="comments-head">
          <div>Comentarios</div>
          <span>${comments.length}</span>
        </div>
        <div class="comments-list" id="comments-list">${renderComments(comments, state)}</div>

        <form class="comment-form" id="comment-form">
          <div class="comment-row">
            <input
              class="comment-author"
              name="author"
              type="text"
              placeholder="Nombre"
              autocomplete="name"
              value="${escapeHtml(author)}"
            />
            <div class="comment-colors" aria-label="Color del comentario">
              ${colorOptions}
            </div>
          </div>
          <textarea
            class="comment-input"
            name="text"
            rows="3"
            placeholder="Comentario de ensayo..."
            required
          ></textarea>
          <button class="comment-submit" type="submit">Agregar comentario</button>
        </form>
      </div>
    </div>
  `;
}

function renderSong(song, options = {}) {
  const comments = options.comments ?? currentComments;
  const state = options.commentsState ?? commentsState;
  const feedback = options.feedback ?? '';
  const tabsHtml = song.tabs.length > 0
    ? song.tabs.map((tab) => `
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tabs-block">${escapeHtml(tab.tab)}</div>
      `).join('')
    : '<div class="lyrics-placeholder">Sin tabs cargadas</div>';

  const lyricsHtml = song.lyrics.trim()
    ? `<div class="lyrics-block">${escapeHtml(song.lyrics)}</div>`
    : '<div class="lyrics-placeholder">Pegá la letra en src/data/songs.js cuando esté lista.</div>';

  songView.innerHTML = `
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
      </div>
    ` : ''}

    ${song.progression ? `
      <div class="section">
        <div class="section-label">Progresión</div>
        <div class="chords-block">${highlightChords(song.progression)}</div>
      </div>
    ` : ''}

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
      </div>
    ` : ''}

    ${renderCollaboration(song, comments, state, feedback)}
  `;

  attachSongHandlers();
}

function openSong(index) {
  const song = songs[index];
  if (!song) return;

  currentSongIndex = index;
  currentComments = [];
  commentsState = 'loading';
  renderSong(song);
  listView.classList.add('hidden');
  songView.classList.remove('hidden');
  window.scrollTo(0, 0);
  loadComments(index);
}

function closeSong() {
  currentSongIndex = null;
  songView.classList.add('hidden');
  listView.classList.remove('hidden');
  searchInput.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function showCollabFeedback(message) {
  const feedback = document.querySelector('#collab-feedback');
  if (feedback) {
    feedback.textContent = message;
  }
}

async function loadComments(index) {
  const song = songs[index];

  try {
    const comments = await getSongComments(song.id);
    if (currentSongIndex !== index) return;

    currentComments = comments;
    commentsState = 'loaded';
    renderSong(song);
  } catch {
    if (currentSongIndex !== index) return;

    currentComments = [];
    commentsState = 'error';
    renderSong(song);
  }
}

async function handleFavoriteToggle(event) {
  const song = songs[currentSongIndex];
  if (!song) return;

  const previousMeta = { ...song.meta };
  const nextFavorite = !previousMeta.isFavorite;
  event.currentTarget.disabled = true;
  song.meta = { ...previousMeta, isFavorite: nextFavorite };
  renderSong(song);
  renderList(searchInput.value);

  try {
    song.meta = await updateSongMeta(song.id, {
      isFavorite: nextFavorite,
      status: previousMeta.status
    });
    renderSong(song);
    renderList(searchInput.value);
  } catch {
    song.meta = previousMeta;
    renderSong(song, { feedback: 'No se pudo actualizar favorita.' });
    renderList(searchInput.value);
  }
}

async function handleStatusChange(event) {
  const song = songs[currentSongIndex];
  if (!song) return;

  const previousMeta = { ...song.meta };
  const nextStatus = event.target.value;
  event.target.disabled = true;
  song.meta = { ...previousMeta, status: nextStatus };
  renderSong(song);
  renderList(searchInput.value);

  try {
    song.meta = await updateSongMeta(song.id, {
      isFavorite: previousMeta.isFavorite,
      status: nextStatus
    });
    renderSong(song);
    renderList(searchInput.value);
  } catch {
    song.meta = previousMeta;
    renderSong(song, { feedback: 'No se pudo actualizar el estado.' });
    renderList(searchInput.value);
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();

  const song = songs[currentSongIndex];
  if (!song) return;

  const form = event.currentTarget;
  const formData = new FormData(form);
  const author = String(formData.get('author') || '').trim();
  const text = String(formData.get('text') || '').trim();
  const color = String(formData.get('color') || 'yellow');

  if (!text) {
    showCollabFeedback('El comentario no puede estar vacío.');
    return;
  }

  form.querySelector('button[type="submit"]').disabled = true;
  setStoredAuthor(author);

  try {
    const comment = await addSongComment(song.id, { author, text, color });
    currentComments = [...currentComments, comment];
    commentsState = 'loaded';
    renderSong(song);
  } catch {
    showCollabFeedback('No se pudo guardar el comentario.');
    form.querySelector('button[type="submit"]').disabled = false;
  }
}

function attachSongHandlers() {
  document.querySelector('#back-btn').addEventListener('click', closeSong);
  document.querySelector('#favorite-btn').addEventListener('click', handleFavoriteToggle);
  document.querySelector('#status-select').addEventListener('change', handleStatusChange);
  document.querySelector('#comment-form').addEventListener('submit', handleCommentSubmit);
}

searchInput.addEventListener('input', (event) => {
  renderList(event.target.value);
});

songList.addEventListener('click', (event) => {
  const item = event.target.closest('.song-item');
  if (!item) return;

  openSong(Number(item.dataset.index));
});

songList.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const item = event.target.closest('.song-item');
  if (!item) return;

  event.preventDefault();
  openSong(Number(item.dataset.index));
});

window.addEventListener('popstate', () => {
  if (!songView.classList.contains('hidden')) {
    closeSong();
  }
});

function renderLoading() {
  countEl.textContent = 'Cargando repertorio';
  songList.innerHTML = '<div class="empty">Cargando canciones...</div>';
}

function renderError(error) {
  countEl.textContent = 'Error';
  songList.innerHTML = `
    <div class="empty">
      No se pudo cargar el repertorio.<br>
      ${escapeHtml(error.message)}
    </div>
  `;
}

async function init() {
  renderLoading();

  try {
    songs = await getSongs();
    renderList();
  } catch (error) {
    renderError(error);
  }
}

init();
