const CHORD_BODY = '([A-G][#b]?)((?:maj|min|m|sus|dim|aug|add|M)?\\d*(?:[b#]\\d+)?)(\\/[A-G][#b]?)?';

export const CHORD_REGEX = new RegExp(
  `(?<![A-Za-z0-9])${CHORD_BODY}(?![A-Za-z0-9])`,
  'g'
);

export const SINGLE_CHORD_REGEX = new RegExp(`^${CHORD_BODY}$`);

export function tokenizeChords(text) {
  if (typeof text !== 'string' || !text) return [];

  const tokens = [];
  let cursor = 0;
  const scanner = new RegExp(CHORD_REGEX.source, 'g');

  for (const match of text.matchAll(scanner)) {
    if (match.index > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    tokens.push({ type: 'chord', value: match[0] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens;
}
