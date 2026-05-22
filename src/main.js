import './style.css';
import { getSongs } from './lib/api.js';

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
let songs = [];

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

    return `
      <li class="song-item" data-index="${originalIndex}" tabindex="0">
        <div class="song-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="song-info">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div class="song-key">${escapeHtml(song.key)}</div>
        <div class="song-arrow">→</div>
      </li>
    `;
  }).join('');
}

function renderSong(song) {
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
  `;

  document.querySelector('#back-btn').addEventListener('click', closeSong);
}

function openSong(index) {
  const song = songs[index];
  if (!song) return;

  renderSong(song);
  listView.classList.add('hidden');
  songView.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function closeSong() {
  songView.classList.add('hidden');
  listView.classList.remove('hidden');
  searchInput.focus({ preventScroll: true });
  window.scrollTo(0, 0);
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
