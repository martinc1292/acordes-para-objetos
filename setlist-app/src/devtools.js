import { $currentUser } from '@/stores/auth.js';
import { $locale, $presentationModeOpen, $theme } from '@/stores/ui.js';

export function exposeDevtools() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;

  window.setlistStores = {
    $currentUser,
    $locale,
    $presentationModeOpen,
    $theme
  };
}
