#!/usr/bin/env node
// Dev/admin tool. Seeds songs into an existing band using the service role key.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-band.js <band_id>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bandId = process.argv[2];

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!bandId) {
  console.error('Usage: node scripts/seed-band.js <band_id>');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const songs = JSON.parse(readFileSync(join(root, 'seeds', 'songs.json'), 'utf8'));

async function main() {
  const { data: band, error: bandErr } = await supabase.from('bands').select('id, name').eq('id', bandId).maybeSingle();
  if (bandErr) throw bandErr;
  if (!band) {
    console.error(`Band ${bandId} not found`);
    process.exit(1);
  }
  const { count, error: countErr } = await supabase
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .eq('band_id', bandId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    console.error(`Band "${band.name}" already has ${count} songs. Aborting.`);
    process.exit(1);
  }

  const songRows = songs.map((song, index) => ({
    id: randomUUID(),
    band_id: bandId,
    title: song.title,
    artist: song.artist || null,
    key: song.key || null,
    tempo: song.tempo || null,
    structure: song.structure || null,
    progression: song.progression || null,
    lyrics: song.lyrics || null,
    notes: song.notes || null,
    status: 'pending',
    sort_order: index
  }));

  const songIdBySort = new Map(songRows.map((s) => [s.sort_order, s.id]));
  const tabRows = [];
  songs.forEach((song, index) => {
    const songId = songIdBySort.get(index);
    (song.tabs || []).forEach((tab, tabIndex) => {
      tabRows.push({
        song_id: songId,
        band_id: bandId,
        title: tab.title,
        content: tab.tab,
        position: tabIndex
      });
    });
  });

  const insertedSongIds = songRows.map((song) => song.id);
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('songs')
      .insert(songRows)
      .select('id');
    if (insertErr) throw insertErr;

    if (tabRows.length > 0) {
      const { error: tabsErr } = await supabase.from('tabs').insert(tabRows);
      if (tabsErr) throw tabsErr;
    }

    console.log(`Inserted ${inserted.length} songs and ${tabRows.length} tabs into band "${band.name}".`);
  } catch (err) {
    await supabase.from('songs').delete().eq('band_id', bandId).in('id', insertedSongIds);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
