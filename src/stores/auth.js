import { atom } from 'nanostores';
import { listMyBands } from '../db/bands.js';

export const $currentUser = atom(null);
export const $bands = atom([]);
export const $activeBandId = atom(null);
export const $authReady = atom(false);

let authSubscription = null;
let bandLoadVersion = 0;

function nextBandLoadVersion() {
  bandLoadVersion += 1;
  return bandLoadVersion;
}

function unsubscribeAuthListener() {
  authSubscription?.unsubscribe?.();
  authSubscription = null;
}

export function setCurrentUser(user) {
  $currentUser.set(user ?? null);
}

export function clearCurrentUser() {
  nextBandLoadVersion();
  $currentUser.set(null);
  $bands.set([]);
  $activeBandId.set(null);
}

function setSessionUser(user) {
  const previous = $currentUser.get();
  if (previous?.id !== user.id) {
    $bands.set([]);
    $activeBandId.set(null);
  }
  $currentUser.set(user);
}

async function loadBandsFor(client, userId, version = nextBandLoadVersion()) {
  if (!client || !userId) {
    $bands.set([]);
    $activeBandId.set(null);
    return;
  }
  const bands = await listMyBands(client, { userId });
  if (version !== bandLoadVersion || $currentUser.get()?.id !== userId) return;
  $bands.set(bands);
  if (bands.length > 0) {
    const current = $activeBandId.get();
    const stillThere = bands.find((b) => b.id === current);
    $activeBandId.set(stillThere ? current : bands[0].id);
  } else {
    $activeBandId.set(null);
  }
}

export async function initAuthStore(client) {
  unsubscribeAuthListener();
  if (!client) {
    clearCurrentUser();
    $authReady.set(true);
    return;
  }
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data?.session ?? null;
    if (session?.user) {
      setSessionUser(session.user);
      await loadBandsFor(client, session.user.id);
    } else {
      clearCurrentUser();
    }
    const result = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT' || !nextSession?.user) {
        clearCurrentUser();
        return;
      }
      const user = nextSession.user;
      setSessionUser(user);
      const version = nextBandLoadVersion();
      setTimeout(() => {
        loadBandsFor(client, user.id, version).catch((err) => {
          console.error('refresh auth bands failed', err);
        });
      }, 0);
    });
    authSubscription = result?.data?.subscription ?? null;
  } finally {
    $authReady.set(true);
  }
}

export async function signOut(client) {
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  clearCurrentUser();
}

export function setActiveBand(bandId) {
  $activeBandId.set(bandId ?? null);
}

export function addLocalBand(band) {
  if (!band?.id) return;
  const bands = $bands.get();
  if (bands.some((item) => item.id === band.id)) {
    $activeBandId.set(band.id);
    return;
  }
  $bands.set([...bands, band]);
  $activeBandId.set(band.id);
}

export function removeLocalBand(bandId) {
  if (!bandId) return;
  nextBandLoadVersion();
  const bands = $bands.get().filter((band) => band.id !== bandId);
  $bands.set(bands);
  if ($activeBandId.get() === bandId) {
    $activeBandId.set(bands[0]?.id ?? null);
  }
}

export async function refreshBands(client) {
  const user = $currentUser.get();
  if (!user || !client) return;
  await loadBandsFor(client, user.id);
}
