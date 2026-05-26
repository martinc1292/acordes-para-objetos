import { atom } from 'nanostores';

export const $currentUser = atom(null);

export function setCurrentUser(user) {
  $currentUser.set(user ?? null);
}

export function clearCurrentUser() {
  $currentUser.set(null);
}
