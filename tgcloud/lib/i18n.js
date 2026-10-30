const en = {
  welcome:
    '🕊️ <b>AnonymOSS</b> — a private inbox, one link away.\n' +
    '➕ /newlink   🔗 /links   ℹ️ /about\n' +
    '{verify} · <a href="{repo}">source</a>',
  linkIntro:
    '🔗 <b>Your link is ready</b> — memo: <b>{memo}</b>\n' +
    '<code>{link}</code>\n' +
    'Share it. Anyone with it can write to you without seeing your identity.',
  linkInactive: '⚠️ This link is no longer active.',
  linkNotFound: '⚠️ Link not found.',
  ownLink: '🙃 This is your own link. Share it instead.',
  startFromLink: '🔗 Open a link first, then send your message.',
  prompt: '✍️ Send your message. The bot will wait for it as long as needed.',
  senderTopicHint: '📥 Your messages for this link are in the "⬆️ {token}" topic. Open it and write there.',
  chooseMode: '📨 How should this reach the owner?',
  modeAnon: '😶‍🌫️ Anonymous',
  modeHistory: '😶‍🌫️💬 With history',
  modeForward: '😎 Forward',
  sentAnon: '😶‍🌫️ Sent anonymously.',
  sentHistory: '😶‍🌫️💬 Sent with history as {indicator}.',
  sentForward: '😎 Forwarded.',
  capReached: '⚠️ Link limit reached ({cap}). Revoke one with /links.',
  about:
    '🛠 <b>AnonymOSS</b>\n' +
    '<a href="{contact}">Developer</a> · <a href="{repo}">Source</a>\n' +
    '{verify}\n' +
    'No message content is stored.',
  linksTitle: '🔗 <b>Your links</b>\nPick one to manage.',
  noLinks: '🪶 No links yet. /newlink creates your first one.',
  linkMenuTitle: '🔗 <b>{memo}</b>\n<code>{token}</code>',
  homeTitle: '🏠 <b>AnonymOSS</b>\nChoose an option.',
  homeLinks: '🔗 My links',
  homeAbout: 'ℹ️ About',
  back: '⬅️ Back',
  open: '🔗 Open',
  share: '📤 Share',
  revoke: '🗑 Revoke',
  changeMemo: '✏️ Memo',
  confirm: '✅ Confirm',
  revokeConfirm: '⚠️ Revoke <b>{memo}</b>? Stored data is deleted; Telegram history stays.',
  revoked: '🗑 <s>{link}</s>\nLink revoked.\nAll stored data deleted.',
  revokedShort: 'Revoked.',
  memoPrompt: '✏️ Send the new memo (max {max} characters).',
  memoChanged: '✏️ Memo updated.',
  answerWindow: '✍️ Reply within {seconds}s. Send your message now.',
  answerSent: '✅ Reply sent.',
  answerExpired: '⌛ The reply window closed. Press Answer again.',
  answerOnly: 'ℹ️ Press Answer on a message to reply.',
  modeCleared: '🔁 Mode cleared. Send your next message to choose again.',
  cancelled: 'Cancelled.',
  btnAnswer: '👋 Answer',
  btnRead: '👀 Read',
  btnBlockLink: '🚫 Block here',
  btnBlockAll: '🌐 Block everywhere',
  btnUnblockLink: '🕊️ Unblock here',
  btnUnblockAll: '🕊️ Unblock everywhere',
  blockedLink: '🚫 Blocked on this link.',
  blockedAll: '🚫 Blocked on all your links.',
  unblockedLink: '🕊️ Unblocked on this link.',
  unblockedAll: '🕊️ Unblocked on all links.',
  readFailed: '⚠️ Sender deleted the message; the read receipt could not be delivered.',
  blockedLink: '🚫 Blocked on this link.',
  blockedAll: '🚫 Blocked on all your links.',
  unblockedLink: '🕊️ Unblocked on this link.',
  unblockedAll: '🕊️ Unblocked on all links.',
  blockedNotice: '🚫 You are blocked by the owner.',
  throttle: '⏳ Too fast — wait a moment.',
  albumPartial: '⚠️ Part of the album was deleted; the rest was delivered.',
  deleteNotice: '🗑 Stored data deleted. Only this chat history remains.',
  topicsDisabled: 'ℹ️ Enable Topics for this bot in @BotFather to get separate threads.',
  failed: '⚠️ Delivery failed. Try again.',
};

const fa = {
  welcome:
    '🕊️ <b>AnonymOSS</b> — صندوق خصوصی، فقط با یک لینک.\n' +
    '➕ /newlink   🔗 /links   ℹ️ /about\n' +
    '{verify} · <a href="{repo}">منبع</a>',
  linkIntro:
    '🔗 <b>لینک شما آماده است</b> — یادداشت: <b>{memo}</b>\n' +
    '<code>{link}</code>\n' +
    'آن را به اشتراک بگذارید؛ هر کسی با آن می‌تواند بدون دیدن هویت شما پیام بدهد.',
  linkInactive: '⚠️ این لینک دیگر فعال نیست.',
  linkNotFound: '⚠️ لینک پیدا نشد.',
  ownLink: '🙃 این لینک خودتان است. آن را به اشتراک بگذارید.',
  startFromLink: '🔗 اول یک لینک باز کنید، بعد پیام بفرستید.',
  prompt: '✍️ پیامتان را بفرستید. ربات هرقدر لازم باشد منتظر می‌ماند.',
  senderTopicHint: '📥 پیام‌های این لینک در موضوع «⬆️ {token}» هستند. آن را باز کنید و همان‌جا بنویسید.',
  chooseMode: '📨 این پیام چطور به صاحب لینک برسد؟',
  modeAnon: '😶‍🌫️ ناشناس',
  modeHistory: '😶‍🌫️💬 با سابقه',
  modeForward: '😎 هدایت',
  sentAnon: '😶‍🌫️ ناشناس ارسال شد.',
  sentHistory: '😶‍🌫️💬 با سابقه به‌عنوان {indicator} ارسال شد.',
  sentForward: '😎 هدایت شد.',
  capReached: '⚠️ سقف لینک ({cap}) پر است. با /links یکی را حذف کنید.',
  about:
    '🛠 <b>AnonymOSS</b>\n' +
    '<a href="{contact}">توسعه‌دهنده</a> · <a href="{repo}">منبع</a>\n' +
    '{verify}\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.',
  linksTitle: '🔗 <b>لینک‌های شما</b>\nیکی را برای مدیریت انتخاب کنید.',
  noLinks: '🪶 هنوز لینکی ندارید. با /newlink اولین لینک را بسازید.',
  linkMenuTitle: '🔗 <b>{memo}</b>\n<code>{token}</code>',
  homeTitle: '🏠 <b>AnonymOSS</b>\nیک گزینه را انتخاب کنید.',
  homeLinks: '🔗 لینک‌های من',
  homeAbout: 'ℹ️ درباره',
  back: '⬅️ بازگشت',
  open: '🔗 باز کردن',
  share: '📤 اشتراک',
  revoke: '🗑 حذف',
  changeMemo: '✏️ یادداشت',
  confirm: '✅ تأیید',
  revokeConfirm: '⚠️ لینک <b>{memo}</b> حذف شود؟ داده‌های ذخیره‌شده پاک می‌شوند؛ تاریخچه تلگرام می‌ماند.',
  revoked: '🗑 <s>{link}</s>\nلینک حذف شد.\nهمه داده‌های ذخیره‌شده پاک شد.',
  revokedShort: 'حذف شد.',
  memoPrompt: '✏️ یادداشت جدید را بفرستید (حداکثر {max} نویسه).',
  memoChanged: '✏️ یادداشت به‌روز شد.',
  answerWindow: '✍️ تا {seconds} ثانیه پاسخ دهید. پیامتان را بفرستید.',
  answerSent: '✅ پاسخ ارسال شد.',
  answerExpired: '⌛ پنجره پاسخ بسته شد. دوباره Answer را بزنید.',
  answerOnly: 'ℹ️ برای پاسخ، روی پیام Answer را بزنید.',
  modeCleared: '🔁 حالت پاک شد. پیام بعدی را بفرستید تا دوباره انتخاب کنید.',
  cancelled: 'لغو شد.',
  btnAnswer: '👋 پاسخ',
  btnRead: '👀 خواندن',
  btnBlockLink: '🚫 مسدود در این لینک',
  btnBlockAll: '🌐 مسدود در همه لینک‌ها',
  btnUnblockLink: '🕊️ رفع در این لینک',
  btnUnblockAll: '🕊️ رفع در همه لینک‌ها',
  readFailed: '⚠️ فرستنده پیام را حذف کرده؛ رسید خواندن قابل ارسال نیست.',
  blockedLink: '🚫 در این لینک مسدود شد.',
  blockedAll: '🚫 در همه لینک‌ها مسدود شد.',
  unblockedLink: '🕊️ در این لینک رفع مسدودی شد.',
  unblockedAll: '🕊️ در همه لینک‌ها رفع مسدودی شد.',
  blockedNotice: '🚫 شما توسط صاحب لینک مسدود شده‌اید.',
  throttle: '⏳ خیلی سریع — کمی صبر کنید.',
  albumPartial: '⚠️ بخشی از آلبوم حذف شده بود؛ بقیه ارسال شد.',
  deleteNotice: '🗑 داده‌های ذخیره‌شده پاک شد. فقط تاریخچه همین گفتگو می‌ماند.',
  topicsDisabled: 'ℹ️ برای دریافت موضوع‌های جداگانه، Topics را در @BotFather فعال کنید.',
  failed: '⚠️ ارسال نشد. دوباره تلاش کنید.',
};

const STRINGS = { en, fa };

export function normalizeLang(code) {
  return String(code ?? '').toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] ?? STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
