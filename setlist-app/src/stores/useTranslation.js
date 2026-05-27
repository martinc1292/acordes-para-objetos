import { useEffect, useState } from 'preact/hooks';
import i18n from '@/lib/i18n.js';

export function useTranslation(ns = 'common') {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((n) => n + 1);
    i18n.on('languageChanged', h);
    return () => i18n.off('languageChanged', h);
  }, []);
  return i18n.getFixedT(null, ns);
}
