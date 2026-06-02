import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, $songsLoaded, $songsError, loadSongs, patchSongInStore } from '@/stores/songs.js';
import {
  $favoriteSongIds,
  $favoritesError,
  addFavoriteToStore,
  loadFavorites,
  removeFavoriteFromStore
} from '@/stores/favorites.js';
import { $bands, $currentUser } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { updateSongStatus } from '@/db/songs.js';
import { addFavorite, removeFavorite } from '@/db/favorites.js';
import { useTranslation } from '@/stores/useTranslation.js';
import { AtrilHeader } from '@/views/AtrilHeader.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_COLOR = {
  pending: 'var(--status-suggestion)',
  rehearsing: 'var(--status-rehearsing)',
  ready: 'var(--status-ready)'
};

const SORT_OPTIONS = [
  ['recent', 'Recientes'],
  ['title', 'Titulo'],
  ['artist', 'Artista'],
  ['key', 'Tono']
];

function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

function sortSongs(songs, sort) {
  const list = [...songs];
  if (sort === 'title') return list.sort((a, b) => compareText(a.title, b.title));
  if (sort === 'artist') return list.sort((a, b) => compareText(a.artist, b.artist) || compareText(a.title, b.title));
  if (sort === 'key') return list.sort((a, b) => compareText(a.key, b.key) || compareText(a.title, b.title));
  return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || compareText(a.title, b.title));
}

function normalizeOwnerName(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function isOwnSong(song, band) {
  const artist = normalizeOwnerName(song.artist);
  const bandName = normalizeOwnerName(band?.name);
  return !artist || Boolean(bandName && artist === bandName);
}

function SongCard({
  song,
  favorite,
  favoriteBusy,
  statusBusy,
  canEdit,
  canFavorite,
  onOpen,
  onFavoriteClick,
  onStatusClick,
  t
}) {
  const status = song.status ?? 'pending';
  const statusLabel = t(`status.${status}`);
  const statusStyle = `--status-color:${STATUS_COLOR[status] ?? 'var(--muted)'}`;
  const structure = song.structure || song.progression || t('placeholder.no_notes');

  function onCardKeyDown(event) {
    if (event.currentTarget !== event.target) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(song.id);
  }

  return html`
    <article
      class="sc"
      role="link"
      tabIndex="0"
      aria-label=${song.artist ? `${song.title}, ${song.artist}` : song.title}
      onClick=${() => onOpen(song.id)}
      onKeyDown=${onCardKeyDown}
    >
      <div class="sc-top">
        <div class="sc-chips">
          ${canEdit ? html`
            <button
              class="sc-status sc-status-button"
              type="button"
              disabled=${statusBusy === song.id}
              style=${statusStyle}
              title=${statusLabel}
              aria-label=${t('aria.status_change', { status: statusLabel })}
              onClick=${(event) => onStatusClick(event, song)}
            >
              <span class="sc-status-dot"></span>
              <span>${statusLabel}</span>
            </button>
          ` : html`
            <span class="sc-status" style=${statusStyle} title=${statusLabel}>
              <span class="sc-status-dot"></span>
              <span>${statusLabel}</span>
            </span>
          `}
          ${song.key && html`<span class="sc-chip sc-chip-key">${song.key}</span>`}
          ${song.tempo && html`<span class="sc-chip sc-chip-bpm">${song.tempo}</span>`}
        </div>
        <button
          class=${favorite ? 'sc-fav is-on' : 'sc-fav'}
          type="button"
          disabled=${!canFavorite || favoriteBusy === song.id}
          aria-label=${favorite ? t('aria.favorite_remove') : t('aria.favorite_add')}
          aria-pressed=${favorite}
          onClick=${(event) => onFavoriteClick(event, song)}
        >${favorite ? '★' : '☆'}</button>
      </div>

      <h2 class="sc-title">${song.title}</h2>
      <p class="sc-artist">${song.artist || 'Sin artista'}</p>

      <div class="sc-foot">
        <span class="sc-foot-label">EST.</span>
        <span class="sc-foot-text">${structure}</span>
      </div>
    </article>
  `;
}

function LoadingGrid() {
  return html`
    <div class="sl-grid" aria-hidden="true">
      ${[1, 2, 3, 4].map((item) => html`
        <article key=${item} class="sc sc-skeleton">
          <div class="sc-top">
            <div class="sc-chips">
              <span class="sc-skeleton-line" style="width:96px"></span>
              <span class="sc-skeleton-line" style="width:46px"></span>
            </div>
          </div>
          <span class="sc-skeleton-line" style="width:70%;height:22px"></span>
          <span class="sc-skeleton-line" style="width:42%"></span>
          <div class="sc-foot">
            <span class="sc-skeleton-line" style="width:36px"></span>
            <span class="sc-skeleton-line" style="width:62%"></span>
          </div>
        </article>
      `)}
    </div>
  `;
}

export function SongList({ bandId, navigate }) {
  const t = useTranslation('songs');
  const songs = useStoreValue($songs);
  const loaded = useStoreValue($songsLoaded);
  const error = useStoreValue($songsError);
  const bands = useStoreValue($bands);
  const user = useStoreValue($currentUser);
  const favoriteSongIds = useStoreValue($favoriteSongIds);
  const favoritesError = useStoreValue($favoritesError);
  const band = bands.find((b) => b.id === bandId);
  const canEdit = Boolean(user?.id && band);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [statusBusy, setStatusBusy] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(null);
  const [favoriteToggleError, setFavoriteToggleError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const favoriteSet = useMemo(() => new Set(favoriteSongIds), [favoriteSongIds]);

  const filters = useMemo(() => [
    { id: 'all', label: t('filter.all') },
    { id: 'ours', label: t('filter.ours') },
    { id: 'favorites', label: t('filter.favorites') },
    { id: 'ready', label: t('filter.ready') },
    { id: 'rehearsing', label: t('filter.rehearsing') },
    { id: 'pending', label: t('filter.pending') }
  ], [t]);

  useEffect(() => {
    loadSongs(getSupabase(), bandId).catch((err) => console.error('loadSongs failed', err));
  }, [bandId, retryKey]);

  useEffect(() => {
    loadFavorites(getSupabase(), { bandId, userId: user?.id })
      .catch((err) => console.error('loadFavorites failed', err));
  }, [bandId, user?.id]);

  async function onStatusClick(event, song) {
    event.preventDefault();
    event.stopPropagation();
    if (statusBusy || !canEdit) return;
    const next = STATUS_NEXT[song.status] ?? 'pending';
    const prev = song.status;
    setStatusBusy(song.id);
    patchSongInStore(song.id, { status: next });
    try {
      await updateSongStatus(getSupabase(), { songId: song.id, bandId, status: next });
    } catch (err) {
      patchSongInStore(song.id, { status: prev });
      console.error('updateSongStatus failed', err);
    } finally {
      setStatusBusy(null);
    }
  }

  async function onFavoriteClick(event, song) {
    event.preventDefault();
    event.stopPropagation();
    if (!user?.id || favoriteBusy) return;
    const wasFavorite = favoriteSet.has(song.id);
    const prevIds = $favoriteSongIds.get();
    setFavoriteToggleError('');
    setFavoriteBusy(song.id);
    if (wasFavorite) removeFavoriteFromStore(song.id);
    else addFavoriteToStore(song.id);
    try {
      if (wasFavorite) {
        await removeFavorite(getSupabase(), { bandId, songId: song.id, userId: user.id });
      } else {
        await addFavorite(getSupabase(), { bandId, songId: song.id, userId: user.id });
      }
    } catch (err) {
      $favoriteSongIds.set(prevIds);
      setFavoriteToggleError(t('action.favorite_error'));
      console.error('toggle favorite failed', err);
    } finally {
      setFavoriteBusy(null);
    }
  }

  function openSong(songId) {
    navigate(`/band/${bandId}/song/${songId}`);
  }

  const counts = useMemo(() => songs.reduce((acc, song) => {
    acc.all += 1;
    if (isOwnSong(song, band)) acc.ours += 1;
    if (favoriteSet.has(song.id)) acc.favorites += 1;
    if (song.status in acc) acc[song.status] += 1;
    return acc;
  }, { all: 0, ours: 0, favorites: 0, pending: 0, rehearsing: 0, ready: 0 }), [band, favoriteSet, songs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = songs.filter((song) => {
      const matchesSearch = !query
        || song.title?.toLowerCase().includes(query)
        || song.artist?.toLowerCase().includes(query)
        || song.key?.toLowerCase().includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'ours' && isOwnSong(song, band))
        || (filter === 'favorites' ? favoriteSet.has(song.id) : song.status === filter);
      return matchesSearch && matchesFilter;
    });
    return sortSongs(matches, sort);
  }, [band, favoriteSet, filter, search, songs, sort]);

  return html`
    <div class="app-root">
      <${AtrilHeader}
        band=${band}
        bandId=${bandId}
        navigate=${navigate}
        view="list"
        canEdit=${canEdit}
      />

      <main class="app-main">
        <section class="sl" aria-labelledby="song-list-title">
          <div class="sl-head">
            <div>
              <h1 id="song-list-title" class="sl-title">Setlist de <em>${band?.name ?? ''}</em></h1>
            </div>
          </div>

          <div class="sl-toolbar">
            <label class="sl-search">
              <span class="sl-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder=${t('placeholder.search')}
                value=${search}
                onInput=${(event) => setSearch(event.currentTarget.value)}
              />
            </label>

            <div class="sl-filters" role="tablist" aria-label="Filtros">
              ${filters.map((item) => html`
                <button
                  key=${item.id}
                  class=${filter === item.id ? 'sl-filter is-active' : 'sl-filter'}
                  type="button"
                  role="tab"
                  aria-selected=${filter === item.id}
                  onClick=${() => setFilter(item.id)}
                >
                  <span>${item.label}</span>
                  <span class="sl-filter-n">${counts[item.id] ?? 0}</span>
                </button>
              `)}
            </div>

            <label class="sl-sort">
              <span class="sl-sort-label">Ordenar</span>
              <select value=${sort} onChange=${(event) => setSort(event.currentTarget.value)}>
                ${SORT_OPTIONS.map(([value, label]) => html`<option key=${value} value=${value}>${label}</option>`)}
              </select>
            </label>
          </div>

          ${(favoritesError || favoriteToggleError) && html`
            <p role="alert" class="ap-alert">${favoriteToggleError || favoritesError}</p>
          `}

          ${!loaded && !error && html`<${LoadingGrid} />`}

          ${error && html`
            <div role="alert" class="ap-alert">
              <p style="margin:0 0 10px">${error}</p>
              <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setRetryKey((key) => key + 1)}>
                ${t('common:action.retry')}
              </button>
            </div>
          `}

          ${loaded && filtered.length === 0 && html`
            <div class="sl-empty">
              <div class="sl-empty-mark" aria-hidden="true">∅</div>
              <p>${search ? t('placeholder.no_results') : t('placeholder.no_songs')}</p>
              ${canEdit && !search && filter === 'all' && html`
                <button
                  type="button"
                  class="ap-btn ap-btn-accent"
                  onClick=${() => navigate(`/band/${bandId}/song/new`)}
                >${t('action.add_first')}</button>
              `}
            </div>
          `}

          ${loaded && filtered.length > 0 && html`
            <div class="sl-grid">
              ${filtered.map((song) => html`
                <${SongCard}
                  key=${song.id}
                  song=${song}
                  favorite=${favoriteSet.has(song.id)}
                  favoriteBusy=${favoriteBusy}
                  statusBusy=${statusBusy}
                  canEdit=${canEdit}
                  canFavorite=${Boolean(user?.id)}
                  onOpen=${openSong}
                  onFavoriteClick=${onFavoriteClick}
                  onStatusClick=${onStatusClick}
                  t=${t}
                />
              `)}
            </div>
          `}
        </section>
      </main>

      <footer class="app-foot">
        <span>Pulso</span>
        <span class="app-foot-dot">•</span>
        <span>Sala de ensayo</span>
      </footer>
    </div>
  `;
}
