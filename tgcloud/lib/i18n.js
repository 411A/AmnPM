import { EMOJI } from './constants.js';

const en = {
  welcome:
    '{e.brand} <b>AmnPM</b>\n' +
    '<blockquote>Private, anonymous inbox behind one link.</blockquote>\n' +
    '\n' +
    '{e.start} /start\n' +
    '{e.link} /newlink\n' +
    '{e.chain} /links\n' +
    '{e.tag} /rename\n' +
    '{e.book} /help\n' +
    '{e.lock} /privacy\n' +
    '{e.info} /about\n' +
    '\n' +
    '{verify}',
  help:
    '{e.book} <b>Help</b>\n' +
    '{e.start} /start — open the bot\n' +
    '{e.link} /newlink [memo] — create a link\n' +
    '{e.chain} /links — manage links\n' +
    '{e.tag} /rename &lt;name&gt; — rename this topic\n' +
    '{e.book} /help — this list\n' +
    '{e.lock} /privacy — what is stored\n' +
    '{e.info} /about — version and source\n' +
    '<blockquote expandable>Topic names keep the direction/mode emoji. Telegram UI renames are invisible to the bot; only /rename keeps the mandatory emoji.</blockquote>',
  privacy:
    '{e.lock} <b>Privacy</b>\n' +
    'No message content is stored.\n' +
    'Links, memos, and sender ids are encrypted at rest.\n' +
    '<blockquote expandable>Revoking a link deletes every stored row for it and destroys its key. Telegram keeps its own copy of messages. The deployment key lets the operator decrypt stored fields, so encryption protects the database, not the operator. The bot writes no logs.</blockquote>',
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
  chooseMode:
    '{e.send} How should this reach the owner?\n' +
    '<blockquote expandable>{e.anon} Anonymous — no identity shown\n{e.history} With history — a stable alias per link\n{e.forward} Forward — your Telegram profile is shown</blockquote>',
  modeAnon: '{e.anon} Anonymous',
  modeHistory: '{e.history} With history',
  modeForward: '{e.forward} Forward',
  sentAnon: '{e.anon} Sent anonymously.',
  sentHistory: '{e.history} Sent with history as <code>{indicator}</code>.',
  sentForward: '{e.forward} Forwarded.',
  capReached: '{e.warn} Link limit reached ({cap}). Revoke one with /links.',
  about:
    '{e.info} <b>AmnPM</b>\n' +
    '<a href="{contact}">Bot</a> · <a href="{repo}">Source</a>\n' +
    '{verify}\n' +
    'No message content is stored.',
  linksTitle:
    '{e.link} <b>Your links</b>\n' +
    'Pick one to manage.\n' +
    '<blockquote expandable>Each button opens one link — share, rename, or revoke it.\n{e.back} Back — open the main menu</blockquote>',
  noLinks: '{e.feather} No links yet. /newlink creates your first one.',
  linkMenuTitle:
    '{e.link} <b>{memo}</b>\n' +
    '<code>{token}</code>\n' +
    '<blockquote expandable>{e.back} Back — link list\n{e.link} Open — open your link\n{e.share} Share — send it to someone\n{e.memo} Memo — rename this link\n{e.cross} Revoke — delete the link and its data</blockquote>',
  homeTitle:
    '{e.home} <b>AmnPM</b>\n' +
    'Choose an option.\n' +
    '<blockquote expandable>{e.link} My links — manage and share\n{e.tool} Help — commands and topic rules\n{e.info} About — version and privacy</blockquote>',
  homeLinks: '{e.link} My links',
  homeHelp: '{e.tool} Help',
  homeAbout: '{e.info} About',
  back: '{e.back} Back',
  open: '{e.link} Open',
  share: '{e.share} Share',
  revoke: '{e.cross} Revoke',
  changeMemo: '{e.memo} Memo',
  confirm: '{e.check} Confirm',
  revokeConfirm: '{e.warn} Revoke <b>{memo}</b>? Stored data is deleted; Telegram history stays.',
  revoked: '{e.cross} <s>{link}</s>\nLink revoked. Data cleared.',
  revokedShort: 'Revoked.',
  memoPrompt: '{e.memo} Send the new memo (max {max} characters).',
  memoChanged: '{e.memo} Memo updated.',
  renameUsage: '{e.memo} Send /rename &lt;name&gt; inside the topic you want to rename.',
  renamed: '{e.memo} Topic renamed to {name}.',
  renameNoTopic: '{e.warn} Use /rename inside a topic.',
  renameFailed: '{e.warn} Could not rename this topic.',
  answerWindow: '{e.write} Send your reply in this topic. Press Answer on another message to switch.',
  cancel: 'Cancel',
  replyBusy: 'Another action is already pending in this chat.',
  memoBusy: 'Send the pending memo first.',
  answerSent: '{e.check} Reply sent.',
  answerExpired: '{e.hourglass} That reply is no longer available. Press Answer again.',
  answerOnly: '{e.info} Press Answer on a message to reply.',
  replySetup:
    '{e.info} This topic was created before direct replies. Press Answer once on any message here, ' +
    'or ask the sender to send one message. After that, typing here replies directly.',
  modeCleared: '{e.repeat} Mode cleared. Send your next message to choose again.',
  cancelled: 'Cancelled.',
  btnAnswer: '{e.answer} Answer',
  btnRead: '{e.eyes} Read',
  controlsGuide:
    '<blockquote expandable>{e.answer} Answer — reply to this sender\n{e.eyes} Read — send a read receipt\n{e.block} Block here — block on this link\n{e.globe} Block everywhere — block on all your links</blockquote>',
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
  topicClosed: '{e.cross} This topic is closed because the link was revoked.',
  topicsDisabled: '{e.info} Enable Topics for this bot in @BotFather to get separate threads.',
  preparing: '{e.hourglass} Preparing your topic — tap the mode again in a moment.',
  failed: '{e.warn} Delivery failed. Try again.',
};

const fa = {
  welcome:
    '{e.brand} <b>AmnPM</b>\n' +
    '<blockquote>صندوق خصوصی و ناشناس، پشت یک لینک.</blockquote>\n' +
    '\n' +
    '{e.start} /start\n' +
    '{e.link} /newlink\n' +
    '{e.chain} /links\n' +
    '{e.tag} /rename\n' +
    '{e.book} /help\n' +
    '{e.lock} /privacy\n' +
    '{e.info} /about\n' +
    '\n' +
    '{verify}',
  help:
    '{e.book} <b>راهنما</b>\n' +
    '{e.start} /start — شروع ربات\n' +
    '{e.link} /newlink [یادداشت] — ساخت لینک\n' +
    '{e.chain} /links — مدیریت لینک‌ها\n' +
    '{e.tag} /rename &lt;نام&gt; — تغییر نام موضوع\n' +
    '{e.book} /help — همین فهرست\n' +
    '{e.lock} /privacy — چه چیزی ذخیره می‌شود\n' +
    '{e.info} /about — نسخه و منبع\n' +
    '<blockquote expandable>نام موضوع همیشه ایموجی جهت/حالت را نگه می‌دارد. تغییر نام از رابط تلگرام برای ربات دیده نمی‌شود؛ فقط /rename ایموجی اجباری را حفظ می‌کند.</blockquote>',
  privacy:
    '{e.lock} <b>حریم خصوصی</b>\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.\n' +
    'لینک‌ها، یادداشت‌ها و شناسه فرستنده‌ها در حالت سکون رمزنگاری می‌شوند.\n' +
    '<blockquote expandable>حذف یک لینک همه ردیف‌های ذخیره‌شده آن را پاک می‌کند و کلیدش را از بین می‌برد. تلگرام نسخه خودش از پیام‌ها را نگه می‌دارد. کلید استقرار به اپراتور اجازه رمزگشایی فیلدهای ذخیره‌شده را می‌دهد؛ رمزنگاری از پایگاه داده محافظت می‌کند، نه از اپراتور. ربات هیچ لاگی نمی‌نویسد.</blockquote>',
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
  chooseMode:
    '{e.send} این پیام چطور به صاحب لینک برسد؟\n' +
    '<blockquote expandable>{e.anon} ناشناس — بدون نمایش هویت\n{e.history} با سابقه — نام مستعار ثابت برای هر لینک\n{e.forward} هدایت — پروفایل تلگرام شما دیده می‌شود</blockquote>',
  modeAnon: '{e.anon} ناشناس',
  modeHistory: '{e.history} با سابقه',
  modeForward: '{e.forward} هدایت',
  sentAnon: '{e.anon} ناشناس ارسال شد.',
  sentHistory: '{e.history} با سابقه به‌عنوان <code>{indicator}</code> ارسال شد.',
  sentForward: '{e.forward} هدایت شد.',
  capReached: '{e.warn} سقف لینک ({cap}) پر است. با /links یکی را حذف کنید.',
  about:
    '{e.info} <b>AmnPM</b>\n' +
    '<a href="{contact}">ربات</a> · <a href="{repo}">منبع</a>\n' +
    '{verify}\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.',
  linksTitle:
    '{e.link} <b>لینک‌های شما</b>\n' +
    'یکی را برای مدیریت انتخاب کنید.\n' +
    '<blockquote expandable>هر دکمه یک لینک را باز می‌کند — اشتراک، تغییر نام یا حذف.\n{e.back} بازگشت — منوی اصلی</blockquote>',
  noLinks: '{e.feather} هنوز لینکی ندارید. با /newlink اولین لینک را بسازید.',
  linkMenuTitle:
    '{e.link} <b>{memo}</b>\n' +
    '<code>{token}</code>\n' +
    '<blockquote expandable>{e.back} بازگشت — فهرست لینک‌ها\n{e.link} باز کردن — باز کردن لینک\n{e.share} اشتراک — ارسال برای دیگران\n{e.memo} یادداشت — تغییر نام این لینک\n{e.cross} حذف — پاک کردن لینک و داده‌ها</blockquote>',
  homeTitle:
    '{e.home} <b>AmnPM</b>\n' +
    'یک گزینه را انتخاب کنید.\n' +
    '<blockquote expandable>{e.link} لینک‌های من — مدیریت و اشتراک\n{e.tool} راهنما — دستورها و قواعد\n{e.info} درباره — نسخه و حریم خصوصی</blockquote>',
  homeLinks: '{e.link} لینک‌های من',
  homeHelp: '{e.tool} راهنما',
  homeAbout: '{e.info} درباره',
  back: '{e.back} بازگشت',
  open: '{e.link} باز کردن',
  share: '{e.share} اشتراک',
  revoke: '{e.cross} حذف',
  changeMemo: '{e.memo} یادداشت',
  confirm: '{e.check} تأیید',
  revokeConfirm: '{e.warn} لینک <b>{memo}</b> حذف شود؟ داده‌های ذخیره‌شده پاک می‌شوند؛ تاریخچه تلگرام می‌ماند.',
  revoked: '{e.cross} <s>{link}</s>\nلینک حذف شد. داده‌ها پاک شد.',
  revokedShort: 'حذف شد.',
  memoPrompt: '{e.memo} یادداشت جدید را بفرستید (حداکثر {max} نویسه).',
  memoChanged: '{e.memo} یادداشت به‌روز شد.',
  renameUsage: '{e.memo} داخل موضوعی که می‌خواهید تغییر نام دهد، بنویسید: /rename &lt;نام&gt;',
  renamed: '{e.memo} نام موضوع به {name} تغییر کرد.',
  renameNoTopic: '{e.warn} دستور /rename را داخل یک موضوع بفرستید.',
  renameFailed: '{e.warn} تغییر نام این موضوع ممکن نشد.',
  answerWindow: '{e.write} پاسخ را در همین موضوع بفرستید. برای تغییر، Answer پیام دیگری را بزنید.',
  cancel: 'لغو',
  replyBusy: 'یک اقدام دیگر در این گفتگو در انتظار است.',
  memoBusy: 'اول یادداشت در انتظار را بفرستید.',
  answerSent: '{e.check} پاسخ ارسال شد.',
  answerExpired: '{e.hourglass} این پاسخ دیگر در دسترس نیست. دوباره Answer را بزنید.',
  answerOnly: '{e.info} برای پاسخ، روی پیام Answer را بزنید.',
  replySetup:
    '{e.info} این موضوع پیش از فعال‌شدن پاسخ مستقیم ساخته شده است. یک بار روی Answer هر پیام همین‌جا بزنید، ' +
    'یا از فرستنده بخواهید یک پیام بفرستد. بعد از آن، تایپ در همین موضوع مستقیماً ارسال می‌شود.',
  modeCleared: '{e.repeat} حالت پاک شد. پیام بعدی را بفرستید تا دوباره انتخاب کنید.',
  cancelled: 'لغو شد.',
  btnAnswer: '{e.answer} پاسخ',
  btnRead: '{e.eyes} خواندن',
  controlsGuide:
    '<blockquote expandable>{e.answer} پاسخ — پاسخ به همین فرستنده\n{e.eyes} خواندن — ارسال رسید خواندن\n{e.block} مسدود در این لینک — فقط همین لینک\n{e.globe} مسدود در همه لینک‌ها — همه لینک‌ها</blockquote>',
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
  topicClosed: '{e.cross} این موضوع بسته شد چون لینک حذف شده است.',
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
