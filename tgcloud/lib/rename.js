import * as store from './store.js';

export const RENAME_WINDOW_SECONDS = 86_400;

// One meta row per rename target, no schema change. Owner topics, sender topics,
// and memos use different scopes, so one side's rename never consumes the
// other side's budget. In-memory state would reset with every serverless
// isolate and could not enforce a 24-hour window.
export async function renameWait(scope, id, now) {
  const last = Number(await store.getMeta(`rename:${scope}:${id}`) ?? 0);
  return last > 0 && last + RENAME_WINDOW_SECONDS > now
    ? last + RENAME_WINDOW_SECONDS - now
    : 0;
}

export async function markRenamed(scope, id, now) {
  await store.setMeta(`rename:${scope}:${id}`, String(now));
}

export function formatWait(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
