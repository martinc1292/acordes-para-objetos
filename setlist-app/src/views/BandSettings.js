import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getSupabase } from '@/db/supabase.js';
import {
  listBandMembers,
  listInvitations,
  createInvitation,
  updateBandMemberRole,
  removeBandMember,
  leaveBand,
  deleteBand
} from '@/db/bands.js';
import { refreshBands, removeLocalBand, $currentUser, $bands } from '@/stores/auth.js';
import { useStoreValue } from '@/stores/useStoreValue.js';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Miembros' },
  { id: 'advanced', label: 'Avanzado' }
];

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function BandSettings({ bandId, navigate }) {
  const [tab, setTab] = useState('general');
  const tabRefs = useRef({});
  const currentUser = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const band = bands.find((item) => item.id === bandId);
  const isAdmin = band?.role === 'admin';

  function onTabKeyDown(event) {
    const index = TABS.findIndex((item) => item.id === tab);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[nextIndex].id);
    setTimeout(() => {
      tabRefs.current[TABS[nextIndex].id]?.focus();
    }, 0);
  }

  return html`
    <main class="settings-shell">
      <header class="settings-header">
        <h1>${band?.name ?? 'Banda'}</h1>
        <a
          href=${`/band/${bandId}`}
          onClick=${(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            navigate(`/band/${bandId}`);
          }}
        >Volver</a>
      </header>
      <nav class="settings-tabs" role="tablist">
        ${TABS.map((item) => html`
          <button
            type="button"
            role="tab"
            id=${`settings-tab-${item.id}`}
            ref=${(node) => {
              if (node) tabRefs.current[item.id] = node;
            }}
            aria-controls=${`settings-panel-${item.id}`}
            aria-selected=${tab === item.id}
            tabIndex=${tab === item.id ? 0 : -1}
            onClick=${() => setTab(item.id)}
            onKeyDown=${onTabKeyDown}
            class=${tab === item.id ? 'tab tab-active' : 'tab'}
          >${item.label}</button>
        `)}
      </nav>
      <section
        id=${`settings-panel-${tab}`}
        role="tabpanel"
        aria-labelledby=${`settings-tab-${tab}`}
      >
        ${tab === 'general' && html`<${GeneralTab} bandId=${bandId} band=${band} isAdmin=${isAdmin} />`}
        ${tab === 'members' && html`<${MembersTab} bandId=${bandId} currentUserId=${currentUser?.id} isAdmin=${isAdmin} />`}
        ${tab === 'advanced' && html`<${AdvancedTab} bandId=${bandId} band=${band} isAdmin=${isAdmin} navigate=${navigate} />`}
      </section>
    </main>
  `;
}

function GeneralTab({ bandId, band, isAdmin }) {
  const [name, setName] = useState(band?.name ?? '');
  const [description, setDescription] = useState(band?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(band?.name ?? '');
    setDescription(band?.description ?? '');
  }, [band?.id]);

  async function onSave(event) {
    event.preventDefault();
    if (saving || !isAdmin) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage('Nombre requerido.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      const { error } = await supabase
        .from('bands')
        .update({ name: trimmedName, description: description.trim() || null })
        .eq('id', bandId);
      if (error) throw error;
      setMessage('Guardado.');
      try {
        await refreshBands(supabase);
      } catch (err) {
        console.error('refreshBands failed after band update', err);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return html`
    <form onSubmit=${onSave}>
      <label>
        Nombre
        <input
          name="band-name"
          value=${name}
          onInput=${(event) => setName(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      <label>
        Descripcion
        <input
          name="band-description"
          value=${description}
          onInput=${(event) => setDescription(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      ${isAdmin && html`
        <button type="submit" disabled=${saving}>${saving ? 'Guardando...' : 'Guardar'}</button>
      `}
      ${message && html`<p aria-live="polite">${message}</p>`}
    </form>
  `;
}

function MembersTab({ bandId, currentUserId, isAdmin }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [generatedLink, setGeneratedLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load({ canCommit = () => true, reportError = true } = {}) {
    if (canCommit()) setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      const [memberRows, inviteRows] = await Promise.all([
        listBandMembers(supabase, { bandId }),
        isAdmin ? listInvitations(supabase, { bandId }) : Promise.resolve([])
      ]);
      if (!canCommit()) return;
      setMembers(memberRows);
      setInvites(inviteRows);
      setError('');
    } catch (err) {
      if (canCommit() && reportError) setError(err.message);
    } finally {
      if (canCommit()) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    load({ canCommit: () => active });
    return () => {
      active = false;
    };
  }, [bandId, isAdmin]);

  async function onGenerate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setGeneratedLink('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      const token = await createInvitation(supabase, { bandId, email: inviteEmail, role: inviteRole });
      setGeneratedLink(`${window.location.origin}/invite/${token}`);
      setInviteEmail('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(member, role) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      await updateBandMemberRole(supabase, { bandId, userId: member.userId, role });
      setMembers((items) => items.map((item) => (
        item.userId === member.userId ? { ...item, role } : item
      )));
      try {
        await load({ reportError: false });
      } catch (err) {
        console.error('members reload failed after role update', err);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(member) {
    if (busy) return;
    if (!confirm(`Quitar a ${member.email}?`)) return;
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      await removeBandMember(supabase, { bandId, userId: member.userId });
      setMembers((items) => items.filter((item) => item.userId !== member.userId));
      try {
        await load({ reportError: false });
      } catch (err) {
        console.error('members reload failed after member removal', err);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return html`<p aria-live="polite">Cargando...</p>`;

  return html`
    <div>
      <h2>Miembros</h2>
      <ul class="members-list">
        ${members.map((member) => html`
          <li key=${member.userId}>
            <span>${member.email ?? member.userId}</span>
            ${isAdmin && member.userId !== currentUserId ? html`
              <select
                value=${member.role}
                aria-label=${`Rol de ${member.email ?? member.userId}`}
                onChange=${(event) => onRoleChange(member, event.currentTarget.value)}
                disabled=${busy}
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
              <button type="button" onClick=${() => onRemove(member)} disabled=${busy}>Quitar</button>
            ` : html`<span>(${member.role})</span>`}
          </li>
        `)}
      </ul>

      ${isAdmin && html`
        <section>
          <h3>Invitaciones</h3>
          <form onSubmit=${onGenerate}>
            <label>
              Email
              <input
                type="email"
                name="invite-email"
                autocomplete="email"
                required
                value=${inviteEmail}
                onInput=${(event) => setInviteEmail(event.currentTarget.value)}
              />
            </label>
            <label>
              Rol
              <select
                name="invite-role"
                value=${inviteRole}
                onChange=${(event) => setInviteRole(event.currentTarget.value)}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button type="submit" disabled=${busy}>Generar invitacion</button>
          </form>
          ${generatedLink && html`
            <label>
              Link generado
              <input
                readonly
                aria-label="Link de invitacion generado"
                value=${generatedLink}
                onClick=${(event) => event.currentTarget.select()}
              />
            </label>
          `}
          <ul>
            ${invites.map((invite) => html`
              <li key=${invite.id}>${invite.email} (${invite.role}) - expira ${invite.expiresAt}</li>
            `)}
          </ul>
        </section>
      `}

      ${error && html`<p class="auth-error" role="alert">${error}</p>`}
    </div>
  `;
}

function AdvancedTab({ bandId, band, isAdmin, navigate }) {
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onLeave() {
    if (busy || !confirm('Salir de esta banda?')) return;
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      await leaveBand(supabase, { bandId });
      removeLocalBand(bandId);
      try {
        await refreshBands(supabase);
      } catch (err) {
        console.error('refreshBands failed after leaveBand', err);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onDelete(event) {
    event.preventDefault();
    if (busy) return;
    if (confirmName.trim() !== band?.name) {
      setError('El nombre no coincide.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      await deleteBand(supabase, { bandId, confirmationName: confirmName.trim() });
      removeLocalBand(bandId);
      try {
        await refreshBands(supabase);
      } catch (err) {
        console.error('refreshBands failed after deleteBand', err);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return html`
    <div>
      <section>
        <h2>Abandonar banda</h2>
        <button type="button" onClick=${onLeave} disabled=${busy}>Abandonar</button>
      </section>
      ${isAdmin && html`
        <section>
          <h2>Borrar banda</h2>
          <p>Escribi <strong>${band?.name}</strong> para confirmar.</p>
          <form onSubmit=${onDelete}>
            <label>
              Confirmacion
              <input
                name="delete-confirmation"
                value=${confirmName}
                onInput=${(event) => setConfirmName(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled=${busy}>Borrar</button>
          </form>
        </section>
      `}
      ${error && html`<p class="auth-error" role="alert">${error}</p>`}
    </div>
  `;
}
