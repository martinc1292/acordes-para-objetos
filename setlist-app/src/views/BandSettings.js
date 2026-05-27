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
import { useTranslation } from '@/stores/useTranslation.js';
import { LanguageToggle } from '@/views/LanguageToggle.js';

const TABS = ['general', 'members', 'advanced'];

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function BandSettings({ bandId, navigate }) {
  const t = useTranslation('bands');
  const [tab, setTab] = useState('general');
  const tabRefs = useRef({});
  const currentUser = useStoreValue($currentUser);
  const bands = useStoreValue($bands);
  const band = bands.find((item) => item.id === bandId);
  const isAdmin = band?.role === 'admin';

  function onTabKeyDown(event) {
    const index = TABS.findIndex((id) => id === tab);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[nextIndex]);
    setTimeout(() => {
      tabRefs.current[TABS[nextIndex]]?.focus();
    }, 0);
  }

  return html`
    <main class="settings-shell">
      <header class="settings-header">
        <h1>${band?.name ?? t('settings.band_fallback')}</h1>
        <a
          href=${`/band/${bandId}`}
          onClick=${(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            navigate(`/band/${bandId}`);
          }}
        >${t('common:action.back')}</a>
      </header>
      <nav class="settings-tabs" role="tablist">
        ${TABS.map((id) => html`
          <button
            type="button"
            role="tab"
            id=${`settings-tab-${id}`}
            ref=${(node) => {
              if (node) tabRefs.current[id] = node;
            }}
            aria-controls=${`settings-panel-${id}`}
            aria-selected=${tab === id}
            tabIndex=${tab === id ? 0 : -1}
            onClick=${() => setTab(id)}
            onKeyDown=${onTabKeyDown}
            class=${tab === id ? 'tab tab-active' : 'tab'}
          >${t(`settings.tab.${id}`)}</button>
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
  const t = useTranslation('bands');
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
      setMessage(t('settings.name_required'));
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
      setMessage(t('settings.saved'));
      try {
        await refreshBands(supabase);
      } catch (err) {
        console.error('refreshBands failed after band update', err);
      }
    } catch (err) {
      console.error('band update failed', err);
      setMessage(t('common:error.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return html`
    <form onSubmit=${onSave}>
      <label>
        ${t('settings.field.name')}
        <input
          name="band-name"
          value=${name}
          onInput=${(event) => setName(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      <label>
        ${t('settings.field.description')}
        <input
          name="band-description"
          value=${description}
          onInput=${(event) => setDescription(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      ${isAdmin && html`
        <button type="submit" disabled=${saving}>${saving ? t('common:saving') : t('common:action.save')}</button>
      `}
      ${message && html`<p aria-live="polite">${message}</p>`}
    </form>
    <div style="margin-top:24px">
      <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:8px">
        ES / EN
      </div>
      <${LanguageToggle} />
    </div>
  `;
}

function MembersTab({ bandId, currentUserId, isAdmin }) {
  const t = useTranslation('bands');
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
      console.error('members load failed', err);
      if (canCommit() && reportError) setError(t('common:error.load_failed'));
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
      console.error('createInvitation failed', err);
      setError(t('common:error.save_failed'));
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
      console.error('updateBandMemberRole failed', err);
      setError(t('common:error.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(member) {
    if (busy) return;
    if (!confirm(t('settings.member.remove_confirm', { name: member.email ?? member.userId }))) return;
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
      console.error('removeBandMember failed', err);
      setError(t('common:error.delete_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return html`<p aria-live="polite">${t('settings.member.loading')}</p>`;

  return html`
    <div>
      <h2>${t('settings.member.title')}</h2>
      <ul class="members-list">
        ${members.map((member) => html`
          <li key=${member.userId}>
            <span>${member.email ?? member.userId}</span>
            ${isAdmin && member.userId !== currentUserId ? html`
              <select
                value=${member.role}
                aria-label=${t('settings.member.role_aria', { name: member.email ?? member.userId })}
                onChange=${(event) => onRoleChange(member, event.currentTarget.value)}
                disabled=${busy}
              >
                <option value="admin">${t('role.admin')}</option>
                <option value="member">${t('role.member')}</option>
              </select>
              <button type="button" onClick=${() => onRemove(member)} disabled=${busy}>${t('settings.member.remove')}</button>
            ` : html`<span>(${t(`role.${member.role}`)})</span>`}
          </li>
        `)}
      </ul>

      ${isAdmin && html`
        <section>
          <h3>${t('settings.invitation.title')}</h3>
          <form onSubmit=${onGenerate}>
            <label>
              ${t('settings.member.email_label')}
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
              ${t('settings.invitation.role_label')}
              <select
                name="invite-role"
                value=${inviteRole}
                onChange=${(event) => setInviteRole(event.currentTarget.value)}
              >
                <option value="member">${t('role.member')}</option>
                <option value="admin">${t('role.admin')}</option>
              </select>
            </label>
            <button type="submit" disabled=${busy}>${t('settings.invitation.generate')}</button>
          </form>
          ${generatedLink && html`
            <label>
              ${t('settings.invitation.generated_link')}
              <input
                readonly
                aria-label=${t('settings.invitation.generated_link_aria')}
                value=${generatedLink}
                onClick=${(event) => event.currentTarget.select()}
              />
            </label>
          `}
          <ul>
            ${invites.map((invite) => html`
              <li key=${invite.id}>${invite.email} (${invite.role}) - ${t('settings.invitation.expires')} ${invite.expiresAt}</li>
            `)}
          </ul>
        </section>
      `}

      ${error && html`<p class="auth-error" role="alert">${error}</p>`}
    </div>
  `;
}

function AdvancedTab({ bandId, band, isAdmin, navigate }) {
  const t = useTranslation('bands');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onLeave() {
    if (busy || !confirm(t('settings.leave_confirm'))) return;
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
      console.error('leaveBand failed', err);
      setError(t('common:error.save_failed'));
      setBusy(false);
    }
  }

  async function onDelete(event) {
    event.preventDefault();
    if (busy) return;
    if (confirmName.trim() !== band?.name) {
      setError(t('settings.name_mismatch'));
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
      console.error('deleteBand failed', err);
      setError(t('common:error.delete_failed'));
      setBusy(false);
    }
  }

  return html`
    <div>
      <section>
        <h2>${t('settings.leave_section')}</h2>
        <button type="button" onClick=${onLeave} disabled=${busy}>${t('settings.leave_action')}</button>
      </section>
      ${isAdmin && html`
        <section>
          <h2>${t('settings.delete_section')}</h2>
          <p>${t('settings.delete_confirm_prompt', { name: band?.name })}</p>
          <form onSubmit=${onDelete}>
            <label>
              ${t('settings.delete_confirm_label')}
              <input
                name="delete-confirmation"
                value=${confirmName}
                onInput=${(event) => setConfirmName(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled=${busy}>${t('common:action.delete')}</button>
          </form>
        </section>
      `}
      ${error && html`<p class="auth-error" role="alert">${error}</p>`}
    </div>
  `;
}
