// Tunables and deployment values. The KEK lives in the gitignored secret.js.
export const CONFIG = {
  maxLinksPerOwner: 10,
  throttlePerMinute: 30,
  // Delivery is counted when a stockpiled mode choice is cashed in, not only
  // at intake. The owner cap is the backstop against many senders at once.
  deliverPerMinute: 30,
  ownerPerMinute: 120,
  maxAttempts: 5,
  maxMemoLength: 32,
  actionTtlSeconds: 2_592_000,
  modeTtlSeconds: 86_400,
  // Owner albums arrive as separate updates sharing one media_group_id. The
  // first update holds this long so the rest land in one copyMessages batch.
  // Followers wait this plus albumTakeoverMs, then take over if the leader died.
  albumHoldMs: 1500,
  albumTakeoverMs: 1000,
  tokenLength: 10,
  tokenAlphabet: '23456789abcdefghjkmnopqrstuvwxyz',
  // 0 = fast HMAC lookup. Set >0 for a PBKDF2 cost barrier; changing it invalidates stored keys.
  kdfIterations: 0,
  defaultMemo: 'main',
  repoUrl: 'https://github.com/411A/AmnPM',
  contactUrl: 'https://t.me/AmnPMBot',
};
