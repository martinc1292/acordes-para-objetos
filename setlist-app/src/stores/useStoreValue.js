import { useEffect, useState } from 'preact/hooks';

export function useStoreValue(store) {
  const [value, setValue] = useState(() => store.get());

  useEffect(() => store.subscribe(setValue), [store]);

  return value;
}
