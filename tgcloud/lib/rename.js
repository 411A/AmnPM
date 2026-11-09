import * as store from './store.js';

export const RENAME_WINDOW_SECONDS = 86_400;

// One meta row per link and kind, no schema change. In-memory state would reset
// with every serverless isolate and could not enforce a 24-hour window. The
// topic and memo counters are separate: each link gets one of each per window.
export async function renameWait(linkId, kind, now) {
  const last = Number(await store.getMeta(`rename:${kind}:${linkId}`) ?? 0);
  return last > 0 && last + RENAME_WINDOW_SECONDS > now
    ? last + RENAME_WINDOW_SECONDS - now
    : 0;
}

export async function markRenamed(linkId, kind, now) {
  await store.setMeta(`rename:${kind}:${linkId}`, String(now));
}

export function formatWait(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
