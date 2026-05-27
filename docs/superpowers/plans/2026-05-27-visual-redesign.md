# Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the mockup design from `docs/setlist-mockup-completo.html` to the live app — replacing the card grid SongList with a row-list, updating filter tabs to underline style, and redesigning SongDetail as scrollable sections with an integrated metronome.

**Architecture:** Pure view-layer changes with no new stores or DB calls. `SongList.js` and `SongDetail.js` are rewritten in-place keeping all existing logic. A `Metronome` function component is added inline in `SongDetail.js` using the existing `createMetronome` / `parseBPM` from `@/lib/metronome.js`.

**Tech Stack:** Preact + htm tagged templates, CSS custom properties (no CSS modules), i18next via `useTranslation` hook.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/style.css` | Modify | Add `input:focus-visible` / `textarea:focus-visible` ring |
| `src/locales/es/songs.json` | Modify | Add `count`, `section.metronome` keys |
| `src/locales/en/songs.json` | Modify | Add `count`, `section.metronome` keys |
| `src/views/SongList.js` | Rewrite | Row-list layout, band pill header, underline filter tabs, count line |
| `src/views/SongDetail.js` | Rewrite | All sections visible in scroll, status pills, Metronome component |

---

## Task 1 — Global CSS + i18n additions

**Files:**
- Modify: `src/style.css`
- Modify: `src/locales/es/songs.json`
- Modify: `src/locales/en/songs.json`

- [ ] **Step 1: Add focus ring to style.css**

Append after the last `@media` block (line 236) in `src/style.css`:

```css
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Add missing i18n keys to es/songs.json**

In `src/locales/es/songs.json`, add `count` at root level and `metronome` inside `section`:

```json
{
  "count": "{{count}} canciones",
  "status": { ... },
  "filter": { ... },
  "section": {
    "chords": "Acordes",
    "tabs": "Tabs",
    "lyrics": "Letra",
    "notes": "Notas",
    "progression": "Progresión",
    "structure": "Estructura",
    "metronome": "Metrónomo"
  },
  ...
}
```

Full updated file:

```json
{
  "count": "{{count}} canciones",
  "status": {
    "pending": "Pendiente",
    "rehearsing": "Ensayando",
    "ready": "Lista"
  },
  "filter": {
    "all": "Todas",
    "favorites": "Favoritas",
    "pending": "Pendientes",
    "rehearsing": "Ensayando",
    "ready": "Listas"
  },
  "section": {
    "chords": "Acordes",
    "tabs": "Tabs",
    "lyrics": "Letra",
    "notes": "Notas",
    "progression": "Progresión",
    "structure": "Estructura",
    "metronome": "Metrónomo"
  },
  "placeholder": {
    "search": "Buscar canción o artista…",
    "no_results": "Sin resultados.",
    "no_songs": "Sin canciones todavía.",
    "no_tabs": "Sin tabs.",
    "no_lyrics": "Sin letra.",
    "no_notes": "Sin notas.",
    "tab_name": "Nombre del tab",
    "tab_content": "e|---..."
  },
  "action": {
    "add_first": "+ Agregar primera canción",
    "add_tab": "+ Agregar tab",
    "title_required": "El título es requerido.",
    "new_song": "Nueva canción",
    "delete_confirm": "¿Borrar \"{{title}}\"? Esta acción no se puede deshacer.",
    "favorite_error": "No pudimos guardar el favorito.",
    "saved": "Guardado.",
    "not_found": "Canción no encontrada."
  },
  "field": {
    "title": "Título *",
    "artist": "Artista",
    "key": "Key",
    "tempo": "Tempo"
  }
}
```

- [ ] **Step 3: Add missing i18n keys to en/songs.json**

Read `src/locales/en/songs.json` first, then add `count` and `section.metronome`:

```json
{
  "count": "{{count}} songs",
  ...
  "section": {
    ...
    "metronome": "Metronome"
  },
  ...
}
```

- [ ] **Step 4: Run existing tests to verify no regressions**

```
npm test -- --run
```

Expected: all tests pass (no view tests, so this just confirms metronome/chord/store tests still pass).

- [ ] **Step 5: Commit**

```
git add src/style.css src/locales/es/songs.json src/locales/en/songs.json
git commit -m "style: add focus ring, add count and metronome i18n keys"
```

---

## Task 2 — SongList.js redesign

**Files:**
- Rewrite: `src/views/SongList.js`

Key visual changes vs current:
- Header: eyebrow + "Setlist & Acordes" serif title + band pill (initials avatar + name + ▾) + ⚙ icon
- Filter tabs: border-bottom underline style (no fill background)
- Count line: `t('count', { count: N })` between filters and list
- Song rows: `⠿` handle + 01 number + status dot (clickable to cycle) + serif title + mono artist + ★ fav + key badge + `→`
- STATUS_COLOR uses CSS vars (`var(--yellow)`, `var(--green)`, `var(--muted)`)
- FAB color text: `var(--accent-contrast)` instead of `#fff`

- [ ] **Step 1: Write the new SongList.js**

Replace the entire content of `src/views/SongList.js` with:

```js
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
          >${item.label}</button>
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
          ${filtered.map((song, index) => html`
            <a
              key=${song.id}
              href=${`/band/${bandId}/song/${song.id}`}
              onClick=${(e) => onRowClick(e, song.id)}
              style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;border-radius:2px;transition:background 0.1s"
              onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
              onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style="color:var(--muted);font-size:0.9rem;user-select:none;flex-shrink:0" aria-hidden="true">⠿</span>
              <span style="font-family:var(--mono);font-size:0.68rem;color:var(--muted);min-width:18px;flex-shrink:0">
                ${String(index + 1).padStart(2, '0')}
              </span>
              <span
                style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[song.status] ?? 'var(--muted)'};flex-shrink:0;cursor:pointer"
                onClick=${(e) => onStatusClick(e, song)}
                role="button"
                aria-label=${`Estado: ${t(`status.${song.status}`)}. Click para cambiar.`}
                tabIndex="-1"
              ></span>
              <div style="flex:1;min-width:0">
                <div style="font-family:var(--serif);font-style:italic;font-size:1rem;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${song.title}
                </div>
                ${song.artist && html`
                  <div style="font-family:var(--mono);font-size:0.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${song.artist}
                  </div>
                `}
              </div>
              <button
                type="button"
                onClick=${(e) => onFavoriteClick(e, song)}
                disabled=${!user?.id || favoriteBusy === song.id}
                style="border:none;background:none;color:${favoriteSet.has(song.id) ? '#facc15' : 'var(--muted)'};cursor:pointer;font-size:1rem;padding:0 2px;line-height:1;flex-shrink:0"
                aria-label=${favoriteSet.has(song.id) ? 'Quitar de favoritas' : 'Marcar como favorita'}
                aria-pressed=${favoriteSet.has(song.id)}
              >${favoriteSet.has(song.id) ? '★' : '☆'}</button>
              ${song.key && html`
                <span style="font-family:var(--mono);font-size:0.72rem;color:var(--accent);background:var(--accent-soft);padding:2px 6px;border-radius:2px;flex-shrink:0">
                  ${song.key}
                </span>
              `}
              <span style="color:var(--muted);font-size:0.85rem;flex-shrink:0" aria-hidden="true">→</span>
            </a>
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
```

- [ ] **Step 2: Verify app renders without errors**

Start dev server: `npm run dev`

Open browser at `http://localhost:5173`. Log in, navigate to a band.

Expected:
- Header shows eyebrow + "Setlist & Acordes" in serif italic with orange `&`
- Band pill shows initials avatar + band name + ▾
- Filter tabs are text-only with underline on active
- Song list shows rows (not cards) with number, dot, serif title, mono artist, star, key badge, arrow
- FAB visible at bottom right

- [ ] **Step 3: Commit**

```
git add src/views/SongList.js
git commit -m "feat(ui): redesign SongList as row list with band pill header"
```

---

## Task 3 — SongDetail.js redesign with Metronome

**Files:**
- Rewrite: `src/views/SongDetail.js`

Key visual changes vs current:
- Remove tab navigation; all sections visible in scroll
- Song title: large serif italic; artist: mono muted; key badge + tempo inline
- Status pills: 3 clickable pills (Pendiente / Ensayando / Lista), active one bordered in status color
- `SecLabel` helper renders section header (accent, mono, uppercase, border-bottom, letter-spacing)
- ESTRUCTURA: box with `border-left: 2px solid var(--accent)`, mono, light bg
- METRÓNOMO: `Metronome` component (see below), only shown when `song.tempo` exists or always visible
- PROGRESIÓN: transpose controls inline above chords box
- TABS: unchanged content, styled box
- LETRA: serif font, `line-height: 1.6`
- NOTAS: mono font
- Edit mode: single scrolling form (no tabs), all fields shown; same save/cancel/delete logic

### Metronome component (defined inside SongDetail.js before the export)

Uses `createMetronome` and `parseBPM` from `@/lib/metronome.js`.

- Creates metronome instance once in `useEffect([], [])`, stored in a ref
- `onBeat` callback updates `beat` state (1–4) to animate dots
- `changeBpm(delta)` uses functional `setBpm` updater to avoid stale closures, calls `metroRef.current.setBPM(next)` 
- `togglePlay` starts or stops the metronome instance
- Cleans up (`m.stop()`) on unmount via `useEffect` return

Beat dots: 4 circles, first one slightly larger (downbeat), lit up in `var(--accent)` when active (`beat === index+1`), with `var(--yellow)` for beat 1 when active.

- [ ] **Step 1: Write the new SongDetail.js**

Replace the entire content of `src/views/SongDetail.js` with:

```js
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { getSongWithTabs, saveSongWithTabs, deleteSong, updateSongStatus } from '@/db/songs.js';
import { transposeText, transposeNote } from '@/lib/transpose.js';
import { createMetronome, parseBPM } from '@/lib/metronome.js';
import { useTranslation } from '@/stores/useTranslation.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_COLOR = { pending: 'var(--muted)', rehearsing: 'var(--yellow)', ready: 'var(--green)' };
const STATUS_ORDER = ['pending', 'rehearsing', 'ready'];

const EMPTY_FORM = {
  title: '', artist: '', key: '', tempo: '',
  structure: '', progression: '', lyrics: '', notes: ''
};

function shouldHandleLinkClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function formFromSong(song) {
  return {
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    key: song?.key ?? '',
    tempo: song?.tempo ?? '',
    structure: song?.structure ?? '',
    progression: song?.progression ?? '',
    lyrics: song?.lyrics ?? '',
    notes: song?.notes ?? ''
  };
}

function fieldsFromForm(form, sortOrder) {
  const fields = {
    title: form.title.trim(),
    artist: form.artist.trim() || null,
    key: form.key.trim() || null,
    tempo: form.tempo.trim() || null,
    structure: form.structure.trim() || null,
    progression: form.progression.trim() || null,
    lyrics: form.lyrics.trim() || null,
    notes: form.notes.trim() || null
  };
  if (sortOrder !== undefined) fields.sortOrder = sortOrder;
  return fields;
}

function normalizeTabEdits(tabEdits) {
  return tabEdits
    .map((tab, index) => {
      const title = (tab.title ?? '').trim();
      const content = tab.content ?? '';
      if (!title && !content.trim()) return null;
      return { id: tab.id, title: title || 'Tab', content, position: index };
    })
    .filter(Boolean);
}

// ── Section label helper ──────────────────────────────────────────────────────
function SecLabel({ label }) {
  return html`
    <div style="font-family:var(--mono);font-size:0.65rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.25em;padding-bottom:6px;border-bottom:1px solid var(--line);margin-bottom:10px">
      ${label}
    </div>
  `;
}

// ── Metronome component ───────────────────────────────────────────────────────
function Metronome({ initialTempo }) {
  const [bpm, setBpm] = useState(() => parseBPM(String(initialTempo ?? ''), 80));
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const metroRef = useRef(null);

  useEffect(() => {
    const m = createMetronome({ bpm, beatsPerBar: 4, onBeat: (b) => setBeat(b) });
    metroRef.current = m;
    return () => m.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changeBpm(delta) {
    setBpm((prev) => {
      const next = Math.min(300, Math.max(20, prev + delta));
      metroRef.current?.setBPM(next);
      return next;
    });
  }

  function togglePlay() {
    const m = metroRef.current;
    if (!m) return;
    if (playing) {
      m.stop();
      setPlaying(false);
      setBeat(0);
    } else {
      m.start();
      setPlaying(true);
    }
  }

  const btnStyle = 'background:var(--panel-strong);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:0.75rem;padding:0 8px;height:22px;border-radius:2px;cursor:pointer';

  return html`
    <div style="display:flex;align-items:center;gap:10px;background:var(--panel);padding:10px 14px;border-left:2px solid var(--accent);flex-wrap:wrap">
      <div>
        <div style="font-family:var(--mono);font-size:1.5rem;font-weight:700;color:var(--accent);line-height:1;letter-spacing:-0.03em">${bpm}</div>
        <div style="font-family:var(--mono);font-size:0.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.2em">BPM</div>
      </div>
      <div style="display:flex;gap:3px;align-items:center">
        <button type="button" onClick=${() => changeBpm(-5)} style=${btnStyle}>−5</button>
        <button type="button" onClick=${() => changeBpm(-1)} style=${btnStyle}>−1</button>
        <button
          type="button"
          onClick=${togglePlay}
          style="width:30px;height:30px;border-radius:50%;border:none;background:${playing ? 'var(--green)' : 'var(--accent)'};color:var(--accent-contrast);font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(255,87,34,0.4)"
          aria-label=${playing ? 'Detener metrónomo' : 'Iniciar metrónomo'}
          aria-pressed=${playing}
        >${playing ? '■' : '▶'}</button>
        <button type="button" onClick=${() => changeBpm(1)} style=${btnStyle}>+1</button>
        <button type="button" onClick=${() => changeBpm(5)} style=${btnStyle}>+5</button>
      </div>
      <div style="display:flex;gap:5px;align-items:center;margin-left:auto">
        ${[1, 2, 3, 4].map((b) => html`
          <span
            key=${b}
            style="width:${b === 1 ? '9px' : '7px'};height:${b === 1 ? '9px' : '7px'};border-radius:50%;background:${beat === b ? (b === 1 ? 'var(--yellow)' : 'var(--accent)') : 'var(--line)'};transition:background 0.05s;flex-shrink:0"
          ></span>
        `)}
      </div>
    </div>
  `;
}

// ── Main component ────────────────────────────────────────────────────────────
export function SongDetail({ bandId, songId, navigate }) {
  const t = useTranslation('songs');
  const isCreate = songId === null;

  const songs = useStoreValue($songs);
  const bands = useStoreValue($bands);
  const band = bands.find((b) => b.id === bandId);
  const isAdmin = band?.role === 'admin';

  const storeSong = songs.find((s) => s.id === songId) ?? null;
  const [song, setSong] = useState(isCreate ? null : storeSong);
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');

  const [transpose, setTranspose] = useState(0);

  const [editMode, setEditMode] = useState(isCreate);
  const [form, setForm] = useState(isCreate ? EMPTY_FORM : formFromSong(storeSong));
  const [tabEdits, setTabEdits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (isCreate) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    getSongWithTabs(getSupabase(), { songId, bandId })
      .then((data) => {
        if (!active) return;
        if (!data) { setLoadError(t('action.not_found')); return; }
        setSong(data);
        setTabs(data.tabs ?? []);
        setForm(formFromSong(data));
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('getSongWithTabs failed', err);
        setLoadError(t('common:error.load_failed'));
        setLoading(false);
      });
    return () => { active = false; };
  }, [songId, bandId]);

  function enterEdit() {
    setForm(formFromSong(song));
    setTabEdits(tabs.map((t) => ({ ...t, _isNew: false })));
    setSaveError('');
    setSaveMsg('');
    setEditMode(true);
  }

  function cancelEdit() {
    if (isCreate) { navigate(`/band/${bandId}`, { replace: true }); return; }
    setEditMode(false);
    setSaveError('');
  }

  function updateField(key) {
    return (e) => setForm((prev) => ({ ...prev, [key]: e.currentTarget.value }));
  }

  async function onStatusClick(nextStatus) {
    if (!song) return;
    const prev = song.status;
    setSong((s) => ({ ...s, status: nextStatus }));
    patchSongInStore(songId, { status: nextStatus });
    try {
      await updateSongStatus(getSupabase(), { songId, bandId, status: nextStatus });
    } catch (err) {
      setSong((s) => ({ ...s, status: prev }));
      patchSongInStore(songId, { status: prev });
      console.error('updateSongStatus failed', err);
    }
  }

  function addTabEdit() {
    setTabEdits((prev) => [...prev, { id: null, title: '', content: '', position: prev.length, _isNew: true }]);
  }

  function updateTabEdit(index, key, value) {
    setTabEdits((prev) => prev.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }

  function removeTabEdit(index) {
    setTabEdits((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) { setSaveError(t('action.title_required')); return; }
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const supabase = getSupabase();
      const saved = await saveSongWithTabs(supabase, {
        bandId,
        songId: isCreate ? null : songId,
        fields: fieldsFromForm(form, isCreate ? songs.length : undefined),
        tabs: normalizeTabEdits(tabEdits)
      });
      if (isCreate) {
        addSongToStore(saved);
        navigate(`/band/${bandId}/song/${saved.id}`, { replace: true });
        return;
      }
      setSong(saved);
      setTabs(saved.tabs ?? []);
      patchSongInStore(songId, {
        title: saved.title, artist: saved.artist,
        key: saved.key, tempo: saved.tempo, status: saved.status
      });
      setSaveMsg(t('action.saved'));
      setEditMode(false);
    } catch (err) {
      console.error('saveSongWithTabs failed', err);
      setSaveError(t('common:error.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(t('action.delete_confirm', { title: song?.title }))) return;
    setSaving(true);
    setSaveError('');
    try {
      await deleteSong(getSupabase(), { songId, bandId });
      removeSongFromStore(songId);
      navigate(`/band/${bandId}`, { replace: true });
    } catch (err) {
      console.error('deleteSong failed', err);
      setSaveError(t('common:error.delete_failed'));
      setSaving(false);
    }
  }

  const displayKey = song?.key
    ? (transpose === 0 ? song.key : (transposeNote(song.key, transpose) ?? song.key))
    : '';
  const displayProgression = song?.progression
    ? (transpose === 0 ? song.progression : transposeText(song.progression, transpose))
    : '';

  const inputStyle = 'width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:8px 10px';
  const secBlock = 'margin-bottom:20px';
  const sectionBoxStyle = 'font-family:var(--mono);font-size:0.9rem;line-height:1.6;background:var(--panel);padding:12px 14px;border-left:2px solid var(--accent);white-space:pre-wrap;word-break:break-word';

  if (loading && !song) {
    return html`<main style="padding:16px;max-width:700px;margin:0 auto"><p style="color:var(--muted);font-family:var(--mono)">${t('common:loading')}</p></main>`;
  }

  if (loadError) {
    return html`
      <main style="padding:16px;max-width:700px;margin:0 auto">
        <p role="alert" style="color:#f87171;font-family:var(--mono)">${loadError}</p>
        <a href=${`/band/${bandId}`} onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }} style="color:var(--accent);font-family:var(--mono)">${t('common:action.back')}</a>
      </main>
    `;
  }

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  if (editMode) {
    return html`
      <main style="padding:16px;max-width:700px;margin:0 auto">
        <a
          href=${`/band/${bandId}`}
          onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }}
          style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em;text-decoration:none;display:block;margin-bottom:16px"
        >${t('common:action.back')}</a>

        <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.25em;color:var(--accent);text-transform:uppercase;margin-bottom:6px">
          ${isCreate ? t('action.new_song') : t('common:action.edit')}
        </div>

        ${saveError && html`<p role="alert" style="color:#f87171;margin:0 0 12px;font-family:var(--mono);font-size:0.85rem">${saveError}</p>`}

        <!-- Title -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('field.title')} />
          <input
            name="title"
            value=${form.title}
            onInput=${updateField('title')}
            placeholder=${t('field.title')}
            required
            disabled=${saving}
            style="${inputStyle};font-family:var(--serif);font-style:italic;font-size:1.4rem;margin-bottom:8px"
          />
          <input
            name="artist"
            value=${form.artist}
            onInput=${updateField('artist')}
            placeholder=${t('field.artist')}
            disabled=${saving}
            style="${inputStyle};font-family:var(--mono);font-size:0.9rem"
          />
        </div>

        <!-- Key + Tempo -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;${secBlock}">
          <div>
            <${SecLabel} label=${t('field.key')} />
            <input name="key" value=${form.key} onInput=${updateField('key')} disabled=${saving} style="${inputStyle}" />
          </div>
          <div>
            <${SecLabel} label=${t('field.tempo')} />
            <input name="tempo" value=${form.tempo} onInput=${updateField('tempo')} disabled=${saving} style="${inputStyle}" />
          </div>
        </div>

        <!-- Estructura -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.structure')} />
          <textarea name="structure" value=${form.structure} onInput=${updateField('structure')} disabled=${saving} rows="3"
            style="${inputStyle};resize:vertical"></textarea>
        </div>

        <!-- Progresión -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.progression')} />
          <textarea name="progression" value=${form.progression} onInput=${updateField('progression')} disabled=${saving} rows="3"
            style="${inputStyle};font-family:var(--mono);resize:vertical"></textarea>
        </div>

        <!-- Tabs -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.tabs')} />
          ${tabEdits.map((te, i) => html`
            <div key=${i} style="border:1px solid var(--line);border-radius:4px;padding:12px;margin-bottom:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <input
                  value=${te.title}
                  onInput=${(e) => updateTabEdit(i, 'title', e.currentTarget.value)}
                  placeholder=${t('placeholder.tab_name')}
                  disabled=${saving}
                  style="flex:1;${inputStyle}"
                />
                <button type="button" onClick=${() => removeTabEdit(i)} disabled=${saving}
                  style="background:transparent;border:1px solid #7f1d1d;color:#f87171;padding:4px 10px;border-radius:2px;cursor:pointer;font:inherit">✕</button>
              </div>
              <textarea
                value=${te.content}
                onInput=${(e) => updateTabEdit(i, 'content', e.currentTarget.value)}
                placeholder=${t('placeholder.tab_content')}
                rows="5"
                disabled=${saving}
                style="${inputStyle};font-family:var(--mono);font-size:0.85rem;resize:vertical"
              ></textarea>
            </div>
          `)}
          <button type="button" onClick=${addTabEdit} disabled=${saving}
            style="background:var(--panel);border:1px dashed var(--line);color:var(--muted);padding:8px 16px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.8rem;width:100%">
            ${t('action.add_tab')}
          </button>
        </div>

        <!-- Letra -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.lyrics')} />
          <textarea name="lyrics" value=${form.lyrics} onInput=${updateField('lyrics')} disabled=${saving} rows="10"
            style="${inputStyle};font-family:var(--serif);font-size:1rem;line-height:1.6;resize:vertical"></textarea>
        </div>

        <!-- Notas -->
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.notes')} />
          <textarea name="notes" value=${form.notes} onInput=${updateField('notes')} disabled=${saving} rows="4"
            style="${inputStyle};font-family:var(--mono);resize:vertical"></textarea>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--line)">
          <button type="button" onClick=${onSave} disabled=${saving}
            style="background:var(--accent);border:none;color:var(--accent-contrast);padding:8px 18px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em">
            ${saving ? t('common:saving') : (isCreate ? t('common:action.create') : t('common:action.save'))}
          </button>
          <button type="button" onClick=${cancelEdit} disabled=${saving}
            style="background:transparent;border:1px solid var(--line);color:var(--muted);padding:8px 18px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em">
            ${t('common:action.cancel')}
          </button>
          ${!isCreate && html`
            <button type="button" onClick=${onDelete} disabled=${saving}
              style="background:transparent;border:1px solid #7f1d1d;color:#f87171;padding:8px 18px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;margin-left:auto">
              ${t('common:action.delete')}
            </button>
          `}
        </div>
      </main>
    `;
  }

  // ── VIEW MODE ────────────────────────────────────────────────────────────────
  return html`
    <main style="padding:16px;max-width:700px;margin:0 auto">

      <!-- Back -->
      <a
        href=${`/band/${bandId}`}
        onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }}
        style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em;text-decoration:none;display:block;margin-bottom:14px"
      >← ${t('common:action.back')}</a>

      <!-- Song header -->
      <div style="border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px">
        <h1 style="margin:0 0 6px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.6rem,5vw,2.4rem);letter-spacing:-0.02em;line-height:1.05">
          ${song?.title ?? t('action.new_song')}
        </h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-family:var(--mono);font-size:0.75rem;color:var(--muted)">
          ${song?.artist && html`<span>${song.artist}</span>`}
          ${song?.artist && (song?.key || song?.tempo) && html`<span>·</span>`}
          ${displayKey && html`<span style="color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:2px">${displayKey}${transpose !== 0 ? ` → ${displayKey}` : ''}</span>`}
          ${song?.tempo && html`<span>·</span><span>${song.tempo}</span>`}
        </div>
        ${!isCreate && song && html`
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            ${STATUS_ORDER.map((s) => html`
              <button
                key=${s}
                type="button"
                onClick=${() => onStatusClick(s)}
                style="font-family:var(--mono);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;padding:4px 8px;border-radius:2px;border:1px solid ${song.status === s ? STATUS_COLOR[s] : 'var(--line)'};background:transparent;color:${song.status === s ? STATUS_COLOR[s] : 'var(--muted)'};cursor:pointer"
                aria-pressed=${song.status === s}
              >● ${t(`status.${s}`)}</button>
            `)}
          </div>
        `}
      </div>

      ${saveMsg && html`<p aria-live="polite" style="color:var(--green);margin:0 0 12px;font-family:var(--mono);font-size:0.85rem">${saveMsg}</p>`}

      <!-- ESTRUCTURA -->
      ${song?.structure && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.structure')} />
          <div style="${sectionBoxStyle}">${song.structure}</div>
        </div>
      `}

      <!-- METRÓNOMO -->
      ${!isCreate && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.metronome')} />
          <${Metronome} initialTempo=${song?.tempo} />
        </div>
      `}

      <!-- PROGRESIÓN -->
      ${(song?.progression || song?.key) && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.progression')} />
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-family:var(--mono);font-size:0.8rem">
            <span style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">${t('section.chords')}</span>
            <button type="button" onClick=${() => setTranspose((v) => v - 1)}
              style="background:var(--panel-strong);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:0.75rem;width:22px;height:22px;border-radius:2px;cursor:pointer">−</button>
            <span style="font-family:var(--mono);font-size:0.8rem;color:${transpose !== 0 ? 'var(--accent)' : 'var(--muted)'};min-width:24px;text-align:center">${transpose > 0 ? `+${transpose}` : transpose}</span>
            <button type="button" onClick=${() => setTranspose((v) => v + 1)}
              style="background:var(--panel-strong);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:0.75rem;width:22px;height:22px;border-radius:2px;cursor:pointer">+</button>
            ${transpose !== 0 && html`
              <button type="button" onClick=${() => setTranspose(0)}
                style="background:transparent;border:1px solid var(--line);color:var(--muted);font-family:var(--mono);font-size:0.65rem;padding:0 6px;height:22px;border-radius:2px;cursor:pointer;text-transform:uppercase;letter-spacing:0.1em">Reset</button>
            `}
          </div>
          ${displayProgression && html`
            <div style="${sectionBoxStyle};font-size:1rem">${displayProgression}</div>
          `}
        </div>
      `}

      <!-- TABS / RIFFS -->
      ${tabs.length > 0 && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.tabs')} />
          ${tabs.map((tab) => html`
            <div key=${tab.id} style="margin-bottom:16px">
              ${tab.title && html`<div style="font-family:var(--mono);font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px">${tab.title}</div>`}
              <pre style="margin:0;font-family:var(--mono);font-size:0.85rem;background:var(--panel);border:1px solid var(--line);border-radius:2px;padding:12px;white-space:pre;overflow-x:auto;line-height:1.4">${tab.content}</pre>
            </div>
          `)}
        </div>
      `}

      <!-- LETRA -->
      ${song?.lyrics && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.lyrics')} />
          <div style="font-family:var(--serif);font-size:1rem;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--text)">${song.lyrics}</div>
        </div>
      `}

      <!-- NOTAS -->
      ${song?.notes && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.notes')} />
          <div style="font-family:var(--mono);font-size:0.85rem;line-height:1.6;color:var(--muted);white-space:pre-wrap;word-break:break-word">${song.notes}</div>
        </div>
      `}

      <!-- Empty state for new songs -->
      ${isCreate && html`
        <p style="color:var(--muted);font-family:var(--mono);font-size:0.85rem">${t('placeholder.no_songs')}</p>
      `}

      <!-- Edit button -->
      ${isAdmin && !isCreate && html`
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--line)">
          <button type="button" onClick=${enterEdit}
            style="background:var(--panel);border:1px solid var(--line);color:var(--text);padding:8px 18px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em">
            ${t('common:action.edit')}
          </button>
        </div>
      `}
    </main>
  `;
}
```

- [ ] **Step 2: Verify SongDetail renders in view mode**

In the browser (dev server still running):
- Navigate to a song.
- Expected: back link → serif title → artist/key/tempo meta → status pills → all sections visible in scroll (no tabs)
- Expected: metronome box visible with BPM number, −5/−1/▶/+1/+5 controls, 4 beat dots
- Click ▶ on metronome — expected: button turns green (■), beat dots animate in sequence
- Click ■ to stop — expected: dots go dark, button turns orange (▶)

- [ ] **Step 3: Verify SongDetail renders in edit mode**

Click "Editar" button.
Expected: single scrolling form with all fields visible (title/artist/key/tempo, estructura, progresion, tabs, letra, notas), save/cancel/delete buttons at bottom.

- [ ] **Step 4: Run tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add src/views/SongDetail.js
git commit -m "feat(ui): redesign SongDetail as scrollable sections with integrated metronome"
```

---

## Self-Review

**Spec coverage:**
- ✅ SongList row layout (number, dot, serif title, mono artist, fav, key, arrow)
- ✅ Band pill header with initials avatar, band name, ▾
- ✅ Filter tabs underline style
- ✅ Count line
- ✅ STATUS_COLOR uses CSS vars
- ✅ SongDetail: no tabs, all sections visible
- ✅ Structure box with left-border-accent
- ✅ Metronome component integrated with beat dots
- ✅ Transpose controls inline in Progresión section
- ✅ Lyrics in serif
- ✅ Notes in mono
- ✅ Status pills (3 clickable pills in song header)
- ✅ Primary button `color: var(--accent-contrast)`
- ✅ Input focus via CSS `outline: 2px solid var(--accent)`
- ✅ i18n: added `count` and `section.metronome` keys

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.

**Type consistency:**
- `STATUS_COLOR` defined once in each file as the same shape — no drift
- `STATUS_NEXT` used only in SongList (for dot click cycling) and SongDetail's `onStatusClick` no longer uses it (replaced by direct status arg)
- `SecLabel` and `Metronome` defined before use in SongDetail
- `parseBPM` / `createMetronome` imported from `@/lib/metronome.js` — matches the lib's exports
- `displayKey` and `displayProgression` derived the same way as the original

**Edge cases handled:**
- Song with no tabs → tabs section hidden
- Song with no lyrics → lyrics section hidden
- Song with no notes → notes section hidden
- Song with no structure → structure section hidden
- Metronome always visible (even without `tempo`) — defaults to 80 BPM
- `isCreate` guard prevents metronome from showing on new-song form
