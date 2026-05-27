import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { $songs, patchSongInStore, addSongToStore, removeSongFromStore } from '@/stores/songs.js';
import { $bands } from '@/stores/auth.js';
import { getSupabase } from '@/db/supabase.js';
import {
  getSongWithTabs, saveSongWithTabs, deleteSong, updateSongStatus
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

      return {
        id: tab.id,
        title: title || 'Tab',
        content,
        position: index
      };
    })
    .filter(Boolean);
}

export function SongDetail({ bandId, songId, navigate }) {
  const isCreate = songId === null;

  const songs = useStoreValue($songs);
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
        title: saved.title,
        artist: saved.artist,
        key: saved.key,
        tempo: saved.tempo,
        status: saved.status
      });
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
