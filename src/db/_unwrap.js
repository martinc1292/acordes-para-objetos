// Unwraps a Supabase `{ data, error }` result, throwing a real Error on failure.
// Supabase errors are plain objects, so we wrap them in an Error and copy only
// the known diagnostic fields (avoids clobbering message/stack via Object.assign).
const ERROR_FIELDS = ['code', 'details', 'hint', 'status'];

export function unwrap({ data, error }) {
  if (error) {
    const wrapped = error instanceof Error ? error : new Error(error.message || String(error));
    for (const field of ERROR_FIELDS) {
      if (error[field] !== undefined) wrapped[field] = error[field];
    }
    throw wrapped;
  }
  return data;
}
