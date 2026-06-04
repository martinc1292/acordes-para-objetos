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
import { getMyProfile, updateMyProfile, uploadAvatar } from '@/db/profiles.js';
import { refreshBands, removeLocalBand, $currentUser, $bands } from '@/stores/auth.js';
import { useStoreValue } from '@/stores/useStoreValue.js';
import { useTranslation } from '@/stores/useTranslation.js';
import { LanguageToggle } from '@/views/LanguageToggle.js';
import { ThemeToggle } from '@/views/ThemeToggle.js';

const TABS = ['general', 'members', 'advanced', 'profile'];

function shouldHandleLinkClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function bandInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function memberName(member) {
  if (member.displayName) return member.displayName;
  if (member.email) return member.email;
  return `${String(member.userId).slice(0, 8)}…`;
}

function initialsFrom(name) {
  const s = String(name ?? '?').trim();
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

function Avatar({ name, url, size = 40 }) {
  const base = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;border:1px solid var(--line)`;
  if (url) {
    return html`<img src=${url} alt=${name} style="${base};object-fit:cover" />`;
  }
  return html`
    <div style="${base};background:var(--panel);color:var(--muted);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:${Math.round(size * 0.34)}px;font-weight:700">
      ${initialsFrom(name)}
    </div>
  `;
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

  const initials = bandInitials(band?.name);

  return html`
    <main style="padding:16px;max-width:680px;margin:0 auto">

      <header style="border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px">
        <a
          href=${`/band/${bandId}`}
          onClick=${(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            navigate(`/band/${bandId}`);
          }}
          style="display:inline-block;font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);text-decoration:none;margin-bottom:12px"
        >${t('common:action.back')}</a>
        <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.3em;text-transform:uppercase;color:var(--accent);margin-bottom:6px">
          ${t('settings.title')}
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--accent-contrast);font-family:var(--mono);font-size:0.85rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${initials}
          </div>
          <h1 style="margin:0;font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(1.5rem,4.5vw,2.2rem);letter-spacing:-0.025em;line-height:1">
            ${band?.name ?? t('settings.band_fallback')}
          </h1>
        </div>
      </header>

      <nav
        role="tablist"
        style="display:flex;gap:0;border-bottom:1px solid var(--line);margin-bottom:20px;overflow-x:auto"
      >
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
            style="font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;padding:10px 14px;border:none;background:none;border-bottom:2px solid ${tab === id ? 'var(--accent)' : 'transparent'};color:${tab === id ? 'var(--accent)' : 'var(--muted)'};cursor:pointer;white-space:nowrap;margin-bottom:-1px"
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
        ${tab === 'profile' && html`<${ProfileTab} currentUser=${currentUser} />`}
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

  const isSuccess = message === t('settings.saved');

  return html`
    <form onSubmit=${onSave} class="auth-form">
      <label class="auth-field">
        <span>${t('settings.field.name')}</span>
        <input
          class="auth-input"
          name="band-name"
          value=${name}
          onInput=${(event) => setName(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      <label class="auth-field">
        <span>${t('settings.field.description')}</span>
        <input
          class="auth-input"
          name="band-description"
          value=${description}
          onInput=${(event) => setDescription(event.currentTarget.value)}
          disabled=${!isAdmin}
        />
      </label>
      ${isAdmin && html`
        <button class="auth-submit" type="submit" disabled=${saving}>${saving ? t('common:saving') : t('common:action.save')}</button>
      `}
      ${message && html`
        <p
          aria-live="polite"
          class=${isSuccess ? 'auth-success' : 'auth-error'}
          style="margin:4px 0 0;font-family:var(--mono);font-size:0.8rem"
        >${message}</p>
      `}
    </form>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--line)">
      <div style="font-family:var(--mono);font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:10px">
        ${t('common:theme.label')}
      </div>
      <${ThemeToggle} />
      <div style="font-family:var(--mono);font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin:18px 0 10px">
        ES / EN
      </div>
      <${LanguageToggle} />
    </div>
  `;
}

function ProfileTab({ currentUser }) {
  const t = useTranslation('bands');
  const userId = currentUser?.id ?? null;
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); // object URL for the just-picked file
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!userId) return;
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase no esta configurado.');
        const profile = await getMyProfile(supabase, { userId });
        if (!active) return;
        setDisplayName(profile?.display_name ?? '');
        setAvatarUrl(profile?.avatar_url ?? null);
      } catch (err) {
        console.error('profile load failed', err);
        if (active) {
          setIsError(true);
          setMessage(t('common:error.load_failed'));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [userId]);

  function onPickFile(event) {
    const picked = event.currentTarget.files?.[0] ?? null;
    setMessage('');
    setIsError(false);
    if (!picked) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(picked.type)) {
      setIsError(true);
      setMessage(t('settings.profile.error_type'));
      return;
    }
    if (picked.size > 3 * 1024 * 1024) {
      setIsError(true);
      setMessage(t('settings.profile.error_size'));
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const preview = URL.createObjectURL(picked);
    objectUrlRef.current = preview;
    setPreviewUrl(preview);
    setFile(picked);
  }

  function onRemovePhoto() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFile(null);
    setAvatarUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onSave(event) {
    event.preventDefault();
    if (busy || !userId) return;
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase no esta configurado.');
      let nextUrl = avatarUrl;
      if (file) {
        nextUrl = await uploadAvatar(supabase, { userId, file });
      }
      await updateMyProfile(supabase, { userId, displayName, avatarUrl: nextUrl });
      setAvatarUrl(nextUrl ?? null);
      setFile(null);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreviewUrl(null);
      setMessage(t('settings.profile.saved'));
    } catch (err) {
      console.error('profile save failed', err);
      setIsError(true);
      if (err?.code === 'unsupported_type') setMessage(t('settings.profile.error_type'));
      else if (err?.code === 'too_large') setMessage(t('settings.profile.error_size'));
      else setMessage(t('common:error.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return html`<p aria-live="polite" style="font-family:var(--mono);font-size:0.85rem;color:var(--muted)">${t('settings.member.loading')}</p>`;
  }

  const shownAvatar = previewUrl ?? avatarUrl;
  const ghostBtnStyle = 'font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;background:none;border:1px solid var(--line);border-radius:6px;color:var(--muted);padding:8px 12px;cursor:pointer';

  return html`
    <form onSubmit=${onSave} class="auth-form">
      <h2 style="margin:0 0 12px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:1.3rem">${t('settings.profile.title')}</h2>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
        <${Avatar} name=${displayName || currentUser?.email} url=${shownAvatar} size=${64} />
        <div style="display:flex;flex-direction:column;gap:8px">
          <input
            ref=${fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange=${onPickFile}
            style="display:none"
          />
          <button type="button" onClick=${() => fileRef.current?.click()} style=${ghostBtnStyle}>
            ${t('settings.profile.change_photo')}
          </button>
          ${shownAvatar && html`
            <button type="button" onClick=${onRemovePhoto} style=${ghostBtnStyle}>
              ${t('settings.profile.remove_photo')}
            </button>
          `}
        </div>
      </div>
      <p style="margin:0 0 8px;font-family:var(--mono);font-size:0.7rem;color:var(--muted)">${t('settings.profile.hint')}</p>

      <label class="auth-field">
        <span>${t('settings.profile.name_label')}</span>
        <input
          class="auth-input"
          name="display-name"
          value=${displayName}
          maxlength="40"
          onInput=${(event) => setDisplayName(event.currentTarget.value)}
        />
      </label>

      <button class="auth-submit" type="submit" disabled=${busy}>
        ${busy ? t('settings.profile.uploading') : t('common:action.save')}
      </button>

      ${message && html`
        <p
          aria-live="polite"
          class=${isError ? 'auth-error' : 'auth-success'}
          style="margin:4px 0 0;font-family:var(--mono);font-size:0.8rem"
        >${message}</p>
      `}
    </form>
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
    if (!confirm(t('settings.member.remove_confirm', { name: memberName(member) }))) return;
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

  if (loading) {
    return html`<p aria-live="polite" style="font-family:var(--mono);font-size:0.85rem;color:var(--muted)">${t('settings.member.loading')}</p>`;
  }

  const selectStyle = 'font-family:var(--mono);font-size:0.75rem;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--text);padding:6px 8px';
  const ghostBtnStyle = 'font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;background:none;border:1px solid var(--line);border-radius:6px;color:var(--muted);padding:6px 10px;cursor:pointer';
  const youBadge = 'font-family:var(--mono);font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-left:8px';

  return html`
    <div>
      <h2 style="margin:0 0 12px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:1.3rem">${t('settings.member.title')}</h2>
      <ul style="list-style:none;margin:0;padding:0">
        ${members.map((member) => html`
          <li
            key=${member.userId}
            style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)"
          >
            <${Avatar} name=${memberName(member)} url=${member.avatarUrl} size=${40} />
            <div style="flex:1;min-width:0">
              <div style="font-family:var(--serif);font-size:1rem;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${memberName(member)}
                ${member.userId === currentUserId ? html`<span style=${youBadge}>${t('settings.member.you')}</span>` : ''}
              </div>
              ${member.displayName && member.email ? html`
                <div style="font-family:var(--mono);font-size:0.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${member.email}</div>
              ` : ''}
            </div>
            ${isAdmin && member.userId !== currentUserId ? html`
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <select
                  value=${member.role}
                  aria-label=${t('settings.member.role_aria', { name: memberName(member) })}
                  onChange=${(event) => onRoleChange(member, event.currentTarget.value)}
                  disabled=${busy}
                  style=${selectStyle}
                >
                  <option value="admin">${t('role.admin')}</option>
                  <option value="member">${t('role.member')}</option>
                </select>
                <button type="button" onClick=${() => onRemove(member)} disabled=${busy} style=${ghostBtnStyle}>${t('settings.member.remove')}</button>
              </div>
            ` : html`<span style="font-family:var(--mono);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:2px;flex-shrink:0">${t(`role.${member.role}`)}</span>`}
          </li>
        `)}
      </ul>

      ${isAdmin && html`
        <section style="margin-top:28px;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--panel)">
          <h3 style="margin:0 0 14px;font-family:var(--mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)">${t('settings.invitation.title')}</h3>
          <form onSubmit=${onGenerate} class="auth-form">
            <label class="auth-field">
              <span>${t('settings.member.email_label')}</span>
              <input
                class="auth-input"
                type="email"
                name="invite-email"
                autocomplete="email"
                required
                value=${inviteEmail}
                onInput=${(event) => setInviteEmail(event.currentTarget.value)}
              />
            </label>
            <label class="auth-field">
              <span>${t('settings.invitation.role_label')}</span>
              <select
                class="auth-input"
                name="invite-role"
                value=${inviteRole}
                onChange=${(event) => setInviteRole(event.currentTarget.value)}
              >
                <option value="member">${t('role.member')}</option>
                <option value="admin">${t('role.admin')}</option>
              </select>
            </label>
            <button class="auth-submit" type="submit" disabled=${busy}>${t('settings.invitation.generate')}</button>
          </form>
          ${generatedLink && html`
            <label class="auth-field" style="margin-top:14px">
              <span>${t('settings.invitation.generated_link')}</span>
              <input
                class="auth-input"
                readonly
                aria-label=${t('settings.invitation.generated_link_aria')}
                value=${generatedLink}
                onClick=${(event) => event.currentTarget.select()}
              />
            </label>
          `}
          ${invites.length > 0 && html`
            <ul style="list-style:none;margin:16px 0 0;padding:0">
              ${invites.map((invite) => html`
                <li key=${invite.id} style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);padding:6px 0;border-top:1px solid var(--line)">
                  ${invite.email} (${invite.role}) — ${t('settings.invitation.expires')} ${invite.expiresAt}
                </li>
              `)}
            </ul>
          `}
        </section>
      `}

      ${error && html`<p class="auth-error" role="alert" style="margin-top:14px;font-family:var(--mono);font-size:0.8rem">${error}</p>`}
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

  const dangerBtnStyle = 'font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;background:none;border:1px solid #7f1d1d;border-radius:6px;color:#f87171;padding:10px 16px;cursor:pointer';

  return html`
    <div style="display:grid;gap:24px">
      <section>
        <h2 style="margin:0 0 6px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:1.3rem">${t('settings.leave_section')}</h2>
        <button type="button" onClick=${onLeave} disabled=${busy} style=${dangerBtnStyle}>${t('settings.leave_action')}</button>
      </section>
      ${isAdmin && html`
        <section style="padding:18px;border:1px solid #7f1d1d;border-radius:8px;background:#7f1d1d10">
          <h2 style="margin:0 0 8px;font-family:var(--serif);font-style:italic;font-weight:400;font-size:1.3rem;color:#f87171">${t('settings.delete_section')}</h2>
          <p style="margin:0 0 14px;font-family:var(--mono);font-size:0.8rem;color:var(--muted)">${t('settings.delete_confirm_prompt', { name: band?.name })}</p>
          <form onSubmit=${onDelete} class="auth-form">
            <label class="auth-field">
              <span>${t('settings.delete_confirm_label')}</span>
              <input
                class="auth-input"
                name="delete-confirmation"
                value=${confirmName}
                onInput=${(event) => setConfirmName(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled=${busy} style=${dangerBtnStyle}>${t('common:action.delete')}</button>
          </form>
        </section>
      `}
      ${error && html`<p class="auth-error" role="alert" style="font-family:var(--mono);font-size:0.8rem">${error}</p>`}
    </div>
  `;
}