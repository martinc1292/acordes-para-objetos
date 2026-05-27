# Fase 2 — Song List + Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build song list (cards) + song detail (tabs layout with inline admin edit) using Supabase, nanostores, and Preact.

**Architecture:** Songs load into a nanostores store on band selection and are cached there; views subscribe reactively. SongDetail fetches fresh on mount (with tabs) and writes back to the store optimistically on update. Admin CRUD lives inline in SongDetail — fields become editable in-place; a FAB "+" on SongList navigates to the create route.

**Tech Stack:** Preact + htm/preact (tagged template literals, no JSX), nanostores `atom()`, Supabase JS SDK v2, `node:test` for unit tests, `lib/transpose.js` for client-side transposition.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/db/songs.js` | Create | Supabase queries for songs + tabs |
| `src/db/songs.test.js` | Create | Unit tests for the above |
| `src/stores/songs.js` | Replace stub | `$songs` atom + load/patch/add/remove actions |
| `src/stores/songs.test.js` | Create | Unit tests for the above |
| `src/views/SongList.js` | Create | Cards grid, search, status cycle, admin FAB |
| `src/views/SongDetail.js` | Create | Tabs layout, transpose, inline admin edit/create |
| `src/main.js` | Modify | Add `song-new` + `song-detail` routes (before `band-home`) |
| `src/app.js` | Modify | Handle new route names, replace `band-home` → SongList |
| `src/views/Home.js` | Delete | Was a placeholder; replaced by SongList |

All tests run from inside `setlist-app/`: `npm test` or `node --test src/db/songs.test.js`.

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create branch from current**

```bash
git checkout -b feat/F2-song-list-detail
```

Expected: `Switched to a new branch 'feat/F2-song-list-detail'`

---

## Task 2: `src/db/songs.js` + tests

**Files:**
- Create: `setlist-app/src/db/songs.js`
- Create: `setlist-app/src/db/songs.test.js`

### Step 2.1 — Write the failing tests

- [ ] Create `setlist-app/src/db/songs.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSongs,
  getSongWithTabs,
  createSong,
  updateSong,
  deleteSong,
  updateSongStatus,
  createTab,
  updateTab,
  deleteTab
} from './songs.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeBuilder(data, error = null) {
  const b = {
    select() { return b; },
    eq() { return b; },
    order() { return b; },
    insert() { return b; },
    update() { return b; },
    delete() { return b; },
    single() {
      const row = Array.isArray(data) ? (data[0] ?? null) : data;
      return Promise.resolve({ data: row, error });
    },
    then(resolve) { return Promise.resolve(resolve({ data, error })); }
  };
  return b;
}

function trackingBuilder(calls, data, error = null) {
  const b = {
    select(v) { calls.push(['select', v]); return b; },
    eq(col, val) { calls.push(['eq', col, val]); return b; },
    order(col, opts) { calls.push(['order', col, opts]); return b; },
    insert(payload) { calls.push(['insert', payload]); return b; },
    update(payload) { calls.push(['update', payload]); return b; },
    delete() { calls.push(['delete']); return b; },
    single() { calls.push(['single']); return Promise.resolve({ data, error }); },
    then(resolve) { calls.push(['then']); return Promise.resolve(resolve({ data, error })); }
  };
  return b;
}

function fakeClient(fromImpl) {
  return { from: fromImpl };
}

// Minimal DB row for a song
const SONG_ROW = {
  id: 's1', band_id: 'b1', title: 'Careless Whisper', artist: 'George Michael',
  key: 'Dm', tempo: '76 BPM', structure: 'Intro → Verse', progression: 'Dm  Bbmaj7',
  lyrics: '', notes: 'Saxo en Dm', status: 'pending', sort_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};

const TAB_ROW = {
  id: 't1', song_id: 's1', band_id: 'b1',
  title: 'Riff principal', content: 'e|---', position: 0
};

// ── getSongs ─────────────────────────────────────────────────────────────────

describe('getSongs', () => {
  it('queries songs by band_id ordered by sort_order and maps to camelCase', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'songs');
      return trackingBuilder(calls, [SONG_ROW]);
    });
    const songs = await getSongs(client, { bandId: 'b1' });
    assert.ok(calls.some(([op, col]) => op === 'eq' && col === 'band_id'));
    assert.ok(calls.some(([op, col]) => op === 'order' && col === 'sort_order'));
    assert.equal(songs.length, 1);
    const s = songs[0];
    assert.equal(s.id, 's1');
    assert.equal(s.bandId, 'b1');
    assert.equal(s.title, 'Careless Whisper');
    assert.equal(s.sortOrder, 0);
    assert.ok('createdAt' in s);
  });

  it('throws when Supabase returns an error', async () => {
    const client = fakeClient(() => makeBuilder(null, { message: 'RLS denied', code: '42501' }));
    await assert.rejects(() => getSongs(client, { bandId: 'b1' }), /RLS denied/);
  });
});

// ── getSongWithTabs ───────────────────────────────────────────────────────────

describe('getSongWithTabs', () => {
  it('selects song with joined tabs and maps fields', async () => {
    const calls = [];
    const songWithTabs = { ...SONG_ROW, tabs: [TAB_ROW] };
    const client = fakeClient((table) => {
      assert.equal(table, 'songs');
      return trackingBuilder(calls, songWithTabs);
    });
    const result = await getSongWithTabs(client, { songId: 's1', bandId: 'b1' });
    assert.ok(calls.some(([op, val]) => op === 'select' && val.includes('tabs')));
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 's1'));
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'band_id' && val === 'b1'));
    assert.ok(calls.includes('single') || calls.some(([op]) => op === 'single'));
    assert.equal(result.id, 's1');
    assert.equal(result.tabs.length, 1);
    assert.equal(result.tabs[0].id, 't1');
    assert.equal(result.tabs[0].title, 'Riff principal');
  });

  it('returns empty tabs array when song has no tabs', async () => {
    const client = fakeClient(() => makeBuilder({ ...SONG_ROW, tabs: null }));
    const result = await getSongWithTabs(client, { songId: 's1', bandId: 'b1' });
    assert.deepEqual(result.tabs, []);
  });
});

// ── createSong ───────────────────────────────────────────────────────────────

describe('createSong', () => {
  it('inserts with band_id and required fields, returns mapped song', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'songs');
      return trackingBuilder(calls, SONG_ROW);
    });
    const result = await createSong(client, {
      bandId: 'b1', title: 'Careless Whisper', artist: 'George Michael',
      key: 'Dm', tempo: '76 BPM', structure: '', progression: '', lyrics: '', notes: '',
      sortOrder: 0
    });
    const insertCall = calls.find(([op]) => op === 'insert');
    assert.ok(insertCall, 'should call insert');
    assert.equal(insertCall[1].band_id, 'b1');
    assert.equal(insertCall[1].title, 'Careless Whisper');
    assert.ok('sort_order' in insertCall[1]);
    assert.equal(result.id, 's1');
    assert.equal(result.bandId, 'b1');
  });
});

// ── updateSong ───────────────────────────────────────────────────────────────

describe('updateSong', () => {
  it('updates specified fields and guards by band_id', async () => {
    const calls = [];
    const updated = { ...SONG_ROW, title: 'New Title' };
    const client = fakeClient((table) => {
      assert.equal(table, 'songs');
      return trackingBuilder(calls, updated);
    });
    const result = await updateSong(client, {
      songId: 's1', bandId: 'b1', fields: { title: 'New Title' }
    });
    const updateCall = calls.find(([op]) => op === 'update');
    assert.ok(updateCall, 'should call update');
    assert.equal(updateCall[1].title, 'New Title');
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 's1'));
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'band_id' && val === 'b1'));
    assert.equal(result.title, 'New Title');
  });
});

// ── deleteSong ───────────────────────────────────────────────────────────────

describe('deleteSong', () => {
  it('deletes and returns undefined', async () => {
    const calls = [];
    const client = fakeClient(() => trackingBuilder(calls, null));
    const result = await deleteSong(client, { songId: 's1', bandId: 'b1' });
    assert.equal(result, undefined);
    assert.ok(calls.some(([op]) => op === 'delete'));
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 's1'));
  });
});

// ── updateSongStatus ─────────────────────────────────────────────────────────

describe('updateSongStatus', () => {
  it('updates only the status field', async () => {
    const calls = [];
    const client = fakeClient(() => trackingBuilder(calls, { ...SONG_ROW, status: 'ready' }));
    const result = await updateSongStatus(client, { songId: 's1', bandId: 'b1', status: 'ready' });
    const updateCall = calls.find(([op]) => op === 'update');
    assert.ok(updateCall);
    assert.equal(updateCall[1].status, 'ready');
    assert.ok(Object.keys(updateCall[1]).every((k) => k === 'status'), 'should only update status');
    assert.equal(result.status, 'ready');
  });
});

// ── tab CRUD ─────────────────────────────────────────────────────────────────

describe('createTab', () => {
  it('inserts tab with song_id and band_id', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'tabs');
      return trackingBuilder(calls, TAB_ROW);
    });
    const result = await createTab(client, {
      songId: 's1', bandId: 'b1', title: 'Riff principal', content: 'e|---', position: 0
    });
    const insertCall = calls.find(([op]) => op === 'insert');
    assert.ok(insertCall);
    assert.equal(insertCall[1].song_id, 's1');
    assert.equal(insertCall[1].band_id, 'b1');
    assert.equal(result.id, 't1');
  });
});

describe('updateTab', () => {
  it('updates tab title and content, guards by song_id', async () => {
    const calls = [];
    const updated = { ...TAB_ROW, title: 'New title', content: 'e|--2--' };
    const client = fakeClient((table) => {
      assert.equal(table, 'tabs');
      return trackingBuilder(calls, updated);
    });
    const result = await updateTab(client, {
      tabId: 't1', songId: 's1', fields: { title: 'New title', content: 'e|--2--' }
    });
    const updateCall = calls.find(([op]) => op === 'update');
    assert.ok(updateCall);
    assert.equal(updateCall[1].title, 'New title');
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 't1'));
    assert.equal(result.title, 'New title');
  });
});

describe('deleteTab', () => {
  it('deletes tab and returns undefined', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'tabs');
      return trackingBuilder(calls, null);
    });
    const result = await deleteTab(client, { tabId: 't1', songId: 's1' });
    assert.equal(result, undefined);
    assert.ok(calls.some(([op]) => op === 'delete'));
    assert.ok(calls.some(([op, col, val]) => op === 'eq' && col === 'id' && val === 't1'));
  });
});
```

- [ ] **Step 2.2: Run to confirm tests fail**

```bash
cd setlist-app && node --test src/db/songs.test.js
```

Expected: all tests fail with `Cannot find module './songs.js'` or similar.

### Step 2.3 — Implement `src/db/songs.js`

- [ ] Create `setlist-app/src/db/songs.js`:

```js
function unwrap({ data, error }) {
  if (error) {
    const wrapped = error instanceof Error ? error : new Error(error.message || String(error));
    Object.assign(wrapped, error);
    throw wrapped;
  }
  return data;
}

function mapSong(row) {
  return {
    id: row.id,
    bandId: row.band_id,
    title: row.title,
    artist: row.artist ?? null,
    key: row.key ?? null,
    tempo: row.tempo ?? null,
    structure: row.structure ?? null,
    progression: row.progression ?? null,
    lyrics: row.lyrics ?? null,
    notes: row.notes ?? null,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTab(row) {
  return {
    id: row.id,
    songId: row.song_id,
    bandId: row.band_id,
    title: row.title,
    content: row.content,
    position: row.position
  };
}

export async function getSongs(client, { bandId }) {
  const rows = unwrap(await client
    .from('songs')
    .select('*')
    .eq('band_id', bandId)
    .order('sort_order', { ascending: true })) ?? [];
  return rows.map(mapSong);
}

export async function getSongWithTabs(client, { songId, bandId }) {
  const row = unwrap(await client
    .from('songs')
    .select('*, tabs(id, title, content, position)')
    .eq('id', songId)
    .eq('band_id', bandId)
    .single());
  if (!row) return null;
  return {
    ...mapSong(row),
    tabs: (row.tabs ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      position: t.position
    }))
  };
}

export async function createSong(client, {
  bandId, title, artist, key, tempo, structure, progression, lyrics, notes, sortOrder = 0
}) {
  const row = unwrap(await client
    .from('songs')
    .insert({
      band_id: bandId,
      title,
      artist: artist || null,
      key: key || null,
      tempo: tempo || null,
      structure: structure || null,
      progression: progression || null,
      lyrics: lyrics || null,
      notes: notes || null,
      sort_order: sortOrder
    })
    .select()
    .single());
  return mapSong(row);
}

export async function updateSong(client, { songId, bandId, fields }) {
  const allowed = ['title', 'artist', 'key', 'tempo', 'structure', 'progression', 'lyrics', 'notes'];
  const payload = {};
  for (const k of allowed) {
    if (k in fields) payload[k] = fields[k];
  }
  const row = unwrap(await client
    .from('songs')
    .update(payload)
    .eq('id', songId)
    .eq('band_id', bandId)
    .select()
    .single());
  return mapSong(row);
}

export async function deleteSong(client, { songId, bandId }) {
  unwrap(await client
    .from('songs')
    .delete()
    .eq('id', songId)
    .eq('band_id', bandId));
}

export async function updateSongStatus(client, { songId, bandId, status }) {
  const row = unwrap(await client
    .from('songs')
    .update({ status })
    .eq('id', songId)
    .eq('band_id', bandId)
    .select()
    .single());
  return mapSong(row);
}

export async function createTab(client, { songId, bandId, title, content, position }) {
  const row = unwrap(await client
    .from('tabs')
    .insert({ song_id: songId, band_id: bandId, title, content, position })
    .select()
    .single());
  return mapTab(row);
}

export async function updateTab(client, { tabId, songId, fields }) {
  const allowed = ['title', 'content', 'position'];
  const payload = {};
  for (const k of allowed) {
    if (k in fields) payload[k] = fields[k];
  }
  const row = unwrap(await client
    .from('tabs')
    .update(payload)
    .eq('id', tabId)
    .eq('song_id', songId)
    .select()
    .single());
  return mapTab(row);
}

export async function deleteTab(client, { tabId, songId }) {
  unwrap(await client
    .from('tabs')
    .delete()
    .eq('id', tabId)
    .eq('song_id', songId));
}
```

- [ ] **Step 2.4: Run tests and verify they pass**

```bash
node --test src/db/songs.test.js
```

Expected: all `describe` blocks pass. Fix any failures before continuing.

- [ ] **Step 2.5: Commit**

```bash
git add src/db/songs.js src/db/songs.test.js
git commit -m "feat(db): add songs and tabs query wrappers"
```

---

## Task 3: `src/stores/songs.js` + tests

**Files:**
- Replace: `setlist-app/src/stores/songs.js`
- Create: `setlist-app/src/stores/songs.test.js`

### Step 3.1 — Write the failing tests

- [ ] Create `setlist-app/src/stores/songs.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  $songs, $songsLoaded, $songsError,
  loadSongs, clearSongs,
  patchSongInStore, addSongToStore, removeSongFromStore
} from './songs.js';

const SONG = {
  id: 's1', bandId: 'b1', title: 'Careless Whisper', artist: 'George Michael',
  key: 'Dm', tempo: '76 BPM', structure: '', progression: 'Dm Bbmaj7',
  lyrics: '', notes: '', status: 'pending', sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
};

function fakeSupabase(songs = [SONG], error = null) {
  return {
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        then(resolve) {
          if (error) return resolve({ data: null, error });
          // Return rows in snake_case so the mapper in db/songs.js can convert them
          const rows = songs.map((s) => ({
            id: s.id, band_id: s.bandId, title: s.title, artist: s.artist,
            key: s.key, tempo: s.tempo, structure: s.structure,
            progression: s.progression, lyrics: s.lyrics, notes: s.notes,
            status: s.status, sort_order: s.sortOrder,
            created_at: s.createdAt, updated_at: s.updatedAt
          }));
          return resolve({ data: rows, error: null });
        }
      };
      return b;
    }
  };
}

describe('stores/songs', () => {
  beforeEach(() => {
    $songs.set([]);
    $songsLoaded.set(false);
    $songsError.set(null);
    clearSongs();
  });

  it('loadSongs fetches and populates $songs', async () => {
    await loadSongs(fakeSupabase([SONG]), 'b1');
    assert.equal($songs.get().length, 1);
    assert.equal($songs.get()[0].title, 'Careless Whisper');
    assert.equal($songsLoaded.get(), true);
    assert.equal($songsError.get(), null);
  });

  it('loadSongs idempotent: does not re-fetch for same bandId', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; }, eq() { return b; }, order() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    await loadSongs(client, 'b1');
    assert.equal(fetchCount, 1, 'should only fetch once for the same band');
  });

  it('loadSongs re-fetches when bandId changes', async () => {
    let fetchCount = 0;
    const client = {
      from() {
        fetchCount += 1;
        const b = {
          select() { return b; }, eq() { return b; }, order() { return b; },
          then(resolve) { return resolve({ data: [], error: null }); }
        };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    await loadSongs(client, 'b2');
    assert.equal(fetchCount, 2);
  });

  it('loadSongs sets $songsError on failure and $songsLoaded stays false', async () => {
    await loadSongs(fakeSupabase([], { message: 'network error' }), 'b1');
    assert.equal($songsLoaded.get(), false);
    assert.ok($songsError.get()?.includes('network error'));
  });

  it('clearSongs resets all state and allows re-fetch for same bandId', async () => {
    await loadSongs(fakeSupabase([SONG]), 'b1');
    assert.equal($songsLoaded.get(), true);
    clearSongs();
    assert.deepEqual($songs.get(), []);
    assert.equal($songsLoaded.get(), false);
    // After clear, same bandId should re-fetch
    let fetched = false;
    const client = {
      from() {
        fetched = true;
        const b = { select() { return b; }, eq() { return b; }, order() { return b; }, then(resolve) { return resolve({ data: [], error: null }); } };
        return b;
      }
    };
    await loadSongs(client, 'b1');
    assert.ok(fetched, 'should re-fetch after clearSongs');
  });

  it('patchSongInStore updates matching song, leaves others unchanged', () => {
    const s2 = { ...SONG, id: 's2', title: 'Other' };
    $songs.set([SONG, s2]);
    patchSongInStore('s1', { status: 'ready', title: 'Updated' });
    const songs = $songs.get();
    assert.equal(songs.find((s) => s.id === 's1').status, 'ready');
    assert.equal(songs.find((s) => s.id === 's1').title, 'Updated');
    assert.equal(songs.find((s) => s.id === 's2').title, 'Other');
  });

  it('addSongToStore appends song', () => {
    $songs.set([SONG]);
    const newSong = { ...SONG, id: 's2', title: 'New' };
    addSongToStore(newSong);
    assert.equal($songs.get().length, 2);
    assert.equal($songs.get()[1].id, 's2');
  });

  it('removeSongFromStore removes by id', () => {
    const s2 = { ...SONG, id: 's2' };
    $songs.set([SONG, s2]);
    removeSongFromStore('s1');
    assert.equal($songs.get().length, 1);
    assert.equal($songs.get()[0].id, 's2');
  });
});
```

- [ ] **Step 3.2: Run to confirm tests fail**

```bash
node --test src/stores/songs.test.js
```

Expected: failures because `songs.js` exports only empty atoms.

### Step 3.3 — Implement `src/stores/songs.js`

- [ ] Replace `setlist-app/src/stores/songs.js` with:

```js
import { atom } from 'nanostores';
import { getSongs } from '../db/songs.js';

export const $songs = atom([]);
export const $songsLoaded = atom(false);
export const $songsError = atom(null);

let _loadedBandId = null;

export function clearSongs() {
  $songs.set([]);
  $songsLoaded.set(false);
  $songsError.set(null);
  _loadedBandId = null;
}

export async function loadSongs(client, bandId) {
  if (_loadedBandId === bandId && $songsLoaded.get()) return;
  _loadedBandId = bandId;
  $songsLoaded.set(false);
  $songsError.set(null);
  try {
    const songs = await getSongs(client, { bandId });
    if (_loadedBandId !== bandId) return;
    $songs.set(songs);
    $songsLoaded.set(true);
  } catch (err) {
    if (_loadedBandId !== bandId) return;
    $songsError.set(err.message || 'Error al cargar canciones');
  }
}

export function patchSongInStore(songId, fields) {
  $songs.set($songs.get().map((s) => (s.id === songId ? { ...s, ...fields } : s)));
}

export function addSongToStore(song) {
  $songs.set([...$songs.get(), song]);
}

export function removeSongFromStore(songId) {
  $songs.set($songs.get().filter((s) => s.id !== songId));
}
```

- [ ] **Step 3.4: Run tests and verify they pass**

```bash
node --test src/stores/songs.test.js
```

Expected: all tests pass.

- [ ] **Step 3.5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests still pass alongside the new ones.

- [ ] **Step 3.6: Commit**

```bash
git add src/stores/songs.js src/stores/songs.test.js
git commit -m "feat(store): implement songs store with load/patch/add/remove"
```

---

## Task 4: `src/views/SongList.js`

**Files:**
- Create: `setlist-app/src/views/SongList.js`

No unit tests — this is a UI component. Test manually after wiring in Task 6.

- [ ] **Step 4.1: Create `setlist-app/src/views/SongList.js`**

```js
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
```

- [ ] **Step 4.2: Commit**

```bash
git add src/views/SongList.js
git commit -m "feat(view): add SongList with cards, search, status cycle"
```

---

## Task 5: `src/views/SongDetail.js`

**Files:**
- Create: `setlist-app/src/views/SongDetail.js`

No unit tests — UI component. Test manually after wiring.

- [ ] **Step 5.1: Create `setlist-app/src/views/SongDetail.js`**

```js
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, $songsLoaded, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import {
  getSongWithTabs, createSong, updateSong, deleteSong, updateSongStatus,
  createTab, updateTab, deleteTab
} from '@/db/songs.js';
import { transposeText, transposeNote } from '@/lib/transpose.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_LABEL = { pending: 'Pendiente', rehearsing: 'Ensayando', ready: 'Lista' };
const STATUS_COLOR = { pending: '#888', rehearsing: '#eab308', ready: '#22c55e' };

const DETAIL_TABS = [
  { id: 'acordes', label: 'Acordes' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'letra', label: 'Letra' },
  { id: 'notas', label: 'Notas' }
];

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

export function SongDetail({ bandId, songId, navigate }) {
  const isCreate = songId === null;

  const songs = useStoreValue($songs);
  const loaded = useStoreValue($songsLoaded);
  const bands = useStoreValue($bands);
  const band = bands.find((b) => b.id === bandId);
  const isAdmin = band?.role === 'admin';

  // Bootstrap from store while fresh data loads
  const storeSong = songs.find((s) => s.id === songId) ?? null;
  const [song, setSong] = useState(isCreate ? null : storeSong);
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState('acordes');
  const [transpose, setTranspose] = useState(0);

  const [editMode, setEditMode] = useState(isCreate);
  const [form, setForm] = useState(isCreate ? EMPTY_FORM : formFromSong(storeSong));
  const [tabEdits, setTabEdits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const tabRefs = useRef({});

  // Fetch fresh song + tabs (skip for create mode)
  useEffect(() => {
    if (isCreate) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    getSongWithTabs(getSupabase(), { songId, bandId })
      .then((data) => {
        if (!active) return;
        if (!data) { setLoadError('Canción no encontrada.'); return; }
        setSong(data);
        setTabs(data.tabs ?? []);
        setForm(formFromSong(data));
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err.message || 'Error al cargar la canción.');
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

  // ── status cycling ────────────────────────────────────────────────────────
  async function onStatusClick() {
    if (!song) return;
    const next = STATUS_NEXT[song.status] ?? 'pending';
    const prev = song.status;
    setSong((s) => ({ ...s, status: next }));
    patchSongInStore(songId, { status: next });
    try {
      await updateSongStatus(getSupabase(), { songId, bandId, status: next });
    } catch (err) {
      setSong((s) => ({ ...s, status: prev }));
      patchSongInStore(songId, { status: prev });
      console.error('updateSongStatus failed', err);
    }
  }

  // ── tab edit helpers ──────────────────────────────────────────────────────
  function addTabEdit() {
    setTabEdits((prev) => [...prev, { id: null, title: '', content: '', position: prev.length, _isNew: true }]);
  }

  function updateTabEdit(index, key, value) {
    setTabEdits((prev) => prev.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }

  function removeTabEdit(index) {
    setTabEdits((prev) => prev.filter((_, i) => i !== index));
  }

  // ── save ──────────────────────────────────────────────────────────────────
  async function onSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) { setSaveError('El título es requerido.'); return; }
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const supabase = getSupabase();

      if (isCreate) {
        const newSong = await createSong(supabase, {
          bandId,
          title: form.title.trim(),
          artist: form.artist.trim() || null,
          key: form.key.trim() || null,
          tempo: form.tempo.trim() || null,
          structure: form.structure.trim() || null,
          progression: form.progression.trim() || null,
          lyrics: form.lyrics.trim() || null,
          notes: form.notes.trim() || null,
          sortOrder: songs.length
        });
        // Create any tabs added during create flow
        for (const te of tabEdits) {
          if (te.title.trim() || te.content.trim()) {
            await createTab(supabase, {
              songId: newSong.id, bandId,
              title: te.title.trim() || 'Tab',
              content: te.content,
              position: te.position
            });
          }
        }
        addSongToStore(newSong);
        navigate(`/band/${bandId}/song/${newSong.id}`, { replace: true });
        return;
      }

      // Update existing song fields
      const updated = await updateSong(supabase, {
        songId,
        bandId,
        fields: {
          title: form.title.trim(),
          artist: form.artist.trim() || null,
          key: form.key.trim() || null,
          tempo: form.tempo.trim() || null,
          structure: form.structure.trim() || null,
          progression: form.progression.trim() || null,
          lyrics: form.lyrics.trim() || null,
          notes: form.notes.trim() || null
        }
      });

      // Reconcile tabs: delete removed, create new, update changed
      const originalIds = new Set(tabs.map((t) => t.id));
      const editIds = new Set(tabEdits.filter((t) => t.id).map((t) => t.id));

      for (const origTab of tabs) {
        if (!editIds.has(origTab.id)) {
          await deleteTab(supabase, { tabId: origTab.id, songId });
        }
      }
      const freshTabs = [];
      for (const [i, te] of tabEdits.entries()) {
        if (te.id) {
          const orig = tabs.find((t) => t.id === te.id);
          if (orig && (orig.title !== te.title || orig.content !== te.content)) {
            const saved = await updateTab(supabase, { tabId: te.id, songId, fields: { title: te.title, content: te.content, position: i } });
            freshTabs.push(saved);
          } else if (orig) {
            freshTabs.push({ ...orig, position: i });
          }
        } else if (te.title.trim() || te.content.trim()) {
          const saved = await createTab(supabase, {
            songId, bandId,
            title: te.title.trim() || 'Tab',
            content: te.content,
            position: i
          });
          freshTabs.push(saved);
        }
      }

      setSong({ ...updated, tabs: freshTabs });
      setTabs(freshTabs);
      patchSongInStore(songId, { title: updated.title, artist: updated.artist, key: updated.key });
      setSaveMsg('Guardado.');
      setEditMode(false);
    } catch (err) {
      setSaveError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function onDelete() {
    if (!confirm(`¿Borrar "${song?.title}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    setSaveError('');
    try {
      await deleteSong(getSupabase(), { songId, bandId });
      removeSongFromStore(songId);
      navigate(`/band/${bandId}`, { replace: true });
    } catch (err) {
      setSaveError(err.message || 'Error al borrar.');
      setSaving(false);
    }
  }

  // ── tab keyboard nav ──────────────────────────────────────────────────────
  function onTabKeyDown(e) {
    const index = DETAIL_TABS.findIndex((t) => t.id === activeTab);
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % DETAIL_TABS.length;
    else if (e.key === 'ArrowLeft') next = (index + DETAIL_TABS.length - 1) % DETAIL_TABS.length;
    else return;
    e.preventDefault();
    setActiveTab(DETAIL_TABS[next].id);
    setTimeout(() => tabRefs.current[DETAIL_TABS[next].id]?.focus(), 0);
  }

  // ── derived display values ────────────────────────────────────────────────
  const displayKey = song?.key
    ? (transpose === 0 ? song.key : (transposeNote(song.key, transpose) ?? song.key))
    : '';
  const displayProgression = song?.progression
    ? (transpose === 0 ? song.progression : transposeText(song.progression, transpose))
    : '';

  // ── render ────────────────────────────────────────────────────────────────
  if (loading && !song) {
    return html`<main style="padding:16px;max-width:700px;margin:0 auto"><p style="color:var(--muted)">Cargando…</p></main>`;
  }

  if (loadError) {
    return html`
      <main style="padding:16px;max-width:700px;margin:0 auto">
        <p role="alert" style="color:#f87171">${loadError}</p>
        <a href=${`/band/${bandId}`} onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }} style="color:var(--accent)">← Volver</a>
      </main>
    `;
  }

  return html`
    <main style="padding:16px;max-width:700px;margin:0 auto">

      <!-- Header -->
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <a
          href=${`/band/${bandId}`}
          onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }}
          style="color:var(--muted);font-size:0.9rem;white-space:nowrap;margin-top:4px"
        >← Volver</a>

        <div style="flex:1;min-width:0">
          ${editMode
            ? html`
              <input
                name="title"
                value=${form.title}
                onInput=${updateField('title')}
                placeholder="Título *"
                required
                disabled=${saving}
                style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;font-size:1.25rem;font-weight:700;padding:4px 8px;margin-bottom:6px"
              />
              <input
                name="artist"
                value=${form.artist}
                onInput=${updateField('artist')}
                placeholder="Artista"
                disabled=${saving}
                style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;font-size:0.9rem;padding:4px 8px"
              />
            `
            : html`
              <h1 style="margin:0 0 2px;font-size:1.4rem;line-height:1.2">${isCreate ? 'Nueva canción' : song?.title}</h1>
              ${song?.artist && html`<div style="color:var(--muted);font-size:0.9rem">${song.artist}</div>`}
            `
          }
        </div>

        <!-- Controls: transpose + status + edit actions -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:2px">
          ${!isCreate && song && html`
            <!-- Transpose -->
            <div style="display:flex;align-items:center;gap:4px;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:2px 6px">
              <button type="button" onClick=${() => setTranspose((t) => t - 1)} style="background:none;border:none;color:var(--text);cursor:pointer;padding:0 4px;font:inherit">−</button>
              <span style="font-family:monospace;min-width:2ch;text-align:center;font-size:0.9rem">${displayKey || '?'}</span>
              <button type="button" onClick=${() => setTranspose((t) => t + 1)} style="background:none;border:none;color:var(--text);cursor:pointer;padding:0 4px;font:inherit">+</button>
            </div>
            <!-- Status badge -->
            <button
              type="button"
              onClick=${onStatusClick}
              style="padding:4px 10px;border-radius:4px;border:1px solid ${STATUS_COLOR[song.status] ?? '#888'};background:transparent;color:${STATUS_COLOR[song.status] ?? '#888'};font-size:0.85rem;cursor:pointer;font:inherit"
              aria-label=${`Estado: ${STATUS_LABEL[song.status]}. Click para cambiar.`}
            >${STATUS_LABEL[song.status] ?? song.status}</button>
          `}

          ${isAdmin && !editMode && !isCreate && html`
            <button type="button" onClick=${enterEdit} style="padding:4px 12px;border-radius:4px;background:var(--panel-strong);border:1px solid var(--line);color:var(--text);cursor:pointer;font:inherit">Editar</button>
          `}
          ${editMode && html`
            <button type="button" onClick=${onSave} disabled=${saving} style="padding:4px 12px;border-radius:4px;background:var(--accent);border:none;color:#fff;cursor:pointer;font:inherit;font-weight:600">${saving ? 'Guardando…' : (isCreate ? 'Crear' : 'Guardar')}</button>
            <button type="button" onClick=${cancelEdit} disabled=${saving} style="padding:4px 12px;border-radius:4px;background:transparent;border:1px solid var(--line);color:var(--muted);cursor:pointer;font:inherit">Cancelar</button>
            ${!isCreate && html`<button type="button" onClick=${onDelete} disabled=${saving} style="padding:4px 12px;border-radius:4px;background:transparent;border:1px solid #7f1d1d;color:#f87171;cursor:pointer;font:inherit">Borrar</button>`}
          `}
        </div>
      </div>

      ${saveError && html`<p role="alert" style="color:#f87171;margin:0 0 12px">${saveError}</p>`}
      ${saveMsg && html`<p aria-live="polite" style="color:#22c55e;margin:0 0 12px">${saveMsg}</p>`}

      <!-- Inline meta fields in edit mode -->
      ${editMode && html`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <label style="display:grid;gap:4px;font-size:0.85rem;color:var(--muted)">
            Key
            <input name="key" value=${form.key} onInput=${updateField('key')} disabled=${saving}
              style="background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:6px 8px" />
          </label>
          <label style="display:grid;gap:4px;font-size:0.85rem;color:var(--muted)">
            Tempo
            <input name="tempo" value=${form.tempo} onInput=${updateField('tempo')} disabled=${saving}
              style="background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:6px 8px" />
          </label>
        </div>
      `}

      <!-- Section tabs -->
      <nav role="tablist" style="display:flex;border-bottom:1px solid var(--line);margin-bottom:0;gap:0">
        ${DETAIL_TABS.map((t) => html`
          <button
            type="button"
            role="tab"
            id=${`dtab-${t.id}`}
            ref=${(node) => { if (node) tabRefs.current[t.id] = node; }}
            aria-controls=${`dpanel-${t.id}`}
            aria-selected=${activeTab === t.id}
            tabIndex=${activeTab === t.id ? 0 : -1}
            onClick=${() => setActiveTab(t.id)}
            onKeyDown=${onTabKeyDown}
            style="padding:10px 16px;background:none;border:none;border-bottom:2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'};color:${activeTab === t.id ? 'var(--accent)' : 'var(--muted)'};cursor:pointer;font:inherit;font-weight:${activeTab === t.id ? '600' : '400'}"
          >${t.label}</button>
        `)}
      </nav>

      <!-- Tab panels -->
      <div id="dpanel-acordes" role="tabpanel" aria-labelledby="dtab-acordes" style="${activeTab !== 'acordes' ? 'display:none' : 'padding:16px 0'}">
        <div style="margin-bottom:16px">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:6px">Progresión</div>
          ${editMode
            ? html`<textarea name="progression" value=${form.progression} onInput=${updateField('progression')} disabled=${saving} rows="3"
                style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;font-family:monospace;padding:8px;resize:vertical"></textarea>`
            : html`<pre style="margin:0;font-family:monospace;white-space:pre-wrap;word-break:break-word;color:var(--text)">${displayProgression || html`<span style="color:var(--muted)">—</span>`}</pre>`
          }
        </div>
        <div>
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:6px">Estructura</div>
          ${editMode
            ? html`<textarea name="structure" value=${form.structure} onInput=${updateField('structure')} disabled=${saving} rows="3"
                style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:8px;resize:vertical"></textarea>`
            : html`<p style="margin:0;color:${song?.structure ? 'var(--text)' : 'var(--muted)'}">${song?.structure || '—'}</p>`
          }
        </div>
      </div>

      <div id="dpanel-tabs" role="tabpanel" aria-labelledby="dtab-tabs" style="${activeTab !== 'tabs' ? 'display:none' : 'padding:16px 0'}">
        ${editMode
          ? html`
            ${tabEdits.map((te, i) => html`
              <div key=${i} style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:10px">
                <div style="display:flex;gap:8px;margin-bottom:8px">
                  <input
                    value=${te.title}
                    onInput=${(e) => updateTabEdit(i, 'title', e.currentTarget.value)}
                    placeholder="Nombre del tab"
                    disabled=${saving}
                    style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:6px 8px"
                  />
                  <button type="button" onClick=${() => removeTabEdit(i)} disabled=${saving}
                    style="background:transparent;border:1px solid #7f1d1d;color:#f87171;padding:4px 10px;border-radius:4px;cursor:pointer;font:inherit">✕</button>
                </div>
                <textarea
                  value=${te.content}
                  onInput=${(e) => updateTabEdit(i, 'content', e.currentTarget.value)}
                  placeholder="e|---..."
                  rows="5"
                  disabled=${saving}
                  style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;font-family:monospace;font-size:0.85rem;padding:8px;resize:vertical"
                ></textarea>
              </div>
            `)}
            <button type="button" onClick=${addTabEdit} disabled=${saving}
              style="background:var(--panel);border:1px dashed var(--line);color:var(--muted);padding:8px 16px;border-radius:4px;cursor:pointer;font:inherit;width:100%">
              + Agregar tab
            </button>
          `
          : html`
            ${tabs.length === 0
              ? html`<p style="color:var(--muted)">Sin tabs.</p>`
              : tabs.map((tab) => html`
                <div key=${tab.id} style="margin-bottom:20px">
                  <div style="font-weight:600;margin-bottom:8px;font-size:0.9rem">${tab.title}</div>
                  <pre style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px;margin:0;font-family:monospace;font-size:0.85rem;white-space:pre;overflow-x:auto;line-height:1.5">${tab.content}</pre>
                </div>
              `)
            }
          `
        }
      </div>

      <div id="dpanel-letra" role="tabpanel" aria-labelledby="dtab-letra" style="${activeTab !== 'letra' ? 'display:none' : 'padding:16px 0'}">
        ${editMode
          ? html`<textarea name="lyrics" value=${form.lyrics} onInput=${updateField('lyrics')} disabled=${saving} rows="12"
              style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:8px;resize:vertical"></textarea>`
          : html`<pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:${song?.lyrics ? 'var(--text)' : 'var(--muted)'}">${song?.lyrics || 'Sin letra.'}</pre>`
        }
      </div>

      <div id="dpanel-notas" role="tabpanel" aria-labelledby="dtab-notas" style="${activeTab !== 'notas' ? 'display:none' : 'padding:16px 0'}">
        ${editMode
          ? html`<textarea name="notes" value=${form.notes} onInput=${updateField('notes')} disabled=${saving} rows="6"
              style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;color:var(--text);font:inherit;padding:8px;resize:vertical"></textarea>`
          : html`<p style="margin:0;color:${song?.notes ? 'var(--text)' : 'var(--muted)'}">${song?.notes || 'Sin notas.'}</p>`
        }
      </div>

    </main>
  `;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/views/SongDetail.js
git commit -m "feat(view): add SongDetail with tabs layout, transpose, inline admin edit"
```

---

## Task 6: Wire router, update `app.js`, delete `Home.js`

**Files:**
- Modify: `setlist-app/src/main.js`
- Modify: `setlist-app/src/app.js`
- Delete: `setlist-app/src/views/Home.js`

- [ ] **Step 6.1: Add routes to `src/main.js`**

The two new routes must come **before** `/band/:bandId` so the router doesn't swallow them.

Replace the `routes` array in `src/main.js`:

```js
const routes = [
  { pattern: '/', name: 'home' },
  { pattern: '/login', name: 'login' },
  { pattern: '/auth/callback', name: 'auth-callback' },
  { pattern: '/onboarding', name: 'onboarding' },
  { pattern: '/invite/:token', name: 'invite-accept' },
  { pattern: '/band/:bandId/settings', name: 'band-settings' },
  { pattern: '/band/:bandId/song/new', name: 'song-new' },
  { pattern: '/band/:bandId/song/:songId', name: 'song-detail' },
  { pattern: '/band/:bandId', name: 'band-home' }
];
```

- [ ] **Step 6.2: Update `src/app.js`**

Replace the entire file:

```js
import { html } from 'htm/preact';
import { useCallback, useEffect, useMemo } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $currentUser, $bands, $authReady, $activeBandId } from '@/stores/auth.js';
import { clearSongs } from '@/stores/songs.js';
import { Login } from '@/views/Login.js';
import { AuthCallback } from '@/views/AuthCallback.js';
import { Onboarding } from '@/views/Onboarding.js';
import { InviteAccept } from '@/views/InviteAccept.js';
import { BandSettings } from '@/views/BandSettings.js';
import { SongList } from '@/views/SongList.js';
import { SongDetail } from '@/views/SongDetail.js';

function getSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function getNext(search) {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

function decidePostLogin({ route, bands, search }) {
  const REENTRY = new Set(['login', 'auth-callback', 'home', 'onboarding']);
  const next = getNext(search);
  if (REENTRY.has(route.name) && next && next !== route.path) return { path: next, replace: true };
  if (bands.length === 0) {
    return route.name === 'onboarding' || route.name === 'invite-accept'
      ? null
      : { path: '/onboarding', replace: true };
  }
  if (REENTRY.has(route.name)) return { path: `/band/${bands[0].id}`, replace: true };
  return null;
}

function decideUnauthRedirect({ route }) {
  const PUBLIC = new Set(['login', 'auth-callback']);
  if (PUBLIC.has(route.name)) return null;
  const target = route.name === 'invite-accept'
    ? `/login?next=${encodeURIComponent(route.path)}`
    : '/login';
  return { path: target, replace: true };
}

export function App({ router }) {
  const route = useStoreValue(router.$route);
  const user = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const activeBandId = useStoreValue($activeBandId);
  const ready = useStoreValue($authReady);
  const navigate = useCallback((path, opts) => router.navigate(path, opts), [router]);
  const redirect = useMemo(() => {
    if (!ready || !route?.name) return null;
    return user
      ? decidePostLogin({ route, bands, search: getSearch() })
      : decideUnauthRedirect({ route });
  }, [bands, ready, route, user]);

  useEffect(() => {
    if (redirect) navigate(redirect.path, { replace: redirect.replace });
  }, [navigate, redirect]);

  // Clear songs cache when active band changes
  useEffect(() => {
    clearSongs();
  }, [activeBandId]);

  if (!ready) {
    return html`<main style="padding:24px"><p>Cargando…</p></main>`;
  }

  if (!route?.name) {
    return html`<main style="padding:24px"><h1>404</h1></main>`;
  }

  if (redirect) return null;

  switch (route.name) {
    case 'login':
      return html`<${Login} next=${getNext(getSearch())} />`;
    case 'auth-callback':
      return html`<${AuthCallback} navigate=${navigate} />`;
    case 'onboarding':
      return html`<${Onboarding} navigate=${navigate} />`;
    case 'invite-accept':
      return html`<${InviteAccept} token=${route.params.token} navigate=${navigate} />`;
    case 'band-settings':
      return html`<${BandSettings} bandId=${route.params.bandId} navigate=${navigate} />`;
    case 'band-home':
      return html`<${SongList} bandId=${route.params.bandId} navigate=${navigate} />`;
    case 'song-detail':
      return html`<${SongDetail} bandId=${route.params.bandId} songId=${route.params.songId} navigate=${navigate} />`;
    case 'song-new':
      return html`<${SongDetail} bandId=${route.params.bandId} songId=${null} navigate=${navigate} />`;
    case 'home':
    default:
      return html`<main style="padding:24px"><p>Redirigiendo…</p></main>`;
  }
}
```

- [ ] **Step 6.3: Delete `src/views/Home.js`**

```bash
git rm src/views/Home.js
```

- [ ] **Step 6.4: Run full test suite**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 6.5: Commit**

```bash
git add src/main.js src/app.js
git commit -m "feat(router): wire SongList and SongDetail routes, remove Home placeholder"
```

---

## Manual QA Checklist

After completing all tasks, start the dev server (`npm run dev`) and verify:

- [ ] `/band/:id` shows song cards with title, artist, key, tempo, status badge
- [ ] Search input filters songs client-side by title and artist
- [ ] Clicking a status badge cycles pending → rehearsing → ready → pending (optimistic update)
- [ ] Clicking a card navigates to `/band/:id/song/:songId`
- [ ] Song detail shows header with transpose controls and status badge
- [ ] Tabs navigation works: Acordes, Tabs, Letra, Notas
- [ ] Acordes tab shows progression (transposed when ±buttons pressed)
- [ ] Tabs tab shows tab content in monospace
- [ ] Admin: "Editar" button visible; enters inline edit mode
- [ ] Admin edit: all fields editable, save persists to Supabase
- [ ] Admin edit: "Borrar" with confirm deletes song and returns to list
- [ ] Admin: FAB "+" navigates to `/band/:id/song/new`
- [ ] Create form: filling title + save creates song and redirects to detail
- [ ] Non-admin: no "Editar" button, no FAB "+"
