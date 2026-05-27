import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, $songsLoaded, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands, $currentUser } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { getSongWithTabs, saveSongWithTabs, deleteSong, updateSongStatus } from '@/db/songs.js';
import { transposeText, transposeNote } from '@/lib/transpose.js';
import { createMetronome, parseBPM } from '@/lib/metronome.js';
import { useTranslation } from '@/stores/useTranslation.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_COLOR = { pending: 'var(--muted)', rehearsing: 'var(--yellow)', ready: 'var(--green)' };

const EMPTY_FORM = {
  title: '', artist: '', key: '', tempo: '',
  structure: '', progression: '', lyrics: '', notes: ''
};

function emptyForm() {
  return { ...EMPTY_FORM };
}

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
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
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
  const songsLoaded = useStoreValue($songsLoaded);
  const bands = useStoreValue($bands);
  const currentUser = useStoreValue($currentUser);
  const band = bands.find((b) => b.id === bandId);
  const isAdmin = Boolean(currentUser?.id && band?.role === 'admin');

  const storeSong = songs.find((s) => s.id === songId) ?? null;
  const [song, setSong] = useState(isCreate ? null : storeSong);
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');

  const [transpose, setTranspose] = useState(0);

  const [editMode, setEditMode] = useState(isCreate);
  const [form, setForm] = useState(isCreate ? emptyForm() : formFromSong(storeSong));
  const [tabEdits, setTabEdits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    setSaveError('');
    setSaveMsg('');
    setTranspose(0);

    if (isCreate) {
      setSong(null);
      setTabs([]);
      setLoading(false);
      setLoadError('');
      setEditMode(true);
      setForm(emptyForm());
      setTabEdits([]);
      return;
    }

    let active = true;
    setSong(storeSong);
    setTabs([]);
    setForm(formFromSong(storeSong));
    setEditMode(false);
    setTabEdits([]);
    setLoading(true);
    setLoadError('');
    getSongWithTabs(getSupabase(), { songId, bandId })
      .then((data) => {
        if (!active) return;
        if (!data) {
          setLoadError(t('action.not_found'));
          setLoading(false);
          return;
        }
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
    setTabEdits(tabs.map((tab) => ({ ...tab, _isNew: false })));
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
    if (!song || !isAdmin) return;
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
    setTabEdits((prev) => prev.map((tab, i) => (i === index ? { ...tab, [key]: value } : tab)));
  }

  function removeTabEdit(index) {
    setTabEdits((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!isAdmin) { setSaveError(t('action.admin_required')); return; }
    if (!form.title.trim()) { setSaveError(t('action.title_required')); return; }
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const supabase = getSupabase();
      const saved = await saveSongWithTabs(supabase, {
        bandId,
        songId: isCreate ? null : songId,
        fields: fieldsFromForm(form, isCreate && songsLoaded ? songs.length : undefined),
        tabs: normalizeTabEdits(tabEdits)
      });
      if (isCreate) {
        addSongToStore(saved);
        setSong(saved);
        setTabs(saved.tabs ?? []);
        setForm(formFromSong(saved));
        setTabEdits([]);
        setEditMode(false);
        navigate(`/band/${bandId}/song/${saved.id}`, { replace: true });
        return;
      }
      setSong(saved);
      setTabs(saved.tabs ?? []);
      patchSongInStore(songId, saved);
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
    if (!isAdmin) { setSaveError(t('action.admin_required')); return; }
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

  if (isCreate && !isAdmin) {
    return html`
      <main style="padding:16px;max-width:700px;margin:0 auto">
        <p role="alert" style="color:#f87171;font-family:var(--mono)">${t('action.admin_required')}</p>
        <a href=${`/band/${bandId}`} onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }} style="color:var(--accent);font-family:var(--mono)">${t('common:action.back')}</a>
      </main>
    `;
  }

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  if (editMode) {
    return html`
      <main style="padding:16px;max-width:700px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:20px">
          <a
            href=${`/band/${bandId}`}
            onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }}
            style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em;text-decoration:none"
          >← ${t('common:action.back')}</a>
          <div style="display:flex;gap:6px">
            <button type="button" onClick=${cancelEdit} disabled=${saving}
              style="background:transparent;border:1px solid var(--line);color:var(--muted);padding:5px 14px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em">
              ${t('common:action.cancel')}
            </button>
            <button type="button" onClick=${onSave} disabled=${saving}
              style="background:var(--accent);border:none;color:var(--accent-contrast);padding:5px 14px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em">
              ${saving ? t('common:saving') : (isCreate ? t('common:action.create') : t('common:action.save'))}
            </button>
          </div>
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

        ${!isCreate && html`
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:flex-end">
            <button type="button" onClick=${onDelete} disabled=${saving}
              style="background:transparent;border:1px solid #7f1d1d;color:#f87171;padding:6px 16px;border-radius:2px;cursor:pointer;font:inherit;font-family:var(--mono);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em">
              ${t('common:action.delete')}
            </button>
          </div>
        `}
      </main>
    `;
  }

  // ── VIEW MODE ────────────────────────────────────────────────────────────────
  return html`
    <main style="padding:16px;max-width:700px;margin:0 auto">

      <!-- Back + Edit -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <a
          href=${`/band/${bandId}`}
          onClick=${(e) => { if (!shouldHandleLinkClick(e)) return; e.preventDefault(); navigate(`/band/${bandId}`); }}
          style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em;text-decoration:none"
        >← ${t('common:action.back')}</a>
        ${isAdmin && !isCreate && html`
          <button
            type="button"
            onClick=${enterEdit}
            style="background:var(--panel);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;padding:5px 14px;border-radius:2px;cursor:pointer"
          >${t('common:action.edit')}</button>
        `}
      </div>

      <!-- Song header -->
      <div style="border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px">
        <h1 style="margin:0 0 6px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.6rem,5vw,2.4rem);letter-spacing:-0.02em;line-height:1.05">
          ${song?.title ?? t('action.new_song')}
        </h1>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-family:var(--mono);font-size:0.75rem;color:var(--muted)">
          ${song?.artist && html`<span>${song.artist}</span>`}
          ${song?.artist && (displayKey || song?.tempo) && html`<span>·</span>`}
          ${displayKey && html`<span style="color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:2px">${transpose !== 0 ? `${song.key} → ${displayKey}` : displayKey}</span>`}
          ${song?.tempo && html`<span>·</span><span>${song.tempo}</span>`}
          ${!isCreate && song && html`
            <span
              onClick=${() => isAdmin && onStatusClick(STATUS_NEXT[song.status] ?? 'pending')}
              onKeyDown=${(e) => { if (isAdmin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onStatusClick(STATUS_NEXT[song.status] ?? 'pending'); } }}
              role=${isAdmin ? 'button' : undefined}
              tabIndex=${isAdmin ? '0' : undefined}
              aria-label=${isAdmin ? `Estado: ${t(`status.${song.status}`)}. Click para cambiar.` : `Estado: ${t(`status.${song.status}`)}`}
              style="margin-left:auto;font-size:0.72rem;color:${STATUS_COLOR[song.status] ?? 'var(--muted)'};cursor:${isAdmin ? 'pointer' : 'default'};white-space:nowrap"
            >● ${t(`status.${song.status ?? 'pending'}`)}${isAdmin ? ' ▸' : ''}</span>
          `}
        </div>
      </div>

      ${saveMsg && html`<p aria-live="polite" style="color:var(--green);margin:0 0 12px;font-family:var(--mono);font-size:0.85rem">${saveMsg}</p>`}

      <!-- ESTRUCTURA -->
      ${song?.structure && html`
        <div style="${secBlock}">
          <${SecLabel} label=${t('section.structure')} />
          <div style="${sectionBoxStyle}">${song.structure}</div>
        </div>
      `}

      <!-- PLAY ZONE: metrónomo + progresión -->
      ${!isCreate && (song?.tempo || song?.progression || song?.key) && html`
        <div style="background:var(--panel);border-left:3px solid var(--accent);margin-bottom:20px">

          ${song?.tempo && html`
            <div style="padding:14px 14px 12px">
              <div style="font-family:var(--mono);font-size:0.65rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.25em;margin-bottom:10px">
                ${t('section.metronome')}
              </div>
              <${Metronome} initialTempo=${song.tempo} />
            </div>
          `}

          ${(song?.progression || song?.key) && html`
            ${song?.tempo && html`<div style="border-top:1px solid var(--line)"></div>`}
            <div style="padding:12px 14px 14px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-family:var(--mono);font-size:0.8rem">
                <span style="font-family:var(--mono);font-size:0.65rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.25em">${t('section.chords')}</span>
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
                <div style="font-family:var(--mono);font-size:1rem;line-height:1.6;background:var(--panel-strong);padding:12px 14px;white-space:pre-wrap;word-break:break-word">${displayProgression}</div>
              `}
            </div>
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

    </main>
  `;
}
