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

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_COLOR = { pending: '#888', rehearsing: '#eab308', ready: '#22c55e' };

function shouldHandleLinkClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function SkeletonCard() {
  return html`
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;opacity:0.5">
      <div style="height:18px;background:var(--line);border-radius:4px;width:60%;margin-bottom:8px"></div>
      <div style="height:14px;background:var(--line);border-radius:4px;width:40%"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <div style="height:22px;width:40px;background:var(--line);border-radius:4px"></div>
        <div style="height:22px;width:60px;background:var(--line);border-radius:4px"></div>
      </div>
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
  const isAdmin = band?.role === 'admin';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusBusy, setStatusBusy] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(null);
  const [favoriteToggleError, setFavoriteToggleError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const favoriteSet = useMemo(() => new Set(favoriteSongIds), [favoriteSongIds]);

  const FILTERS = [
    { id: 'all',        label: t('filter.all') },
    { id: 'favorites',  label: t('filter.favorites') },
    { id: 'pending',    label: t('filter.pending') },
    { id: 'rehearsing', label: t('filter.rehearsing') },
    { id: 'ready',      label: t('filter.ready') }
  ];

  useEffect(() => {
    loadSongs(getSupabase(), bandId).catch((err) => {
      console.error('loadSongs failed', err);
    });
  }, [bandId, retryKey]);

  useEffect(() => {
    loadFavorites(getSupabase(), { bandId, userId: user?.id }).catch((err) => {
      console.error('loadFavorites failed', err);
    });
  }, [bandId, user?.id]);

  async function onStatusClick(event, song) {
    event.preventDefault();
    event.stopPropagation();
    if (statusBusy) return;
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
      if (wasFavorite) addFavoriteToStore(song.id);
      else removeFavoriteFromStore(song.id);
      setFavoriteToggleError(t('action.favorite_error'));
      console.error('toggle favorite failed', err);
    } finally {
      setFavoriteBusy(null);
    }
  }

  function onCardClick(event, songId) {
    if (!shouldHandleLinkClick(event)) return;
    event.preventDefault();
    navigate(`/band/${bandId}/song/${songId}`);
  }

  function onNewSong(event) {
    if (!shouldHandleLinkClick(event)) return;
    event.preventDefault();
    navigate(`/band/${bandId}/song/new`);
  }

  const counts = useMemo(() => songs.reduce((acc, song) => {
    acc.all += 1;
    if (favoriteSet.has(song.id)) acc.favorites += 1;
    if (song.status in acc) acc[song.status] += 1;
    return acc;
  }, { all: 0, favorites: 0, pending: 0, rehearsing: 0, ready: 0 }), [favoriteSet, songs]);

  const filtered = useMemo(() => songs.filter((song) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || song.title?.toLowerCase().includes(q)
      || song.artist?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all'
      || (filter === 'favorites' ? favoriteSet.has(song.id) : song.status === filter);
    return matchesSearch && matchesFilter;
  }), [favoriteSet, filter, search, songs]);

  const emptyLabel = search
    ? t('placeholder.no_results')
    : t('placeholder.no_songs');

  return html`
    <main style="padding:16px;max-width:900px;margin:0 auto">
      <header style="margin-bottom:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-family:var(--mono);font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--accent);margin-bottom:4px">
              ${t('bands:eyebrow')}
            </div>
            <h1 style="margin:0;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.5rem,4vw,2.25rem);letter-spacing:-0.02em;line-height:1">
              ${band?.name ?? 'Setlist'}
            </h1>
          </div>
          <nav style="display:flex;gap:10px;align-items:center;margin-top:4px">
            <a
              href=${`/band/${bandId}/settings`}
              onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}/settings`); }}
              style="color:var(--muted);font-family:var(--mono);font-size:0.8rem;letter-spacing:0.05em"
            >${t('common:nav.settings')}</a>
          </nav>
        </div>
      </header>

      <input
        type="search"
        placeholder=${t('placeholder.search')}
        value=${search}
        onInput=${(e) => setSearch(e.currentTarget.value)}
        style="width:100%;padding:10px 14px;background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit;margin-bottom:16px"
      />

      <div role="toolbar" aria-label="Filtros" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
        ${FILTERS.map((item) => html`
          <button
            key=${item.id}
            type="button"
            onClick=${() => setFilter(item.id)}
            aria-pressed=${filter === item.id}
            style="display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 10px;border-radius:6px;border:1px solid ${filter === item.id ? 'var(--accent)' : 'var(--line)'};background:${filter === item.id ? 'var(--panel-strong)' : 'transparent'};color:${filter === item.id ? 'var(--text)' : 'var(--muted)'};cursor:pointer;font:inherit;font-size:0.85rem"
          >
            <span>${item.label}</span>
            <span style="font-family:monospace;font-size:0.78rem;color:var(--muted)">${counts[item.id] ?? 0}</span>
          </button>
        `)}
      </div>

      ${(favoritesError || favoriteToggleError) && html`
        <p role="alert" style="color:#f87171;margin:0 0 12px">${favoriteToggleError || favoritesError}</p>
      `}

      ${!loaded && !error && html`
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
          <${SkeletonCard}/><${SkeletonCard}/><${SkeletonCard}/>
        </div>
      `}

      ${error && html`
        <div role="alert" style="color:#f87171;padding:16px;border:1px solid #7f1d1d;border-radius:6px;margin-bottom:16px">
          <p style="margin:0 0 8px">${error}</p>
          <button
            type="button"
            onClick=${() => setRetryKey((k) => k + 1)}
            style="background:var(--panel-strong);border:1px solid var(--line);color:var(--text);padding:6px 12px;border-radius:4px;cursor:pointer;font:inherit"
          >${t('common:action.retry')}</button>
        </div>
      `}

      ${loaded && filtered.length === 0 && html`
        <p style="color:var(--muted);text-align:center;padding:40px 0">
          ${emptyLabel}
          ${isAdmin && !search && filter === 'all' && html`
            <a href=${`/band/${bandId}/song/new`} onClick=${onNewSong} style="display:block;margin-top:12px;color:var(--accent)">${t('action.add_first')}</a>
          `}
        </p>
      `}

      ${loaded && filtered.length > 0 && html`
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
          ${filtered.map((song) => html`
            <a
              key=${song.id}
              href=${`/band/${bandId}/song/${song.id}`}
              onClick=${(e) => onCardClick(e, song.id)}
              onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--panel-strong)'; }}
              onMouseLeave=${(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
              style="display:block;text-decoration:none;color:inherit;background:var(--panel);border:1px solid var(--line);border-left:3px solid ${STATUS_COLOR[song.status] ?? '#888'};border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s"
            >
              <div style="font-family:var(--serif);font-style:italic;font-weight:400;margin-bottom:4px;font-size:1rem">${song.title}</div>
              <div style="color:var(--muted);font-family:var(--mono);font-size:0.8rem;margin-bottom:12px">${song.artist ?? ''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <button
                  type="button"
                  onClick=${(e) => onFavoriteClick(e, song)}
                  disabled=${!user?.id || favoriteBusy === song.id}
                  style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid ${favoriteSet.has(song.id) ? '#facc15' : 'var(--line)'};background:${favoriteSet.has(song.id) ? 'rgba(250,204,21,0.14)' : 'transparent'};color:${favoriteSet.has(song.id) ? '#facc15' : 'var(--muted)'};cursor:pointer;font:inherit;line-height:1"
                  aria-label=${favoriteSet.has(song.id) ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  aria-pressed=${favoriteSet.has(song.id)}
                >${favoriteSet.has(song.id) ? '★' : '☆'}</button>
                ${song.key && html`<span style="background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem;font-family:var(--mono)">${song.key}</span>`}
                ${song.tempo && html`<span style="background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem;color:var(--muted);font-family:var(--mono)">${song.tempo}</span>`}
                <button
                  type="button"
                  onClick=${(e) => onStatusClick(e, song)}
                  disabled=${statusBusy === song.id}
                  style="padding:2px 8px;border-radius:4px;border:1px solid ${STATUS_COLOR[song.status] ?? '#888'};background:transparent;color:${STATUS_COLOR[song.status] ?? '#888'};font-size:0.8rem;cursor:pointer;font:inherit;font-family:var(--mono);margin-left:auto"
                  aria-label=${`Estado: ${t(`status.${song.status}`)}. Click para cambiar.`}
                >${t(`status.${song.status}`) ?? song.status}</button>
              </div>
            </a>
          `)}
        </div>
      `}

      ${isAdmin && html`
        <a
          href=${`/band/${bandId}/song/new`}
          onClick=${onNewSong}
          aria-label=${t('action.new_song')}
          style="position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,0.4)"
        >+</a>
      `}
    </main>
  `;
}
