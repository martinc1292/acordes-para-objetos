import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands, $currentUser } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import { getSongWithTabs, saveSongWithTabs, deleteSong, updateSongStatus } from '@/db/songs.js';
import { transposeText, transposeNote } from '@/lib/transpose.js';
import { createMetronome, parseBPM } from '@/lib/metronome.js';
import { useTranslation } from '@/stores/useTranslation.js';
import { AtrilHeader } from '@/views/AtrilHeader.js';

const STATUS_OPTIONS = [
  { id: 'pending', color: 'var(--status-suggestion)' },
  { id: 'rehearsing', color: 'var(--status-rehearsing)' },
  { id: 'ready', color: 'var(--status-ready)' }
];

const APARTADO_TYPE_IDS = ['text', 'code', 'gallery'];

// Mega "Todos" sections map 1:1 to persisted song columns.
const MEGA_SECTIONS = [
  { id: 'sec-estructura', field: 'structure', type: 'text', titleKey: 'section.structure' },
  { id: 'sec-acordes', field: 'progression', type: 'code', titleKey: 'section.chords' },
  { id: 'sec-letra', field: 'lyrics', type: 'text', titleKey: 'section.lyrics' },
  { id: 'sec-notas', field: 'notes', type: 'text', titleKey: 'section.notes' }
];

const PRESETS = [
  { name: 'Bajo', type: 'code', owner: 'Banda' },
  { name: 'Bateria', type: 'code', owner: 'Banda' },
  { name: 'Teclado', type: 'code', owner: 'Banda' },
  { name: 'Voces', type: 'text', owner: 'Banda' },
  { name: 'Arreglo', type: 'text', owner: 'Banda' }
];

function metaFromSong(song) {
  return {
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    key: song?.key ?? '',
    tempo: song?.tempo ?? ''
  };
}

function ownerFromUser(user) {
  const email = user?.email ?? '';
  return email.includes('@') ? email.split('@')[0] : 'Tu';
}

// Build the apartado list: a "Todos" mega tab (stacked song fields), a gallery,
// then any extra tabs persisted on the song. Custom apartados added in-session
// are appended and persisted as tabs on save.
function buildApartados(song, tabs = []) {
  const safeSongId = song?.id ?? 'new';
  const mega = {
    id: 'a-todos',
    type: 'mega',
    owner: 'Banda',
    locked: true,
    sections: MEGA_SECTIONS.map((section) => ({
      ...section,
      content: song?.[section.field] ?? ''
    }))
  };
  const gallery = {
    id: 'a-galeria',
    type: 'gallery',
    owner: 'Banda',
    locked: false,
    content: [
      { id: `${safeSongId}-score`, placeholder: 'Partitura o cifrado' },
      { id: `${safeSongId}-setup`, placeholder: 'Foto de setup' }
    ]
  };
  const customTabs = tabs.map((tab, index) => ({
    id: `a-tab-${tab.id ?? `new-${index}`}`,
    tabId: tab.id ?? null,
    name: tab.title || `Tab ${index + 1}`,
    type: 'code',
    owner: 'Banda',
    locked: false,
    content: tab.content ?? ''
  }));
  return [mega, gallery, ...customTabs];
}

// Collect the persistable song fields + tabs from the live apartado state.
// Note: ordering is handled by created_at on the backend, so no sort_order here.
function collectPayload(meta, apartados) {
  const mega = apartados.find((item) => item.type === 'mega');
  const sectionContent = (field) =>
    (mega?.sections.find((section) => section.field === field)?.content ?? '').trim() || null;

  const fields = {
    title: meta.title.trim(),
    artist: meta.artist.trim() || null,
    key: meta.key.trim() || null,
    tempo: meta.tempo.trim() || null,
    structure: sectionContent('structure'),
    progression: sectionContent('progression'),
    lyrics: sectionContent('lyrics'),
    notes: sectionContent('notes')
  };

  const tabs = apartados
    .filter((item) => item.type !== 'mega' && item.type !== 'gallery')
    .map((item, index) => {
      const title = (item.name ?? '').trim();
      const content = item.content ?? '';
      if (!title && !String(content).trim()) return null;
      return { id: item.tabId || undefined, title: title || 'Tab', content, position: index };
    })
    .filter(Boolean);

  return { fields, tabs };
}

function glyphFor(type) {
  if (type === 'code') return '⌗';
  if (type === 'gallery') return '◫';
  if (type === 'mega') return '≡';
  return '¶';
}

function typeLabelKey(type) {
  if (type === 'mega') return 'type.mega_label';
  if (type === 'code') return 'type.code_label';
  if (type === 'gallery') return 'type.gallery_label';
  return 'type.text_label';
}

function apartadoLabel(apartado, t) {
  if (!apartado) return '';
  if (apartado.type === 'mega') return t('apartado.all');
  if (apartado.id === 'a-galeria') return t('type.gallery_label');
  return apartado.name;
}

function StatusToggle({ value, onChange, disabled, t }) {
  return html`
    <div class="sd-status-toggle" role="group" aria-label=${t('aria.status')}>
      ${STATUS_OPTIONS.map((option) => html`
        <button
          key=${option.id}
          type="button"
          class=${value === option.id ? 'sd-status-btn is-active' : 'sd-status-btn'}
          style=${`--s-color:${option.color}`}
          aria-pressed=${value === option.id}
          disabled=${disabled}
          onClick=${() => onChange(option.id)}
        >
          <span class="sd-status-dot" aria-hidden="true"></span>
          <span>${t(`status.${option.id}`)}</span>
        </button>
      `)}
    </div>
  `;
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

function ReadBlock({ type, content, t }) {
  if (!String(content ?? '').trim()) {
    return html`<p class=${type === 'code' ? 'sd-read-code' : 'sd-read-text'}><em class="sd-empty-hint">${t('apartado.empty_section')}</em></p>`;
  }
  if (type === 'code') return html`<pre class="sd-read-code">${content}</pre>`;
  return html`<p class="sd-read-text">${content}</p>`;
}

function EditBlock({ type, content, onChange, t }) {
  const lines = String(content || '').split('\n').length + 2;
  return html`
    <textarea
      class=${type === 'code' ? 'sd-code' : 'sd-text'}
      value=${content || ''}
      spellCheck=${type !== 'code'}
      rows=${Math.max(type === 'code' ? 8 : 5, lines)}
      placeholder=${t('apartado.notes_placeholder')}
      onInput=${(event) => onChange(event.currentTarget.value)}
    ></textarea>
  `;
}

function ApartadoBody({ active, editMode, canEdit, onChangeContent, onChangeSection, t }) {
  if (!active) {
    return html`<p class="sd-panel-owner">${t('apartado.empty')}</p>`;
  }

  if (active.type === 'mega') {
    return html`
      <div class="sd-mega">
        ${active.sections.map((section) => html`
          <div class="sd-mega-section" key=${section.id}>
            <h3 class="sd-mega-section-title">${t(section.titleKey)}</h3>
            ${editMode
              ? html`<${EditBlock} type=${section.type} content=${section.content} t=${t} onChange=${(value) => onChangeSection(section.id, value)} />`
              : html`<${ReadBlock} type=${section.type} content=${section.content} t=${t} />`}
          </div>
        `)}
      </div>
    `;
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
        ${editMode && canEdit && html`
          <button
            class="sd-gallery-add"
            type="button"
            onClick=${() => onChangeContent([
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

  // text / code custom apartado
  return editMode
    ? html`<${EditBlock} type=${active.type} content=${active.content} t=${t} onChange=${onChangeContent} />`
    : html`<${ReadBlock} type=${active.type} content=${active.content} t=${t} />`;
}

export function SongDetail({ bandId, songId, navigate }) {
  const t = useTranslation('songs');
  const isCreate = songId === null;
  const songs = useStoreValue($songs);
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
  const [meta, setMeta] = useState(() => metaFromSong(storeSong));
  const [apartados, setApartados] = useState(() => (storeSong ? buildApartados(storeSong, []) : buildApartados(null, [])));
  const [activeId, setActiveId] = useState('a-todos');
  const [composer, setComposer] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  function hydrate(nextSong, nextTabs) {
    setMeta(metaFromSong(nextSong));
    const next = buildApartados(nextSong, nextTabs);
    setApartados(next);
    setActiveId((current) => (next.some((item) => item.id === current) ? current : 'a-todos'));
    setComposer(null);
  }

  useEffect(() => {
    setSaveError('');
    setSaveMsg('');
    setTranspose(0);
    setShowMetronome(false);
    setComposer(null);

    if (isCreate) {
      setSong(null);
      setTabs([]);
      setLoading(false);
      setLoadError('');
      setEditMode(true);
      setMeta(metaFromSong(null));
      setApartados(buildApartados(null, []));
      setActiveId('a-todos');
      return;
    }

    let active = true;
    setSong(storeSong);
    setTabs([]);
    setEditMode(false);
    if (storeSong) hydrate(storeSong, []);
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
        hydrate(data, data.tabs ?? []);
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
    setSnapshot({ meta: { ...meta }, apartados: JSON.parse(JSON.stringify(apartados)) });
    setTranspose(0);
    setShowMetronome(false);
    setSaveError('');
    setSaveMsg('');
    setEditMode(true);
  }

  function cancelEdit() {
    if (isCreate) {
      navigate(`/band/${bandId}`, { replace: true });
      return;
    }
    if (snapshot) {
      setMeta(snapshot.meta);
      setApartados(snapshot.apartados);
      setActiveId((current) => (snapshot.apartados.some((item) => item.id === current) ? current : 'a-todos'));
    }
    setSnapshot(null);
    setComposer(null);
    setSaveError('');
    setEditMode(false);
  }

  async function onStatusChange(nextStatus) {
    if (!song || !canEdit || nextStatus === song.status) return;
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

  function updateMegaSection(sectionId, content) {
    setApartados((prev) => prev.map((item) => (item.id === 'a-todos' && item.type === 'mega'
      ? { ...item, sections: item.sections.map((section) => (section.id === sectionId ? { ...section, content } : section)) }
      : item)));
  }

  function updateActiveContent(active, content) {
    if (!active) return;
    setApartados((prev) => prev.map((item) => (item.id === active.id ? { ...item, content } : item)));
  }

  function openComposer(preset = null) {
    setComposer(preset || { name: '', type: 'text', owner: ownerFromUser(currentUser) });
  }

  function commitComposer() {
    if (!composer?.name?.trim()) return;
    const id = `a-${Math.random().toString(36).slice(2, 8)}`;
    const initialContent = composer.type === 'gallery'
      ? [{ id: `g-${id}`, placeholder: composer.name.trim() }]
      : '';
    const next = {
      id,
      tabId: null,
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
    setApartados((prev) => {
      const next = prev.filter((item) => item.id !== active.id);
      setActiveId((current) => (current === active.id ? (next[0]?.id ?? 'a-todos') : current));
      return next;
    });
  }

  async function onSave(event) {
    event?.preventDefault?.();
    if (saving) return;
    if (!canEdit) {
      setSaveError(t('action.admin_required'));
      return;
    }
    if (!meta.title.trim()) {
      setSaveError(t('action.title_required'));
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      const { fields, tabs: tabPayload } = collectPayload(meta, apartados);
      const saved = await saveSongWithTabs(supabase, {
        bandId,
        songId: isCreate ? null : songId,
        fields,
        tabs: tabPayload
      });
      setSong(saved);
      setTabs(saved.tabs ?? []);
      hydrate(saved, saved.tabs ?? []);
      setSnapshot(null);
      setEditMode(false);
      if (isCreate) {
        addSongToStore(saved);
        navigate(`/band/${bandId}/song/${saved.id}`, { replace: true });
        return;
      }
      patchSongInStore(songId, saved);
      setSaveMsg(t('action.saved'));
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

  const active = apartados.find((item) => item.id === activeId) ?? apartados[0] ?? null;
  const availablePresets = PRESETS.filter((preset) => !apartados.some((item) => item.name === preset.name));
  const status = song?.status ?? 'pending';
  const hasChords = Boolean(song?.progression || song?.key);
  const showTranspose = !editMode && active?.type === 'mega' && hasChords;

  // Apply transpose to the displayed chords section (read mode only).
  const activeForBody = (showTranspose && transpose !== 0 && active?.type === 'mega')
    ? {
        ...active,
        sections: active.sections.map((section) => (section.field === 'progression'
          ? { ...section, content: transposeText(section.content, transpose) }
          : section))
      }
    : active;

  const displayKey = song?.key
    ? (transpose === 0 ? song.key : (transposeNote(song.key, transpose) ?? song.key))
    : '';

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

  const eyebrow = isCreate ? t('form.create_eyebrow') : t('form.song_number', { number: songNumber });

  return html`
    <div class="app-root">
      <${AtrilHeader} band=${band} bandId=${bandId} navigate=${navigate} view="detail" canEdit=${canEdit} />
      <main class="app-main">
        <section class="sd" aria-labelledby="song-detail-title">
          <header class="sd-hero">
            <div class="sd-hero-meta">
              <div class="sd-eyebrow">${eyebrow}</div>
              ${editMode ? html`
                <div class="sd-meta-fields">
                  <input
                    class="sd-meta-input sd-meta-title"
                    value=${meta.title}
                    placeholder=${t('field.title')}
                    aria-label=${t('field.title')}
                    onInput=${(event) => setMeta((prev) => ({ ...prev, title: event.currentTarget.value }))}
                  />
                  <input
                    class="sd-meta-input sd-meta-artist"
                    value=${meta.artist}
                    placeholder=${t('field.artist')}
                    aria-label=${t('field.artist')}
                    onInput=${(event) => setMeta((prev) => ({ ...prev, artist: event.currentTarget.value }))}
                  />
                </div>
              ` : html`
                <h1 id="song-detail-title" class="sd-title">${song?.title ?? t('action.new_song')}</h1>
                <p class="sd-artist">${song?.artist || t('panel.no_artist')}</p>
              `}
            </div>

            <div class="sd-hero-right">
              <div class="sd-hero-stats">
                <div class="sd-stat">
                  <span class="sd-stat-label">${t('panel.key_stat')}</span>
                  ${editMode ? html`
                    <input
                      class="sd-stat-input sd-stat-input-key"
                      value=${meta.key}
                      placeholder="Dm"
                      aria-label=${t('field.key')}
                      onInput=${(event) => setMeta((prev) => ({ ...prev, key: event.currentTarget.value }))}
                    />
                  ` : (displayKey && html`
                    <span class="sd-stat-value sd-stat-key">${transpose !== 0 ? `${song.key} → ${displayKey}` : displayKey}</span>
                  `)}
                </div>
                <div class="sd-stat">
                  <span class="sd-stat-label">Tempo</span>
                  ${editMode ? html`
                    <input
                      class="sd-stat-input sd-stat-input-bpm"
                      value=${meta.tempo}
                      placeholder="120 BPM"
                      aria-label=${t('field.tempo')}
                      onInput=${(event) => setMeta((prev) => ({ ...prev, tempo: event.currentTarget.value }))}
                    />
                  ` : (song?.tempo && html`
                    <span class="sd-stat-value sd-stat-bpm">${song.tempo}</span>
                  `)}
                </div>
              </div>

              <div class="sd-hero-actions">
                ${song && html`
                  <${StatusToggle} value=${status} onChange=${onStatusChange} disabled=${!canEdit} t=${t} />
                `}
                ${!editMode ? html`
                  ${song?.tempo && html`
                    <button class="ap-btn ap-btn-ghost-sm" type="button" onClick=${() => setShowMetronome((value) => !value)}>
                      ${t(showMetronome ? 'panel.hide_metronome' : 'panel.show_metronome')}
                    </button>
                  `}
                  ${canEdit && !isCreate && html`
                    <button class="ap-btn ap-btn-edit" type="button" onClick=${enterEdit}>
                      <span aria-hidden="true">✎</span> ${t('common:action.edit')}
                    </button>
                  `}
                ` : html`
                  <span class="sd-edit-badge">${t('form.edit_badge')}</span>
                  <button class="ap-btn ap-btn-ghost" type="button" onClick=${cancelEdit} disabled=${saving}>
                    ${t('common:action.cancel')}
                  </button>
                  <button class="ap-btn ap-btn-accent" type="button" onClick=${onSave} disabled=${saving}>
                    ${saving ? t('common:saving') : (isCreate ? t('common:action.create') : t('common:action.save'))}
                  </button>
                `}
              </div>
            </div>
          </header>

          ${saveError && html`<p role="alert" class="ap-alert">${saveError}</p>`}
          ${saveMsg && html`<p aria-live="polite" style="color:var(--green);margin:0 0 12px;font-family:var(--mono);font-size:0.85rem">${saveMsg}</p>`}
          ${showMetronome && !editMode && song?.tempo && html`<div class="sd-inline-tool"><${Metronome} initialTempo=${song.tempo} /></div>`}

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
                  <span class="sd-tab-name">${apartadoLabel(item, t)}</span>
                </button>
              `)}
              ${editMode && canEdit && html`
                <button class="sd-tab sd-tab-add" type="button" onClick=${() => openComposer(null)}>
                  <span aria-hidden="true">+</span>
                  <span>${t('apartado.add')}</span>
                </button>
              `}
            </div>
          </div>

          ${editMode && composer && html`
            <${ApartadoComposer}
              composer=${composer}
              setComposer=${setComposer}
              presets=${availablePresets}
              onCancel=${() => setComposer(null)}
              onCommit=${commitComposer}
            />
          `}

          <div class=${editMode ? 'sd-panel is-editing' : 'sd-panel'}>
            <div class="sd-panel-head">
              <div>
                <span class="sd-panel-type">${active ? `${glyphFor(active.type)} ${t(typeLabelKey(active.type))}` : 'APARTADO'}</span>
                <h2 class="sd-panel-title">${apartadoLabel(active, t) || t('apartado.no_active')}</h2>
                <p class="sd-panel-owner">
                  ${t('apartado.section_owned_by', { owner: active?.owner ?? 'Banda' })}
                  ${active?.locked ? ` · ${t('apartado.section_base')}` : ` · ${t('apartado.section_custom')}`}
                </p>
              </div>
              <div class="sd-panel-actions">
                ${showTranspose && html`
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
                ${editMode && active && !active.locked && canEdit && html`
                  <button class="ap-btn ap-btn-danger-sm" type="button" onClick=${() => deleteActive(active)}>
                    ${t('apartado.delete')}
                  </button>
                `}
              </div>
            </div>

            <${ApartadoBody}
              active=${activeForBody}
              editMode=${editMode}
              canEdit=${canEdit}
              onChangeContent=${(content) => updateActiveContent(active, content)}
              onChangeSection=${updateMegaSection}
              t=${t}
            />
          </div>

          ${editMode && !isCreate && canEdit && html`
            <div class="sd-danger">
              <span class="sd-danger-label">${t('danger.delete_warning')}</span>
              <button class="ap-btn ap-btn-danger-sm" type="button" onClick=${onDelete} disabled=${saving}>
                ${t('action.delete_song')}
              </button>
            </div>
          `}
        </section>
      </main>

      <footer class="app-foot">
        <span>Pulso</span>
        <span class="app-foot-dot">•</span>
        <span>${band?.name ?? t('panel.footer_band')}</span>
      </footer>
    </div>
  `;
}
