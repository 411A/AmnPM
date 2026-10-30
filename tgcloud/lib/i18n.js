import { EMOJI } from './constants.js';

const en = {
  welcome:
    '{e.brand} <b>AmnPM</b> — a private inbox, one link away.\n' +
    '{e.plus} /newlink   {e.link} /links   {e.tool} /help   {e.info} /about\n' +
    '{verify} · <a href="{repo}">source</a>',
  help:
    '{e.tool} <b>Help</b>\n' +
    '/newlink [memo] · /links · /about\n' +
    '/rename &lt;name&gt; inside a topic — the direction/mode emoji stays at the front.\n' +
    'Telegram UI renames are invisible to the bot; only /rename keeps the mandatory emoji.',
  linkIntro:
    '{e.link} <b>Your link is ready</b> — memo: <b>{memo}</b>\n' +
    '<code>{link}</code>\n' +
    'Share it. Anyone with it can write to you without seeing your identity.\n' +
    'Rename a topic with /rename &lt;name&gt; inside it.',
  linkInactive: '{e.warn} This link is no longer active.',
  linkNotFound: '{e.warn} Link not found.',
  ownLink: '{e.upside} This is your own link. Share it instead.',
  startFromLink: '{e.link} Open a link first, then send your message.',
  prompt:
    '{e.write} Send your message. The bot will wait for it as long as needed.\n' +
    'Rename this topic with /rename &lt;name&gt;.',
  senderTopicHint: '{e.inbox} Your messages for this link are in the "{e.up} {token}" topic. Open it and write there.',
  senderTopicMissing:
    'Open your link again to create your topic, then write there.\n' +
    'Messages in All are not delivered.',
  topicPreparing: '{e.hourglass} Your topic is being prepared — tap the link again in a moment.',
  topicFailed: '{e.warn} Could not create your topic. Open the link again to retry.',
  chooseMode: '{e.send} How should this reach the owner?',
  modeAnon: '{e.anon} Anonymous',
  modeHistory: '{e.history} With history',
  modeForward: '{e.forward} Forward',
  sentAnon: '{e.anon} Sent anonymously.',
  sentHistory: '{e.history} Sent with history as {indicator}.',
  sentForward: '{e.forward} Forwarded.',
  capReached: '{e.warn} Link limit reached ({cap}). Revoke one with /links.',
  about:
    '{e.tool} <b>AmnPM</b>\n' +
    '<a href="{contact}">Bot</a> · <a href="{repo}">Source</a>\n' +
    '{verify}\n' +
    'No message content is stored.',
  linksTitle: '{e.link} <b>Your links</b>\nPick one to manage.',
  noLinks: '{e.feather} No links yet. /newlink creates your first one.',
  linkMenuTitle: '{e.link} <b>{memo}</b>\n<code>{token}</code>',
  homeTitle: '{e.home} <b>AmnPM</b>\nChoose an option.',
  homeLinks: '{e.link} My links',
  homeHelp: '{e.tool} Help',
  homeAbout: '{e.info} About',
  back: '{e.back} Back',
  open: '{e.link} Open',
  share: '{e.share} Share',
  revoke: '{e.trash} Revoke',
  changeMemo: '{e.memo} Memo',
  confirm: '{e.check} Confirm',
  revokeConfirm: '{e.warn} Revoke <b>{memo}</b>? Stored data is deleted; Telegram history stays.',
  revoked: '{e.trash} <s>{link}</s>\nLink revoked. Data cleared.',
  revokedShort: 'Revoked.',
  memoPrompt: '{e.memo} Send the new memo (max {max} characters).',
  memoChanged: '{e.memo} Memo updated.',
  renameUsage: '{e.memo} Send /rename &lt;name&gt; inside the topic you want to rename.',
  renamed: '{e.memo} Topic renamed to {name}.',
  renameNoTopic: '{e.warn} Use /rename inside a topic.',
  renameFailed: '{e.warn} Could not rename this topic.',
  answerWindow: '{e.write} Reply within {seconds}s. Send your message now.',
  replyBusy: 'A reply is already waiting. Send it first.',
  memoBusy: 'Send the pending memo first.',
  answerSent: '{e.check} Reply sent.',
  answerExpired: '{e.hourglass} The reply window closed. Press Answer again.',
  answerOnly: '{e.info} Press Answer on a message to reply.',
  modeCleared: '{e.repeat} Mode cleared. Send your next message to choose again.',
  cancelled: 'Cancelled.',
  btnAnswer: '{e.answer} Answer',
  btnRead: '{e.eyes} Read',
  btnBlockLink: '{e.block} Block here',
  btnBlockAll: '{e.globe} Block everywhere',
  btnUnblockLink: '{e.dove} Unblock here',
  btnUnblockAll: '{e.dove} Unblock everywhere',
  blockedLink: '{e.block} Blocked on this link.',
  blockedAll: '{e.block} Blocked on all your links.',
  unblockedLink: '{e.dove} Unblocked on this link.',
  unblockedAll: '{e.dove} Unblocked on all links.',
  readFailed: '{e.warn} Sender deleted the message; the read receipt could not be delivered.',
  blockedNotice: '{e.block} You are blocked by the owner.',
  throttle: '{e.hourglass} Too fast — wait a moment.',
  albumPartial: '{e.warn} Part of the album was deleted; the rest was delivered.',
  deleteNotice: '{e.trash} Stored data deleted. Only this chat history remains.',
  topicClosed: '{e.trash} This topic is closed because the link was revoked.',
  topicsDisabled: '{e.info} Enable Topics for this bot in @BotFather to get separate threads.',
  preparing: '{e.hourglass} Preparing your topic — tap the mode again in a moment.',
  failed: '{e.warn} Delivery failed. Try again.',
};

const fa = {
  welcome:
    '{e.brand} <b>AmnPM</b> — صندوق خصوصی، فقط با یک لینک.\n' +
    '{e.plus} /newlink   {e.link} /links   {e.tool} /help   {e.info} /about\n' +
    '{verify} · <a href="{repo}">منبع</a>',
  help:
    '{e.tool} <b>راهنما</b>\n' +
    '/newlink [یادداشت] · /links · /about\n' +
    '/rename &lt;نام&gt; داخل موضوع — ایموجی جهت/حالت همیشه در ابتدا می‌ماند.\n' +
    'تغییر نام از رابط تلگرام برای ربات دیده نمی‌شود؛ فقط /rename ایموجی اجباری را حفظ می‌کند.',
  linkIntro:
    '{e.link} <b>لینک شما آماده است</b> — یادداشت: <b>{memo}</b>\n' +
    '<code>{link}</code>\n' +
    'آن را به اشتراک بگذارید؛ هر کسی با آن می‌تواند بدون دیدن هویت شما پیام بدهد.\n' +
    'نام موضوع را با /rename &lt;نام&gt; داخل آن تغییر دهید.',
  linkInactive: '{e.warn} این لینک دیگر فعال نیست.',
  linkNotFound: '{e.warn} لینک پیدا نشد.',
  ownLink: '{e.upside} این لینک خودتان است. آن را به اشتراک بگذارید.',
  startFromLink: '{e.link} اول یک لینک باز کنید، بعد پیام بفرستید.',
  prompt:
    '{e.write} پیامتان را بفرستید. ربات هرقدر لازم باشد منتظر می‌ماند.\n' +
    'نام این موضوع را با /rename &lt;نام&gt; تغییر دهید.',
  senderTopicHint: '{e.inbox} پیام‌های این لینک در موضوع «{e.up} {token}» هستند. آن را باز کنید و همان‌جا بنویسید.',
  senderTopicMissing:
    'لینک را دوباره باز کنید تا موضوع شما ساخته شود، سپس همان‌جا بنویسید.\n' +
    'پیام‌های بخش All ارسال نمی‌شوند.',
  topicPreparing: '{e.hourglass} موضوع شما در حال آماده‌سازی است — لحظه‌ای بعد دوباره لینک را باز کنید.',
  topicFailed: '{e.warn} ساخت موضوع ممکن نشد. لینک را دوباره باز کنید تا تلاش شود.',
  chooseMode: '{e.send} این پیام چطور به صاحب لینک برسد؟',
  modeAnon: '{e.anon} ناشناس',
  modeHistory: '{e.history} با سابقه',
  modeForward: '{e.forward} هدایت',
  sentAnon: '{e.anon} ناشناس ارسال شد.',
  sentHistory: '{e.history} با سابقه به‌عنوان {indicator} ارسال شد.',
  sentForward: '{e.forward} هدایت شد.',
  capReached: '{e.warn} سقف لینک ({cap}) پر است. با /links یکی را حذف کنید.',
  about:
    '{e.tool} <b>AmnPM</b>\n' +
    '<a href="{contact}">ربات</a> · <a href="{repo}">منبع</a>\n' +
    '{verify}\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.',
  linksTitle: '{e.link} <b>لینک‌های شما</b>\nیکی را برای مدیریت انتخاب کنید.',
  noLinks: '{e.feather} هنوز لینکی ندارید. با /newlink اولین لینک را بسازید.',
  linkMenuTitle: '{e.link} <b>{memo}</b>\n<code>{token}</code>',
  homeTitle: '{e.home} <b>AmnPM</b>\nیک گزینه را انتخاب کنید.',
  homeLinks: '{e.link} لینک‌های من',
  homeHelp: '{e.tool} راهنما',
  homeAbout: '{e.info} درباره',
  back: '{e.back} بازگشت',
  open: '{e.link} باز کردن',
  share: '{e.share} اشتراک',
  revoke: '{e.trash} حذف',
  changeMemo: '{e.memo} یادداشت',
  confirm: '{e.check} تأیید',
  revokeConfirm: '{e.warn} لینک <b>{memo}</b> حذف شود؟ داده‌های ذخیره‌شده پاک می‌شوند؛ تاریخچه تلگرام می‌ماند.',
  revoked: '{e.trash} <s>{link}</s>\nلینک حذف شد. داده‌ها پاک شد.',
  revokedShort: 'حذف شد.',
  memoPrompt: '{e.memo} یادداشت جدید را بفرستید (حداکثر {max} نویسه).',
  memoChanged: '{e.memo} یادداشت به‌روز شد.',
  renameUsage: '{e.memo} داخل موضوعی که می‌خواهید تغییر نام دهد، بنویسید: /rename &lt;نام&gt;',
  renamed: '{e.memo} نام موضوع به {name} تغییر کرد.',
  renameNoTopic: '{e.warn} دستور /rename را داخل یک موضوع بفرستید.',
  renameFailed: '{e.warn} تغییر نام این موضوع ممکن نشد.',
  answerWindow: '{e.write} تا {seconds} ثانیه پاسخ دهید. پیامتان را بفرستید.',
  replyBusy: 'یک پاسخ در انتظار است. اول آن را بفرستید.',
  memoBusy: 'اول یادداشت در انتظار را بفرستید.',
  answerSent: '{e.check} پاسخ ارسال شد.',
  answerExpired: '{e.hourglass} پنجره پاسخ بسته شد. دوباره Answer را بزنید.',
  answerOnly: '{e.info} برای پاسخ، روی پیام Answer را بزنید.',
  modeCleared: '{e.repeat} حالت پاک شد. پیام بعدی را بفرستید تا دوباره انتخاب کنید.',
  cancelled: 'لغو شد.',
  btnAnswer: '{e.answer} پاسخ',
  btnRead: '{e.eyes} خواندن',
  btnBlockLink: '{e.block} مسدود در این لینک',
  btnBlockAll: '{e.globe} مسدود در همه لینک‌ها',
  btnUnblockLink: '{e.dove} رفع در این لینک',
  btnUnblockAll: '{e.dove} رفع در همه لینک‌ها',
  readFailed: '{e.warn} فرستنده پیام را حذف کرده؛ رسید خواندن قابل ارسال نیست.',
  blockedLink: '{e.block} در این لینک مسدود شد.',
  blockedAll: '{e.block} در همه لینک‌ها مسدود شد.',
  unblockedLink: '{e.dove} در این لینک رفع مسدودی شد.',
  unblockedAll: '{e.dove} در همه لینک‌ها رفع مسدودی شد.',
  blockedNotice: '{e.block} شما توسط صاحب لینک مسدود شده‌اید.',
  throttle: '{e.hourglass} خیلی سریع — کمی صبر کنید.',
  albumPartial: '{e.warn} بخشی از آلبوم حذف شده بود؛ بقیه ارسال شد.',
  deleteNotice: '{e.trash} داده‌های ذخیره‌شده پاک شد. فقط تاریخچه همین گفتگو می‌ماند.',
  topicClosed: '{e.trash} این موضوع بسته شد چون لینک حذف شده است.',
  topicsDisabled: '{e.info} برای دریافت موضوع‌های جداگانه، Topics را در @BotFather فعال کنید.',
  preparing: '{e.hourglass} موضوع در حال آماده‌سازی است — لحظه‌ای بعد دوباره حالت را بزنید.',
  failed: '{e.warn} ارسال نشد. دوباره تلاش کنید.',
};

const STRINGS = { en, fa };

export function normalizeLang(code) {
  return String(code ?? '').toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] ?? STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  text = text.replace(/\{e\.([a-z]+)\}/g, (_, name) => EMOJI[name] ?? '');
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
