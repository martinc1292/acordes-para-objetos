import { createClient } from '@supabase/supabase-js';
import { SONGS } from '../src/data/songs.js';
import { loadLocalEnv } from './lib/local-env.js';
import { buildMetaRows, buildSongRows, planSongMigration } from './lib/songs-to-supabase.js';

loadLocalEnv();

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const songRows = buildSongRows(SONGS);

if (!apply) {
  console.log(`Dry run: ${songRows.length} songs ready for Supabase migration.`);
  console.log('Run `npm run migrate:songs -- --apply` to insert them.');
  process.exit(0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Create .env.local from .env.example before running with --apply.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const { count: existingSongCount, error: countError } = await supabase
  .from('songs')
  .select('id', { count: 'exact' })
  .limit(1);

if (countError) {
  console.error('Failed to inspect existing songs:', countError.message);
  process.exit(1);
}

const migrationPlan = planSongMigration({
  existingSongCount: existingSongCount ?? 0,
  localSongCount: songRows.length
});

if (!migrationPlan.shouldInsert) {
  console.log(migrationPlan.message);
  process.exit(0);
}

const { data: insertedSongs, error: songsError } = await supabase
  .from('songs')
  .insert(songRows)
  .select('id,title,sort_order');

if (songsError) {
  console.error('Failed to insert songs:', songsError.message);
  process.exit(1);
}

const { error: metaError } = await supabase
  .from('song_meta')
  .insert(buildMetaRows(insertedSongs));

if (metaError) {
  console.error('Songs inserted, but failed to insert song_meta rows:', metaError.message);
  process.exit(1);
}

console.log(`Migrated ${insertedSongs.length} songs and ${insertedSongs.length} song_meta rows.`);
