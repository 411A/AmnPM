import * as store from './store.js';
import { userKeyFor } from './links.js';

export const RENAME_WINDOW_SECONDS = 86_400;

// One meta row per actor and kind, no schema change. In-memory state would reset
// with every serverless isolate and could not enforce a 24-hour window.
export async function renameWait(actorId, kind, now, salt = null) {
  const key = `rename:${kind}:${await userKeyFor(actorId, salt)}`;
  const last = Number(await store.getMeta(key) ?? 0);
  return last > 0 && last + RENAME_WINDOW_SECONDS > now
    ? last + RENAME_WINDOW_SECONDS - now
    : 0;
}

export async function markRenamed(actorId, kind, now, salt = null) {
  await store.setMeta(`rename:${kind}:${await userKeyFor(actorId, salt)}`, String(now));
}

export function formatWait(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
