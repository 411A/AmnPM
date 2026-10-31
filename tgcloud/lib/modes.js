export const MODES = ['anon', 'history', 'forward'];

export function parseModes(value) {
  const set = new Set(String(value ?? '').split(','));
  const enabled = MODES.filter((mode) => set.has(mode));
  return enabled.length ? enabled : [...MODES];
}
