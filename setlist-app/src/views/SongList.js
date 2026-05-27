import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, $songsLoaded, $songsError, loadSongs, patchSongInStore } from '@/stores/songs.js';
import { $bands } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { updateSongStatus } from '@/db/songs.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_LABEL = { pending: 'Pendiente', rehearsing: 'Ensayando', ready: 'Lista' };
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
  const songs = useStoreValue($songs);
  const loaded = useStoreValue($songsLoaded);
  const error = useStoreValue($songsError);
  const bands = useStoreValue($bands);
  const band = bands.find((b) => b.id === bandId);
  const isAdmin = band?.role === 'admin';
  const [search, setSearch] = useState('');
  const [statusBusy, setStatusBusy] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    loadSongs(getSupabase(), bandId).catch((err) => {
      console.error('loadSongs failed', err);
    });
  }, [bandId, retryKey]);

  async function onStatusClick(event, song) {
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

  const filtered = songs.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q);
  });

  return html`
    <main style="padding:16px;max-width:900px;margin:0 auto">
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap">
        <h1 style="margin:0;font-size:1.5rem">${band?.name ?? 'Setlist'}</h1>
        <nav style="display:flex;gap:10px;align-items:center">
          <a
            href=${`/band/${bandId}/settings`}
            onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}/settings`); }}
            style="color:var(--muted);font-size:0.9rem"
          >Ajustes</a>
        </nav>
      </header>

      <input
        type="search"
        placeholder="Buscar canción o artista…"
        value=${search}
        onInput=${(e) => setSearch(e.currentTarget.value)}
        style="width:100%;padding:10px 14px;background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit;margin-bottom:16px"
      />

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
          >Reintentar</button>
        </div>
      `}

      ${loaded && filtered.length === 0 && html`
        <p style="color:var(--muted);text-align:center;padding:40px 0">
          ${search ? 'Sin resultados.' : 'Sin canciones todavía.'}
          ${isAdmin && !search && html`
            <a href=${`/band/${bandId}/song/new`} onClick=${onNewSong} style="display:block;margin-top:12px;color:var(--accent)">+ Agregar primera canción</a>
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
              style="display:block;text-decoration:none;color:inherit;background:var(--panel);border:1px solid var(--line);border-left:3px solid ${STATUS_COLOR[song.status] ?? '#888'};border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s"
            >
              <div style="font-weight:700;margin-bottom:4px;font-size:1rem">${song.title}</div>
              <div style="color:var(--muted);font-size:0.875rem;margin-bottom:12px">${song.artist ?? ''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                ${song.key && html`<span style="background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem;font-family:monospace">${song.key}</span>`}
                ${song.tempo && html`<span style="background:var(--panel-strong);padding:2px 8px;border-radius:4px;font-size:0.8rem;color:var(--muted)">${song.tempo}</span>`}
                <button
                  type="button"
                  onClick=${(e) => onStatusClick(e, song)}
                  disabled=${statusBusy === song.id}
                  style="padding:2px 8px;border-radius:4px;border:1px solid ${STATUS_COLOR[song.status] ?? '#888'};background:transparent;color:${STATUS_COLOR[song.status] ?? '#888'};font-size:0.8rem;cursor:pointer;font:inherit;margin-left:auto"
                  aria-label=${`Estado: ${STATUS_LABEL[song.status]}. Click para cambiar.`}
                >${STATUS_LABEL[song.status] ?? song.status}</button>
              </div>
            </a>
          `)}
        </div>
      `}

      ${isAdmin && html`
        <a
          href=${`/band/${bandId}/song/new`}
          onClick=${onNewSong}
          aria-label="Nueva canción"
          style="position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,0.4)"
        >+</a>
      `}
    </main>
  `;
}
