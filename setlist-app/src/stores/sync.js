import { atom } from 'nanostores';

export const $syncStatus = atom('idle');
export const $pendingSyncCount = atom(0);
