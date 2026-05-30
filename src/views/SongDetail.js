import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, $songsLoaded, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands, $currentUser } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { getSongWithTabs, saveSongWithTabs, deleteSong, updateSongStatus } from '@/db/songs.js';
import { transposeText, transposeNote } from '@/lib/transpose.js';
import { createMetronome, parseBPM } from '@/lib/metronome.js';
import { useTranslation } from '@/stores/useTranslation.js';
import { AtrilHeader } from '@/views/AtrilHeader.js';

const STATUS_NEXT = { pending: 'rehearsing', rehearsing: 'ready', ready: 'pending' };
const STATUS_COLOR = { pending: 'var(--muted)', rehearsing: 'var(--yellow)', ready: 'var(--green)' };

const EMPTY_FORM = {
  title: '', artist: '', key: '', tempo: '',
  structure: '', progression: '', lyrics: '', notes: ''
};

const APARTADO_TYPE_IDS = ['text', 'code', 'gallery'];

const PRESETS = [
  { name: 'Bajo', type: 'code', owner: 'Banda' },
  { name: 'Bateria', type: 'text', owner: 'Banda' },
  { name: 'Teclado', type: 'code', owner: 'Banda' },
  { name: 'Voces', type: 'text', owner: 'Banda' },
  { name: 'Galeria', type: 'gallery', owner: 'Banda' },
  { name: 'Arreglo', type: 'text', owner: 'Banda' }
];

function emptyForm() {
  return { ...EMPTY_FORM };
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

function ownerFromUser(user) {
  const email = user?.email ?? '';
  return email.includes('@') ? email.split('@')[0] : 'Tu';
}

function buildDefaultApartados(song, tabs = []) {
  const safeSongId = song?.id ?? 'new';
  const items = [
    {
      id: 'a-estructura',
      name: 'Estructura',
      type: 'text',
      owner: 'Banda',
      locked: true,
      content: song?.structure ?? ''
    },
    {
      id: 'a-acordes',
      name: 'Acordes',
      type: 'code',
      owner: 'Banda',
      locked: true,
      content: song?.progression ?? ''
    },
    ...tabs.map((tab, index) => ({
      id: `a-tab-${tab.id ?? index}`,
      name: tab.title || `Tab ${index + 1}`,
      type: 'code',
      owner: 'Banda',
      locked: true,
      content: tab.content ?? ''
    }))
  ];

  if (song?.lyrics) {
    items.push({
      id: 'a-letra',
      name: 'Letra',
      type: 'text',
      owner: 'Banda',
      locked: true,
      content: song.lyrics
    });
  }

  items.push(
    {
      id: 'a-galeria',
      name: 'Galeria',
      type: 'gallery',
      owner: 'Banda',
      locked: false,
      content: [
        { id: `${safeSongId}-score`, placeholder: 'Partitura o cifrado' },
        { id: `${safeSongId}-setup`, placeholder: 'Foto de setup' }
      ]
    },
    {
      id: 'a-notas',
      name: 'Notas',
      type: 'text',
      owner: 'Banda',
      locked: true,
      content: song?.notes ?? ''
    }
  );

  return items;
}

function glyphFor(type) {
  if (type === 'code') return '⌗';
  if (type === 'gallery') return '▧';
  return '¶';
}

function Metronome({ initialTempo }) {
  const t = useTranslation('songs');
  const [bpm, setBpm] = useState(() => parseBPM(String(initialTempo ?? ''), 80));
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const metroRef = useRef(null);

  useEffect(() => {
    const metronome = createMetronome({ bpm, beatsPerBar: 4, onBeat: (nextBeat) => setBeat(nextBeat) });
    metroRef.current = metronome;
    return () => metronome.stop();
  }, []);

  function changeBpm(delta) {
    setBpm((prev) => {
      const next = Math.min(300, Math.max(20, prev + delta));
      metroRef.current?.setBPM(next);
      return next;
    });
  }

  function togglePlay() {
    const metronome = metroRef.current;
    if (!metronome) return;
    if (playing) {
      metronome.stop();
      setPlaying(false);
      setBeat(0);
    } else {
      metronome.start();
      setPlaying(true);
    }
  }

  const buttonStyle = 'background:var(--panel-strong);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:0.75rem;padding:0 8px;height:24px;border-radius:4px;cursor:pointer';

  return html`
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div>
        <div style="font-family:var(--mono);font-size:1.5rem;font-weight:700;color:var(--accent);line-height:1">${bpm}</div>
        <div style="font-family:var(--mono);font-size:0.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.2em">BPM</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <button type="button" onClick=${() => changeBpm(-5)} style=${buttonStyle}>-5</button>
        <button type="button" onClick=${() => changeBpm(-1)} style=${buttonStyle}>-1</button>
        <button
          type="button"
          onClick=${togglePlay}
          style="width:34px;height:34px;border-radius:50%;border:none;background:${playing ? 'var(--green)' : 'var(--accent)'};color:var(--accent-contrast);font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-accent-btn)"
          aria-label=${playing ? t('aria.metronome_stop') : t('aria.metronome_start')}
          aria-pressed=${playing}
        >${playing ? '■' : '▶'}</button>
        <button type="button" onClick=${() => changeBpm(1)} style=${buttonStyle}>+1</button>
        <button type="button" onClick=${() => changeBpm(5)} style=${buttonStyle}>+5</button>
      </div>
      <div style="display:flex;gap:5px;align-items:center;margin-left:auto">
        ${[1, 2, 3, 4].map((item) => html`
          <span
            key=${item}
            style="width:${item === 1 ? '9px' : '7px'};height:${item === 1 ? '9px' : '7px'};border-radius:50%;background:${beat === item ? (item === 1 ? 'var(--yellow)' : 'var(--accent)') : 'var(--line)'};transition:background 0.05s"
          ></span>
        `)}
      </div>
    </div>
  `;
}

function ApartadoComposer({ composer, setComposer, presets, onCancel, onCommit }) {
  const t = useTranslation('songs');
  return html`
    <div class="sd-composer">
      <div class="sd-composer-head">
        <span class="sd-composer-eyebrow">${t('apartado.new_eyebrow')}</span>
        <button class="sd-composer-x" type="button" onClick=${onCancel} aria-label=${t('common:action.close')}>×</button>
      </div>

      <div class="sd-composer-row">
        <label class="sd-composer-label" for="apartado-name">${t('apartado.name_label')}</label>
        <input
          id="apartado-name"
          class="sd-composer-input"
          autoFocus=${true}
          placeholder=${t('apartado.name_placeholder')}
          value=${composer.name}
          onInput=${(event) => setComposer({ ...composer, name: event.currentTarget.value })}
          onKeyDown=${(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit();
            }
          }}
        />
      </div>

      <div class="sd-composer-row">
        <span class="sd-composer-label">${t('apartado.type_label')}</span>
        <div class="sd-composer-types">
          ${APARTADO_TYPE_IDS.map((typeId) => html`
            <button
              key=${typeId}
              type="button"
              class=${composer.type === typeId ? 'sd-composer-type is-active' : 'sd-composer-type'}
              onClick=${() => setComposer({ ...composer, type: typeId })}
            >
              <span class="sd-composer-type-glyph">${glyphFor(typeId)}</span>
              <span class="sd-composer-type-label">${t('type.' + typeId + '_label')}</span>
              <span class="sd-composer-type-hint">${t('type.' + typeId + '_hint')}</span>
            </button>
          `)}
        </div>
      </div>

      ${presets.length > 0 && html`
        <div class="sd-composer-row">
          <span class="sd-composer-label">${t('apartado.presets_label')}</span>
          <div class="sd-composer-presets">
            ${presets.map((preset) => html`
              <button
                key=${preset.name}
                type="button"
                class="sd-preset"
                onClick=${() => setComposer({ ...composer, ...preset })}
              >
                <span class="sd-preset-glyph">${glyphFor(preset.type)}</span>
                <span>${preset.name}</span>
              </button>
            `)}
          </div>
        </div>
      `}

      <div class="sd-composer-foot">
        <button class="ap-btn ap-btn-ghost" type="button" onClick=${onCancel}>${t('common:action.cancel')}</button>
        <button class="ap-btn ap-btn-accent" type="button" onClick=${onCommit}>${t('apartado.create')}</button>
      </div>
    </div>
  `;
}

function ApartadoBody({ active, canEdit, onChange }) {
  const t = useTranslation('songs');
  if (!active) {
    return html`<p class="sd-panel-owner">${t('apartado.empty')}</p>`;
  }

  if (active.type === 'gallery') {
    const slots = Array.isArray(active.content) ? active.content : [];
    return html`
      <div class="sd-gallery">
        ${slots.map((slot) => html`
          <div class="sd-gallery-item" key=${slot.id}>
            <image-slot
              id=${`img-${active.id}-${slot.id}`}
              shape="rounded"
              radius="6"
              style="width:100%;height:220px;display:block"
              placeholder=${slot.placeholder}
            ></image-slot>
            <div class="sd-gallery-caption">${slot.placeholder}</div>
          </div>
        `)}
        ${canEdit && html`
          <button
            class="sd-gallery-add"
            type="button"
            onClick=${() => onChange([
              ...slots,
              { id: `g-${Math.random().toString(36).slice(2, 8)}`, placeholder: t('gallery.new_image') }
            ])}
          >
            <span class="sd-gallery-add-plus">+</span>
            <span>${t('gallery.add_image')}</span>
          </button>
        `}
      </div>
    `;
  }

  const lines = String(active.content || '').split('\n').length + 2;
  return html`
    <textarea
      class=${active.type === 'code' ? 'sd-code' : 'sd-text'}
      value=${active.content || ''}
      readOnly=${!canEdit}
      spellCheck=${active.type !== 'code'}
      rows=${Math.max(active.type === 'code' ? 10 : 8, lines)}
      placeholder=${t('apartado.notes_placeholder')}
      onInput=${(event) => onChange(event.currentTarget.value)}
    ></textarea>
  `;
}

export function SongDetail({ bandId, songId, navigate }) {
  const t = useTranslation('songs');
  const isCreate = songId === null;
  const songs = useStoreValue($songs);
  const songsLoaded = useStoreValue($songsLoaded);
  const bands = useStoreValue($bands);
  const currentUser = useStoreValue($currentUser);
  const band = bands.find((item) => item.id === bandId);
  const canEdit = Boolean(currentUser?.id && band);

  const storeSong = songs.find((item) => item.id === songId) ?? null;
  const [song, setSong] = useState(isCreate ? null : storeSong);
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');
  const [transpose, setTranspose] = useState(0);
  const [showMetronome, setShowMetronome] = useState(false);

  const [editMode, setEditMode] = useState(isCreate);
  const [form, setForm] = useState(isCreate ? emptyForm() : formFromSong(storeSong));
  const [tabEdits, setTabEdits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const [apartados, setApartados] = useState(() => (storeSong ? buildDefaultApartados(storeSong, []) : []));
  const [activeId, setActiveId] = useState(() => apartados[0]?.id ?? '');
  const [composer, setComposer] = useState(null);

  function resetApartados(nextSong, nextTabs) {
    const next = buildDefaultApartados(nextSong, nextTabs);
    setApartados(next);
    setActiveId(next[0]?.id ?? '');
    setComposer(null);
  }

  useEffect(() => {
    setSaveError('');
    setSaveMsg('');
    setTranspose(0);
    setShowMetronome(false);

    if (isCreate) {
      setSong(null);
      setTabs([]);
      setLoading(false);
      setLoadError('');
      setEditMode(true);
      setForm(emptyForm());
      setTabEdits([]);
      setApartados([]);
      setActiveId('');
      setComposer(null);
      return;
    }

    let active = true;
    setSong(storeSong);
    setTabs([]);
    setForm(formFromSong(storeSong));
    setEditMode(false);
    setTabEdits([]);
    if (storeSong) resetApartados(storeSong, []);
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
        resetApartados(data, data.tabs ?? []);
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
    if (isCreate) {
      navigate(`/band/${bandId}`, { replace: true });
      return;
    }
    setEditMode(false);
    setSaveError('');
  }

  function updateField(key) {
    return (event) => setForm((prev) => ({ ...prev, [key]: event.currentTarget.value }));
  }

  async function onStatusClick(nextStatus) {
    if (!song || !canEdit) return;
    const prev = song.status;
    setSong((current) => ({ ...current, status: nextStatus }));
    patchSongInStore(songId, { status: nextStatus });
    try {
      await updateSongStatus(getSupabase(), { songId, bandId, status: nextStatus });
    } catch (err) {
      setSong((current) => ({ ...current, status: prev }));
      patchSongInStore(songId, { status: prev });
      console.error('updateSongStatus failed', err);
    }
  }

  function addTabEdit() {
    setTabEdits((prev) => [...prev, { id: null, title: '', content: '', position: prev.length, _isNew: true }]);
  }

  function updateTabEdit(index, key, value) {
    setTabEdits((prev) => prev.map((tab, itemIndex) => (itemIndex === index ? { ...tab, [key]: value } : tab)));
  }

  function removeTabEdit(index) {
    setTabEdits((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onSave(event) {
    event?.preventDefault?.();
    if (saving) return;
    if (!canEdit) {
      setSaveError(t('action.admin_required'));
      return;
    }
    if (!form.title.trim()) {
      setSaveError(t('action.title_required'));
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
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
        resetApartados(saved, saved.tabs ?? []);
        navigate(`/band/${bandId}/song/${saved.id}`, { replace: true });
        return;
      }
      setSong(saved);
      setTabs(saved.tabs ?? []);
      resetApartados(saved, saved.tabs ?? []);
      patchSongInStore(songId, saved);
      setSaveMsg(t('action.saved'));
      setEditMode(false);
    } catch (err) {
      console.error('saveSongWithTabs failed', err);
      const detail = err?.message;
      setSaveError(detail ? `${t('common:error.save_failed')} (${detail})` : t('common:error.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canEdit) {
      setSaveError(t('action.admin_required'));
      return;
    }
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

  function openComposer(preset = null) {
    const seed = preset || { name: '', type: 'text', owner: ownerFromUser(currentUser) };
    setComposer(seed);
  }

  function commitComposer() {
    if (!composer?.name?.trim()) return;
    const id = `a-${Math.random().toString(36).slice(2, 8)}`;
    const initialContent = composer.type === 'gallery'
      ? [{ id: `g-${id}`, placeholder: composer.name.trim() }]
      : '';
    const next = {
      id,
      name: composer.name.trim(),
      type: composer.type,
      owner: composer.owner || ownerFromUser(currentUser),
      locked: false,
      content: initialContent
    };
    setApartados((prev) => [...prev, next]);
    setActiveId(id);
    setComposer(null);
  }

  function deleteActive(active) {
    if (!active || active.locked) return;
    const next = apartados.filter((item) => item.id !== active.id);
    setApartados(next);
    setActiveId(next[0]?.id ?? '');
  }

  function updateActiveContent(active, content) {
    if (!active) return;
    if (active.id === 'a-acordes' && transpose !== 0) setTranspose(0);
    setApartados((prev) => prev.map((item) => (item.id === active.id ? { ...item, content } : item)));
  }

  const displayKey = song?.key
    ? (transpose === 0 ? song.key : (transposeNote(song.key, transpose) ?? song.key))
    : '';
  const displayProgression = song?.progression
    ? (transpose === 0 ? song.progression : transposeText(song.progression, transpose))
    : '';

  const active = apartados.find((item) => item.id === activeId) ?? apartados[0] ?? null;
  const activeForBody = active?.id === 'a-acordes' && displayProgression
    ? { ...active, content: displayProgression }
    : active;
  const availablePresets = PRESETS.filter((preset) => !apartados.some((item) => item.name === preset.name));
  const songNumber = useMemo(() => {
    const index = songs.findIndex((item) => item.id === songId);
    return index >= 0 ? String(index + 1).padStart(2, '0') : '00';
  }, [songId, songs]);

  if (loading && !song) {
    return html`
      <div class="app-root">
        <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" />
        <main class="app-main">
          <p style="color:var(--muted);font-family:var(--mono)">${t('common:loading')}</p>
        </main>
      </div>
    `;
  }

  if (loadError) {
    return html`
      <div class="app-root">
        <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" />
        <main class="app-main">
          <p role="alert" class="ap-alert">${loadError}</p>
          <button class="ap-btn ap-btn-ghost" type="button" onClick=${() => navigate(`/band/${bandId}`)}>
            ${t('common:action.back')}
          </button>
        </main>
      </div>
    `;
  }

  if (isCreate && !canEdit) {
    return html`
      <div class="app-root">
        <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" />
        <main class="app-main">
          <p role="alert" class="ap-alert">${t('action.admin_required')}</p>
        </main>
      </div>
    `;
  }

  if (editMode) {
    return html`
      <div class="app-root">
        <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" />
        <main class="app-main">
          <form class="form-shell" onSubmit=${onSave}>
            <div class="form-actions">
              <div>
                <div class="sl-eyebrow">${t(isCreate ? 'form.create_eyebrow' : 'form.edit_eyebrow')}</div>
                <h1 class="form-title">${isCreate ? t('action.new_song') : (song?.title ?? t('action.new_song'))}</h1>
              </div>
              <div class="form-actions-right">
                <button class="ap-btn ap-btn-ghost" type="button" onClick=${cancelEdit} disabled=${saving}>
                  ${t('common:action.cancel')}
                </button>
                <button class="ap-btn ap-btn-accent" type="submit" disabled=${saving}>
                  ${saving ? t('common:saving') : (isCreate ? t('common:action.create') : t('common:action.save'))}
                </button>
              </div>
            </div>

            ${saveError && html`<p role="alert" class="ap-alert">${saveError}</p>`}

            <section class="form-card">
              <div class="form-grid-2">
                <label class="form-field">
                  <span class="form-label">${t('field.title')}</span>
                  <input
                    class="form-input form-input-title"
                    name="title"
                    value=${form.title}
                    onInput=${updateField('title')}
                    required
                    disabled=${saving}
                  />
                </label>
                <label class="form-field">
                  <span class="form-label">${t('field.artist')}</span>
                  <input
                    class="form-input"
                    name="artist"
                    value=${form.artist}
                    onInput=${updateField('artist')}
                    disabled=${saving}
                  />
                </label>
                <label class="form-field">
                  <span class="form-label">${t('field.key')}</span>
                  <input class="form-input" name="key" value=${form.key} onInput=${updateField('key')} disabled=${saving} />
                </label>
                <label class="form-field">
                  <span class="form-label">${t('field.tempo')}</span>
                  <input class="form-input" name="tempo" value=${form.tempo} onInput=${updateField('tempo')} disabled=${saving} />
                </label>
              </div>
            </section>

            <section class="form-card">
              <div class="form-grid-2">
                <label class="form-field">
                  <span class="form-label">${t('section.structure')}</span>
                  <textarea class="form-textarea" name="structure" value=${form.structure} onInput=${updateField('structure')} disabled=${saving} rows="5"></textarea>
                </label>
                <label class="form-field">
                  <span class="form-label">${t('section.progression')}</span>
                  <textarea class="form-textarea form-textarea-code" name="progression" value=${form.progression} onInput=${updateField('progression')} disabled=${saving} rows="5"></textarea>
                </label>
              </div>
            </section>

            <section class="form-card">
              <div class="sd-panel-head" style="margin-bottom:14px">
                <div>
                  <span class="sd-panel-type">${t('section.tabs')}</span>
                  <h2 class="sd-panel-title" style="font-size:1.6rem">${t('form.extra_tabs_label')}</h2>
                </div>
                <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${addTabEdit} disabled=${saving}>
                  ${t('action.add_tab')}
                </button>
              </div>
              <div class="form-shell">
                ${tabEdits.map((tab, index) => html`
                  <div key=${index} class="form-card" style="padding:16px;background:var(--bg)">
                    <div class="form-grid-2" style="grid-template-columns:minmax(0,1fr) auto">
                      <label class="form-field">
                        <span class="form-label">${t('placeholder.tab_name')}</span>
                        <input
                          class="form-input"
                          value=${tab.title}
                          onInput=${(event) => updateTabEdit(index, 'title', event.currentTarget.value)}
                          disabled=${saving}
                        />
                      </label>
                      <button class="ap-btn ap-btn-danger-sm" type="button" onClick=${() => removeTabEdit(index)} disabled=${saving}>
                        ${t('common:action.delete')}
                      </button>
                    </div>
                    <label class="form-field" style="margin-top:12px">
                      <span class="form-label">${t('placeholder.tab_content')}</span>
                      <textarea
                        class="form-textarea form-textarea-code"
                        value=${tab.content}
                        onInput=${(event) => updateTabEdit(index, 'content', event.currentTarget.value)}
                        rows="6"
                        disabled=${saving}
                      ></textarea>
                    </label>
                  </div>
                `)}
                ${tabEdits.length === 0 && html`<p class="sd-panel-owner">${t('placeholder.no_tabs')}</p>`}
              </div>
            </section>

            <section class="form-card">
              <div class="form-grid-2">
                <label class="form-field">
                  <span class="form-label">${t('section.lyrics')}</span>
                  <textarea class="form-textarea" name="lyrics" value=${form.lyrics} onInput=${updateField('lyrics')} disabled=${saving} rows="10" style="font-family:var(--serif);line-height:1.7"></textarea>
                </label>
                <label class="form-field">
                  <span class="form-label">${t('section.notes')}</span>
                  <textarea class="form-textarea" name="notes" value=${form.notes} onInput=${updateField('notes')} disabled=${saving} rows="10"></textarea>
                </label>
              </div>
            </section>

            ${!isCreate && html`
              <section class="form-card" style="border-color:var(--red-line);background:color-mix(in srgb,var(--red-line),transparent 92%)">
                <div class="form-actions" style="margin-bottom:0">
                  <div>
                    <span class="sd-panel-type" style="color:var(--red)">${t('danger.title')}</span>
                    <p class="sd-panel-owner">${t('danger.delete_warning')}</p>
                  </div>
                  <button class="ap-btn ap-btn-danger-sm" type="button" onClick=${onDelete} disabled=${saving}>
                    ${t('common:action.delete')}
                  </button>
                </div>
              </section>
            `}
          </form>
        </main>
      </div>
    `;
  }

  const status = song?.status ?? 'pending';
  const statusLabel = t(`status.${status}`);

  return html`
    <div class="app-root">
      <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" canEdit=${canEdit} />
      <main class="app-main">
        <section class="sd" aria-labelledby="song-detail-title">
          <header class="sd-hero">
            <div>
              <div class="sd-eyebrow">${t('form.song_number', { number: songNumber })}</div>
              <h1 id="song-detail-title" class="sd-title">${song?.title ?? t('action.new_song')}</h1>
              <p class="sd-artist">
                ${song?.artist || t('panel.no_artist')}
                ${song && html`
                  <button
                    type="button"
                    class="sc-status sc-status-button"
                    style="margin-left:10px"
                    disabled=${!canEdit}
                    onClick=${() => onStatusClick(STATUS_NEXT[status] ?? 'pending')}
                    aria-label=${t('aria.status_change', { status: statusLabel })}
                  >
                    <span class="sc-status-dot" style=${`background:${STATUS_COLOR[status] ?? 'var(--muted)'}`}></span>
                    <span>${statusLabel}</span>
                  </button>
                `}
              </p>
            </div>

            <div class="sd-hero-stats">
              ${displayKey && html`
                <div class="sd-stat">
                  <span class="sd-stat-label">${t('panel.key_stat')}</span>
                  <span class="sd-stat-value sd-stat-key">${transpose !== 0 ? `${song.key} -> ${displayKey}` : displayKey}</span>
                </div>
              `}
              ${song?.tempo && html`
                <div class="sd-stat">
                  <span class="sd-stat-label">Tempo</span>
                  <span class="sd-stat-value sd-stat-bpm">${song.tempo}</span>
                </div>
              `}
              <div class="sd-stat sd-stat-action">
                ${song?.tempo && html`
                  <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setShowMetronome((value) => !value)}>
                    ${t(showMetronome ? 'panel.hide_metronome' : 'panel.show_metronome')}
                  </button>
                `}
                <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => window.print()}>
                  ${t('panel.export_pdf')}
                </button>
                ${canEdit && !isCreate && html`
                  <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${enterEdit}>
                    ${t('common:action.edit')}
                  </button>
                `}
              </div>
            </div>
          </header>

          ${saveMsg && html`<p aria-live="polite" style="color:var(--green);margin:0 0 12px;font-family:var(--mono);font-size:0.85rem">${saveMsg}</p>`}
          ${showMetronome && song?.tempo && html`<div class="sd-inline-tool"><${Metronome} initialTempo=${song.tempo} /></div>`}

          <div class="sd-tabs" role="tablist" aria-label=${t('aria.sections_list')}>
            <div class="sd-tabs-scroll">
              ${apartados.map((item) => html`
                <button
                  key=${item.id}
                  class=${item.id === activeId ? 'sd-tab is-active' : 'sd-tab'}
                  type="button"
                  role="tab"
                  aria-selected=${item.id === activeId}
                  onClick=${() => setActiveId(item.id)}
                >
                  <span class="sd-tab-glyph" aria-hidden="true">${glyphFor(item.type)}</span>
                  <span class="sd-tab-name">${item.name}</span>
                  <span class="sd-tab-owner">${item.owner}</span>
                </button>
              `)}
              ${canEdit && html`
                <button class="sd-tab sd-tab-add" type="button" onClick=${() => openComposer(null)}>
                  <span aria-hidden="true">+</span>
                  <span>${t('apartado.add')}</span>
                </button>
              `}
            </div>
          </div>

          ${composer && html`
            <${ApartadoComposer}
              composer=${composer}
              setComposer=${setComposer}
              presets=${availablePresets}
              onCancel=${() => setComposer(null)}
              onCommit=${commitComposer}
            />
          `}

          <div class="sd-panel">
            <div class="sd-panel-head">
              <div>
                <span class="sd-panel-type">${active ? `${glyphFor(active.type)} ${t('type.' + active.type + '_label')}` : 'APARTADO'}</span>
                <h2 class="sd-panel-title">${active?.name ?? t('apartado.no_active')}</h2>
                <p class="sd-panel-owner">
                  Apartado de <strong>${active?.owner ?? 'Banda'}</strong>
                  ${active?.locked ? ` · ${t('apartado.section_base')}` : ` · ${t('apartado.section_custom')}`}
                </p>
              </div>
              <div class="sd-panel-actions">
                ${active?.id === 'a-acordes' && (song?.progression || song?.key) && html`
                  <div class="sd-transpose" aria-label=${t('panel.transpose')}>
                    <span class="sd-transpose-label">${t('panel.transpose')}</span>
                    <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setTranspose((value) => value - 1)}>-</button>
                    <span>${transpose > 0 ? `+${transpose}` : transpose}</span>
                    <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setTranspose((value) => value + 1)}>+</button>
                    ${transpose !== 0 && html`
                      <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setTranspose(0)}>${t('panel.reset_transpose')}</button>
                    `}
                  </div>
                `}
                ${active?.type === 'gallery' && canEdit && html`
                  <button
                    class="ap-btn ap-btn-ghost-sm"
                    type="button"
                    onClick=${() => updateActiveContent(active, [
                      ...(Array.isArray(active.content) ? active.content : []),
                      { id: `g-${Math.random().toString(36).slice(2, 8)}`, placeholder: t('gallery.new_image') }
                    ])}
                  >
                    ${t('gallery.add_image_inline')}
                  </button>
                `}
                ${active && !active.locked && canEdit && html`
                  <button class="ap-btn ap-btn-danger-sm" type="button" onClick=${() => deleteActive(active)}>
                    ${t('common:action.delete')}
                  </button>
                `}
              </div>
            </div>

            <${ApartadoBody}
              active=${activeForBody}
              canEdit=${canEdit}
              onChange=${(content) => updateActiveContent(active, content)}
            />
          </div>
        </section>
      </main>

      <footer class="app-foot">
        <span>Atril</span>
        <span class="app-foot-dot">•</span>
        <span>${band?.name ?? t('panel.footer_band')}</span>
      </footer>
    </div>
  `;
}
