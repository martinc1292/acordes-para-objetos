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
const STATUS_COLOR = { pending: 'var(--muted)', rehearsing: 'var(--yellow)', ready: 'var(--green)' };

function shouldHandleLinkClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function bandInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
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
  const isAdmin = Boolean(user?.id && band?.role === 'admin');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusBusy, setStatusBusy] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(null);
  const [favoriteToggleError, setFavoriteToggleError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const favoriteSet = useMemo(() => new Set(favoriteSongIds), [favoriteSongIds]);

  const FILTERS = [
    { id: 'all',        label: t('filter.all') },
    { id: 'favorites',  label: `★ ${t('filter.favorites')}` },
    { id: 'ready',      label: `● ${t('filter.ready')}` },
    { id: 'rehearsing', label: `● ${t('filter.rehearsing')}` },
    { id: 'pending',    label: t('filter.pending') }
  ];

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
    if (statusBusy || !isAdmin) return;
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

  function onRowClick(event, songId) {
    if (!shouldHandleLinkClick(event)) return;
    event.preventDefault();
    navigate(`/band/${bandId}/song/${songId}`);
  }

  function onNewSong(event) {
    if (!shouldHandleLinkClick(event)) return;
    event.preventDefault();
    navigate(`/band/${bandId}/song/new`);
  }

  function onSettingsClick(event) {
    if (!shouldHandleLinkClick(event)) return;
    event.preventDefault();
    navigate(`/band/${bandId}/settings`);
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

  const initials = bandInitials(band?.name);

  return html`
    <main style="padding:16px;max-width:680px;margin:0 auto">

      <!-- Header -->
      <header style="border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:12px">
        <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.3em;text-transform:uppercase;color:var(--accent);margin-bottom:4px">
          ${t('bands:eyebrow')}
        </div>
        <h1 style="margin:0 0 10px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.6rem,5vw,2.5rem);letter-spacing:-0.025em;line-height:0.95">
          Setlist <span style="color:var(--accent)">&amp;</span> Acordes
        </h1>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <a
            href=${`/band/${bandId}/settings`}
            onClick=${onSettingsClick}
            style="display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:4px 10px 4px 4px;text-decoration:none;color:inherit"
            aria-label="Ajustes de banda"
          >
            <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--accent-contrast);font-family:var(--mono);font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${initials}
            </div>
            <span style="font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em">${band?.name ?? ''}</span>
            <span style="color:var(--muted);font-size:0.7rem">▾</span>
          </a>
          <a
            href=${`/band/${bandId}/settings`}
            onClick=${onSettingsClick}
            style="background:var(--panel);border:1px solid var(--line);color:var(--muted);font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;padding:5px 8px;border-radius:2px;text-decoration:none"
            tabIndex="-1"
            aria-hidden="true"
          >⚙</a>
        </div>
      </header>

      <!-- Search -->
      <input
        type="search"
        placeholder=${t('placeholder.search')}
        value=${search}
        onInput=${(e) => setSearch(e.currentTarget.value)}
        style="width:100%;padding:9px 14px;background:var(--panel);border:1px solid var(--line);border-radius:2px;color:var(--text);font:inherit;font-family:var(--mono);font-size:0.85rem;margin-bottom:10px"
      />

      <!-- Filter tabs (underline style) -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--line);margin-bottom:10px;overflow-x:auto">
        ${FILTERS.map((item) => html`
          <button
            key=${item.id}
            type="button"
            onClick=${() => setFilter(item.id)}
            aria-pressed=${filter === item.id}
            style="font-family:var(--mono);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;padding:8px 10px;border:none;background:none;border-bottom:2px solid ${filter === item.id ? 'var(--accent)' : 'transparent'};color:${filter === item.id ? 'var(--accent)' : 'var(--muted)'};cursor:pointer;white-space:nowrap;margin-bottom:-1px"
          >${item.label}${html`<span style="margin-left:4px;font-size:0.6rem;opacity:0.7">${counts[item.id]}</span>`}</button>
        `)}
      </div>

      ${(favoritesError || favoriteToggleError) && html`
        <p role="alert" style="color:#f87171;margin:0 0 12px;font-family:var(--mono);font-size:0.8rem">${favoriteToggleError || favoritesError}</p>
      `}

      <!-- Count line -->
      ${loaded && filtered.length > 0 && html`
        <div style="font-family:var(--mono);font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">
          ${t('count', { count: filtered.length })}
        </div>
      `}

      <!-- Loading skeleton -->
      ${!loaded && !error && [1, 2, 3].map((i) => html`
        <div key=${i} style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--line);opacity:0.35">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--line)"></div>
          <div style="flex:1;height:13px;background:var(--line);border-radius:2px"></div>
          <div style="width:28px;height:13px;background:var(--line);border-radius:2px"></div>
        </div>
      `)}

      <!-- Error -->
      ${error && html`
        <div role="alert" style="color:#f87171;padding:16px;border:1px solid #7f1d1d;border-radius:4px;margin-bottom:16px;font-family:var(--mono);font-size:0.85rem">
          <p style="margin:0 0 8px">${error}</p>
          <button
            type="button"
            onClick=${() => setRetryKey((k) => k + 1)}
            style="background:var(--panel);border:1px solid var(--line);color:var(--text);padding:6px 12px;border-radius:2px;cursor:pointer;font:inherit"
          >${t('common:action.retry')}</button>
        </div>
      `}

      <!-- Empty state -->
      ${loaded && filtered.length === 0 && html`
        <p style="color:var(--muted);text-align:center;padding:40px 0;font-family:var(--mono);font-size:0.85rem">
          ${search ? t('placeholder.no_results') : t('placeholder.no_songs')}
          ${isAdmin && !search && filter === 'all' && html`
            <a href=${`/band/${bandId}/song/new`} onClick=${onNewSong} style="display:block;margin-top:12px;color:var(--accent)">${t('action.add_first')}</a>
          `}
        </p>
      `}

      <!-- Song rows -->
      ${loaded && filtered.length > 0 && html`
        <div>
          ${filtered.map((song) => html`
            <div
              key=${song.id}
              style="display:flex;align-items:stretch;margin-bottom:2px"
            >
              <div
                style="width:16px;flex-shrink:0;display:flex;align-items:stretch;cursor:${isAdmin ? 'pointer' : 'default'}"
                onClick=${(e) => onStatusClick(e, song)}
                onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStatusClick(e, song); } }}
                role=${isAdmin ? 'button' : undefined}
                tabIndex=${isAdmin ? '0' : undefined}
                aria-label=${isAdmin ? `Estado: ${t(`status.${song.status}`)}. Click para cambiar.` : `Estado: ${t(`status.${song.status}`)}`}
              >
                <div style="width:3px;background:${STATUS_COLOR[song.status] ?? 'var(--muted)'};border-radius:1px;align-self:stretch"></div>
              </div>
              <a
                href=${`/band/${bandId}/song/${song.id}`}
                onClick=${(e) => onRowClick(e, song.id)}
                style="flex:1;padding:12px 12px 10px;text-decoration:none;color:inherit;min-width:0;transition:background 0.1s"
                onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
                onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                  <div style="font-family:var(--serif);font-style:italic;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${song.title}
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                    <button
                      type="button"
                      onClick=${(e) => onFavoriteClick(e, song)}
                      disabled=${!user?.id || favoriteBusy === song.id}
                      style="border:none;background:none;color:${favoriteSet.has(song.id) ? 'var(--yellow)' : 'var(--muted)'};cursor:pointer;font-size:1rem;padding:0;line-height:1;flex-shrink:0"
                      aria-label=${favoriteSet.has(song.id) ? 'Quitar de favoritas' : 'Marcar como favorita'}
                      aria-pressed=${favoriteSet.has(song.id)}
                    >${favoriteSet.has(song.id) ? '★' : '☆'}</button>
                    ${song.key && html`
                      <span style="font-family:var(--mono);font-size:0.72rem;color:var(--accent);background:var(--accent-soft);padding:2px 6px;border-radius:2px;flex-shrink:0">
                        ${song.key}
                      </span>
                    `}
                  </div>
                </div>
                ${song.artist && html`
                  <div style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${song.artist}
                  </div>
                `}
              </a>
            </div>
          `)}
        </div>
      `}

      <!-- FAB -->
      ${isAdmin && html`
        <a
          href=${`/band/${bandId}/song/new`}
          onClick=${onNewSong}
          aria-label=${t('action.new_song')}
          style="position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:var(--accent);color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:300;text-decoration:none;box-shadow:0 3px 14px rgba(255,87,34,0.5)"
        >+</a>
      `}
    </main>
  `;
}
