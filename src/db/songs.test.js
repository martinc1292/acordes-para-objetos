import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSongs,
  getSongWithTabs,
  saveSongWithTabs,
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

function fakeRpcClient(rpcImpl) {
  return { rpc: rpcImpl };
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
  it('queries songs by band_id ordered by created_at and maps to camelCase', async () => {
    const calls = [];
    const client = fakeClient((table) => {
      assert.equal(table, 'songs');
      return trackingBuilder(calls, [SONG_ROW]);
    });
    const songs = await getSongs(client, { bandId: 'b1' });
    assert.ok(calls.some(([op, col]) => op === 'eq' && col === 'band_id'));
    assert.ok(calls.some(([op, col]) => op === 'order' && col === 'created_at'));
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

// -- saveSongWithTabs ---------------------------------------------------------

describe('saveSongWithTabs', () => {
  it('calls the transactional RPC with normalized payload and maps the result', async () => {
    const calls = [];
    const savedSong = {
      ...SONG_ROW,
      title: 'New Title',
      artist: null,
      key: 'G',
      sort_order: 3,
      tabs: [{ ...TAB_ROW, title: 'Solo', content: 'e|--3--', position: 0 }]
    };
    const client = fakeRpcClient((name, payload) => {
      calls.push([name, payload]);
      return Promise.resolve({ data: savedSong, error: null });
    });

    const result = await saveSongWithTabs(client, {
      bandId: 'b1',
      songId: 's1',
      fields: { title: 'New Title', artist: null, key: 'G', sortOrder: 3 },
      tabs: [
        { id: 't1', title: 'Solo', content: 'e|--3--' },
        { id: null, title: 'Bridge', content: 'B|--1--', position: 1 }
      ]
    });

    assert.equal(calls[0][0], 'save_song_with_tabs');
    assert.deepEqual(calls[0][1], {
      p_band_id: 'b1',
      p_song_id: 's1',
      p_song: { title: 'New Title', artist: null, key: 'G', sort_order: 3 },
      p_tabs: [
        { id: 't1', title: 'Solo', content: 'e|--3--', position: 0 },
        { title: 'Bridge', content: 'B|--1--', position: 1 }
      ]
    });
    assert.equal(result.id, 's1');
    assert.equal(result.title, 'New Title');
    assert.equal(result.artist, null);
    assert.equal(result.sortOrder, 3);
    assert.equal(result.tabs[0].title, 'Solo');
  });

  it('throws when the RPC returns an error', async () => {
    const client = fakeRpcClient(() => Promise.resolve({
      data: null,
      error: { message: 'Solo admins pueden guardar canciones' }
    }));
    await assert.rejects(
      () => saveSongWithTabs(client, {
        bandId: 'b1',
        songId: null,
        fields: { title: 'New Title' },
        tabs: []
      }),
      /Solo admins/
    );
  });

  it('omits sort_order when no sortOrder is provided', async () => {
    const calls = [];
    const savedSong = {
      ...SONG_ROW,
      title: 'Direct URL Song',
      tabs: []
    };
    const client = fakeRpcClient((name, payload) => {
      calls.push([name, payload]);
      return Promise.resolve({ data: savedSong, error: null });
    });

    await saveSongWithTabs(client, {
      bandId: 'b1',
      songId: null,
      fields: { title: 'Direct URL Song' },
      tabs: []
    });

    assert.deepEqual(calls[0][1].p_song, { title: 'Direct URL Song' });
  });
});

// -- createSong ---------------------------------------------------------------

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
