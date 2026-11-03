import { EMOJI } from './constants.js';

const en = {
  welcome:
    '{e.brand} <b>AmnPM</b> — a private inbox behind one link.\n' +
    '\n' +
    'Use /newlink to create a link, then share it. Anyone can write to you without seeing your identity. Unlike archive-style inbox bots, no message content is stored; link details are encrypted at rest. It runs on Telegram Serverless with open-source code (<a href="{repo}">source</a>).\n' +
    '\n' +
    '<blockquote expandable><b>Send modes</b>\n' +
    '{e.anon} Full anonymous — no name or history is shared.\n' +
    '{e.history} With history — a stable alias, so replies can reach you.\n' +
    '{e.forward} Forward — your Telegram profile is shown with the message.</blockquote>\n' +
    '\n' +
    '<blockquote expandable><b>Privacy</b>\n' +
    'No ads, no analytics, no message archive. Revoking a link deletes all data the bot stored for it. Telegram keeps its own chat history.</blockquote>\n' +
    '\n' +
    '{verify}',
  help:
    '{e.book} <b>Help</b>\n' +
    'Tap a section to expand it.\n' +
    '<details><summary><b>Commands</b></summary>\n' +
    '<ul>\n' +
    '<li><b>{e.start} /start</b><br>Welcome & your main link.</li>\n' +
    '<li><b>{e.link} /newlink [note]</b><br>Create a link; the note is its label.</li>\n' +
    '<li><b>{e.control} /settings</b><br>Manage links, receive modes, help & about.</li>\n' +
    '<li><b>{e.tag} /rename name</b><br>Rename the topic you are writing in.</li>\n' +
    '<li><b>{e.book} /help</b><br>Show this guide.</li>\n' +
    '<li><b>{e.lock} /privacy</b><br>Explain what is stored.</li>\n' +
    '<li><b>{e.info} /about</b><br>Show version, source & verification.</li>\n' +
    '</ul>\n' +
    '</details>\n' +
    '<details><summary><b>Send modes</b></summary>\n' +
    '<ul>\n' +
    '<li><b>{e.anon} Full anonymous</b><br>No name or history is shared; replies still reach your topic.</li>\n' +
    '<li><b>{e.history} With history</b><br>A stable alias per link; the owner can reply to you.</li>\n' +
    '<li><b>{e.forward} Forward</b><br>Your Telegram profile is shown with the message.</li>\n' +
    '</ul>\n' +
    '</details>\n' +
    '<details><summary><b>Topics & naming</b></summary>\n' +
    'Each link gets its own topic. Use <code>/rename name</code> inside a topic; the direction/mode emoji stays at the front. Telegram UI renames are invisible to the bot; only /rename keeps the mandatory emoji. Telegram may not push the new title to your app instantly: reopen the chat to refresh it.\n' +
    '</details>\n' +
    '<details><summary><b>Managing links</b></summary>\n' +
    'Open /settings → My links to open, share, rename, or revoke a link. Revoking deletes all data the bot stored for that link. Telegram history stays.\n' +
    '</details>',
  privacy:
    '{e.lock} <b>Privacy</b>\n' +
    'No message content is stored.\n' +
    'Links, memos, and sender ids are encrypted at rest.\n' +
    'Runs securely inside Telegram’s own infrastructure (<a href="https://core.telegram.org/bots/serverless">Telegram Serverless</a>).\n' +
    '<blockquote expandable>Revoking a link deletes every stored row for it and destroys its key. Telegram keeps its own copy of messages. The deployment key lets the operator decrypt stored fields, so encryption protects the database, not the operator. The bot writes no logs.</blockquote>',
  linkIntro:
    '{e.link} <b>Your link is ready</b>\n' +
    '{e.memo} <b>{memo}</b>\n' +
    '\n' +
    '<code>{link}</code>\n' +
    '\n' +
    'Share it. Anyone with it can write to you without seeing your identity.\n' +
    'Rename a topic with <code>/rename name</code> inside it.\n' +
    '{guide}',
  linkGuide:
    '<blockquote expandable>{e.link} Open — open your own link to test the sender view.\n{e.share} Share — send it to someone.\n\nThe note above labels this link & its owner topics. Change it later in /settings → My links.</blockquote>',
  linkInactive: '{e.warn} This link is no longer active.',
  linkNotFound: '{e.warn} Link not found.',
  ownLink: '{e.upside} This is your own link. Share it instead.',
  startFromLink: '{e.link} Open a link first, then send your message.',
  prompt:
    '{e.write} Send your message. The bot will wait for it as long as needed.\n' +
    'Rename this topic with <code>/rename name</code>.',
  senderTopicHint: '{e.inbox} Your messages for this link are in the "{e.sender} {token}" topic. Open it and write there.',
  senderTopicMissing:
    'Open your link again to create your topic, then write there.\n' +
    'Messages in All are not delivered.',
  topicPreparing: '{e.hourglass} Your topic is being prepared — tap the link again in a moment.',
  topicFailed: '{e.warn} Could not create your topic. Open the link again to retry.',
  chooseMode:
    '{e.send} How should this reach the owner?\n' +
    '<blockquote expandable>{guide}\n\nThe mode only changes what the owner sees about you; every mode still delivers to the owner.</blockquote>',
  modeGuideAnon: '{e.anon} Full anonymous — no name or history is shared. Replies still reach your topic.',
  modeGuideHistory: '{e.history} With history — a stable alias derived from your first name when the conversation starts; replies stay connected without revealing your profile. It does not change if your Telegram name changes later.',
  modeGuideForward: '{e.forward} Forward — your Telegram profile is shown with the message.',
  modeAnon: '{e.anon} Anonymous',
  modeHistory: '{e.history} With history',
  modeForward: '{e.forward} Forward',
  sentAnon: '{e.anon} Sent anonymously.',
  sentHistory: '{e.history} Sent with history as <code>{indicator}</code>.',
  sentForward: '{e.forward} Forwarded.',
  capReached: '{e.warn} Link limit reached ({cap}). Revoke one in /settings.',
  about:
    '{e.info} <b>AmnPM</b><br>\n' +
    '{verify}<br>\n' +
    '<table bordered striped compact>\n' +
    '<tr><th align="center">Resource</th><th align="center">Link</th></tr>\n' +
    '<tr><td align="center" valign="middle">Bot</td><td align="center" valign="middle"><a href="{contact}">@AmnPMBot</a></td></tr>\n' +
    '<tr><td align="center" valign="middle">Source</td><td align="center" valign="middle"><a href="{repo}">GitHub</a></td></tr>\n' +
    '</table>\n' +
    'No message content is stored.',
  linksTitle:
    '{e.chain} <b>My links</b>\n' +
    'Pick one to manage.\n' +
    '<blockquote expandable>Tap a link to open its controls.\n\nInside, you can open the link, share it, change its note, or revoke it.\n\nRevoking is permanent for the bot: the link stops working and its stored data is removed. Telegram history stays.\n\n{e.back} Back returns to settings.</blockquote>',
  noLinks: '{e.feather} No links yet. /newlink creates your first one.',
  linkMenuTitle:
    '{e.link} <b>{memo}</b>\n' +
    '<code>{token}</code>\n' +
    '<blockquote expandable>{e.link} Open — open your link in Telegram; use it to test the sender view.\n{e.share} Share — send the link to someone.\n{e.memo} Memo — change the note for this link; owner topic names update too.\n{e.cross} Revoke — stop the link, delete the bot’s stored data, & close its topics. This cannot be undone.\n{e.back} Back — return to My links.</blockquote>',
  homeTitle:
    '{e.control} <b>Settings</b>\n' +
    'Manage your links & choose how senders can reach you.\n' +
    '<blockquote expandable><b>What each option does</b>\n' +
    '{e.chain} My links — see every active link. Open it, share it, change its note, or revoke it.\n' +
    '{e.settings} Receive modes — turn anonymous, history, or forward on or off for senders. At least one stays on.\n' +
    '{e.book} Help — command reference & short guides for modes, topics, and link management.\n' +
    '{e.info} About — bot version, source code & the running-code check.</blockquote>',
  homeLinks: '{e.chain} My links',
  homeModes: '{e.settings} Receive modes',
  homeHelp: '{e.book} Help',
  homeAbout: '{e.info} About',
  openMain: '{e.link} Open main link',
  modesTitle:
    '{e.settings} <b>Receive modes</b>\n' +
    'Choose what senders can use on all your links.\n' +
    '<blockquote expandable>Tap a mode to turn it on or off. Senders only see enabled modes.\n\n{e.anon} Anonymous — hides the sender name & history.\n{e.history} With history — a stable alias per link; replies can reach the sender.\n{e.forward} Forward — shows the sender’s Telegram profile.\n\nAt least one mode must stay on. Changes apply to new messages; already-delivered messages are unchanged.</blockquote>',
  modesKeepOne: '{e.warn} Keep at least one mode enabled.',
  modeUnavailable: '{e.warn} This mode is no longer available.',
  back: '{e.back} Back',
  open: '{e.link} Open',
  share: '{e.share} Share',
  revoke: '{e.cross} Revoke',
  changeMemo: '{e.memo} Memo',
  confirm: '{e.check} Confirm',
  revokeConfirm:
    '{e.warn} Revoke <b>{memo}</b>?\n' +
    '<blockquote expandable>The link stops working immediately. All data the bot stored for this link is deleted, including its topics and reply targets. Telegram chat history remains. This cannot be undone.</blockquote>',
  revoked: '{e.cross} <s>{link}</s>\nLink revoked. Data cleared.',
  revokedShort: 'Revoked.',
  memoPrompt: '{e.memo} Send the new memo (max {max} characters).',
  memoChanged: '{e.memo} <b>Memo updated</b>\n<blockquote>{memo}</blockquote>',
  memoTaken: '{e.warn} Another link already uses that name. Try "{suggestion}" instead.',
  menuExpired: '{e.warn} This menu is out of date. Open /settings again.',
  albumPartialSender: '{e.warn} Part of your album arrived too late and was not sent. Please resend it.',
  renameUsage: '{e.tag} Send <code>/rename name</code> inside the topic you want to rename.',
  renamed: '{e.tag} Topic renamed to {name}.\nIf your app still shows the old title, reopen the chat.',
  renameNoTopic: '{e.warn} Use <code>/rename name</code> inside a topic (not in All).',
  renameUnknown: '{e.warn} This topic belongs to an older or revoked link, so the bot cannot rename it. Open a current topic and try again.',
  renameFailed: '{e.warn} Could not rename this topic.',
  renameFailedRetry: '{e.warn} Telegram is flood-limiting renames. Try again in {seconds} seconds.',
  memoPartial: '{e.warn} Memo saved, but {count} topic(s) kept their old names. Try /rename there directly.',
  renameRights: '{e.warn} The bot needs the Manage Topics admin right in this chat. Ask an admin to grant it, then try again.',
  renameTaken: '{e.warn} That name is already used by another topic. Pick a different one.',
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
  modeCleared: '{e.repeat} Mode marker cleared. Every message still asks once before sending.',
  cancelled: 'Cancelled.',
  btnAnswer: '{e.answer} Answer',
  btnRead: '{e.eyes} Read',
  controlsGuide:
    '<blockquote expandable>{e.answer} Answer — reply to this sender; the reply appears in their link topic.\n{e.eyes} Read — send a read receipt.\n{e.block} Block here — stop this sender on this link.\n{e.globe} Block everywhere — stop this sender on all your links.\n\nBlocking hides future messages from this sender. Use the same buttons to unblock.</blockquote>',
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
  blockedReply: '{e.block} You blocked this sender. Unblock them to reply.',
  throttle: '{e.hourglass} Too fast — wait a moment.',
  albumPartial: '{e.warn} Part of the album was deleted; the rest was delivered.',
  deleteNotice:
    '{e.trash} Link unavailable\n' +
    'The owner revoked this link, so the bot deleted all data it stored for it. You can no longer send messages or answer anyone from this link. Telegram keeps its own chat history.',
  topicDeleted:
    '{e.trash} This topic is closed\n' +
    'The link was revoked, so the bot deleted all data it stored for it. You can no longer send messages or answer anyone in this topic. Telegram keeps this chat history.',
  topicClosed:
    '{e.cross} Topic closed\n' +
    'The link was revoked, so the bot deleted its stored data for this link. This topic no longer accepts messages or answers. Telegram keeps its own chat history.',
  topicsDisabled: '{e.info} Enable Topics for this bot in @BotFather to get separate threads.',
  preparing: '{e.hourglass} Preparing your topic — tap the mode again in a moment.',
  failed: '{e.warn} Delivery failed. Try again.',
};

const fa = {
  welcome:
    '{e.brand} <b>AmnPM</b> — صندوق خصوصی، پشت یک لینک.\n' +
    '\n' +
    'برای ساخت لینک از /newlink استفاده کنید و آن را به اشتراک بگذارید. هر کسی می‌تواند بدون دیدن هویت شما پیام بدهد. برخلاف ربات‌های صندوق آرشیوی، هیچ محتوای پیامی ذخیره نمی‌شود؛ اطلاعات لینک در حالت سکون رمزنگاری می‌شود. این ربات روی Telegram Serverless با کد متن‌باز اجرا می‌شود (<a href="{repo}">منبع</a>).\n' +
    '\n' +
    '<blockquote expandable><b>حالت‌های ارسال</b>\n' +
    '{e.anon} کاملاً ناشناس — هیچ نام یا سابقه‌ای به اشتراک گذاشته نمی‌شود.\n' +
    '{e.history} با سابقه — نام مستعار ثابت، تا پاسخ‌ها به شما برسد.\n' +
    '{e.forward} هدایت — پروفایل تلگرام شما همراه پیام دیده می‌شود.</blockquote>\n' +
    '\n' +
    '<blockquote expandable><b>حریم خصوصی</b>\n' +
    'بدون تبلیغ، بدون تحلیل، بدون آرشیو پیام. حذف لینک همه داده‌های ذخیره‌شده ربات برای آن را پاک می‌کند. تلگرام تاریخچه گفتگوی خودش را نگه می‌دارد.</blockquote>\n' +
    '\n' +
    '{verify}',
  help:
    '{e.book} <b>راهنما</b>\n' +
    'برای باز کردن، روی هر بخش بزنید.\n' +
    '<details><summary><b>دستورات</b></summary>\n' +
    '<ul>\n' +
    '<li><b>{e.start} /start</b><br>صفحه خوش‌آمد و لینک اصلی.</li>\n' +
    '<li><b>{e.link} /newlink [یادداشت]</b><br>ساخت لینک؛ یادداشت برچسب آن است.</li>\n' +
    '<li><b>{e.control} /settings</b><br>مدیریت لینک‌ها، حالت‌های دریافت، راهنما و درباره.</li>\n' +
    '<li><b>{e.tag} /rename نام</b><br>تغییر نام موضوعی که در آن می‌نویسید.</li>\n' +
    '<li><b>{e.book} /help</b><br>نمایش این راهنما.</li>\n' +
    '<li><b>{e.lock} /privacy</b><br>توضیح اینکه چه چیزی ذخیره می‌شود.</li>\n' +
    '<li><b>{e.info} /about</b><br>نمایش نسخه، منبع و تأیید.</li>\n' +
    '</ul>\n' +
    '</details>\n' +
    '<details><summary><b>حالت‌های ارسال</b></summary>\n' +
    '<ul>\n' +
    '<li><b>{e.anon} کاملاً ناشناس</b><br>هیچ نام یا سابقه‌ای به اشتراک گذاشته نمی‌شود؛ پاسخ‌ها همچنان به موضوع شما می‌رسند.</li>\n' +
    '<li><b>{e.history} با سابقه</b><br>نام مستعار ثابت برای هر لینک؛ صاحب لینک می‌تواند پاسخ دهد.</li>\n' +
    '<li><b>{e.forward} هدایت</b><br>پروفایل تلگرام شما همراه پیام دیده می‌شود.</li>\n' +
    '</ul>\n' +
    '</details>\n' +
    '<details><summary><b>موضوع‌ها و نام‌گذاری</b></summary>\n' +
    'هر لینک موضوع خودش را دارد. داخل موضوع از <code>/rename نام</code> استفاده کنید؛ ایموجی جهت/حالت همیشه در ابتدا می‌ماند. تغییر نام از رابط تلگرام برای ربات دیده نمی‌شود؛ فقط /rename ایموجی اجباری را حفظ می‌کند. ممکن است عنوان جدید فوراً در برنامه شما نمایش داده نشود: گفتگو را دوباره باز کنید.\n' +
    '</details>\n' +
    '<details><summary><b>مدیریت لینک‌ها</b></summary>\n' +
    'از /settings → لینک‌های من برای باز کردن، اشتراک، تغییر نام یا حذف لینک استفاده کنید. حذف لینک همه داده‌های ذخیره‌شده ربات برای آن را پاک می‌کند. تاریخچه تلگرام می‌ماند.\n' +
    '</details>',
  privacy:
    '{e.lock} <b>حریم خصوصی</b>\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.\n' +
    'لینک‌ها، یادداشت‌ها و شناسه فرستنده‌ها در حالت سکون رمزنگاری می‌شوند.\n' +
    'به‌صورت امن داخل زیرساخت خود تلگرام (<a href="https://core.telegram.org/bots/serverless">Telegram Serverless</a>) اجرا می‌شود.\n' +
    '<blockquote expandable>حذف یک لینک همه ردیف‌های ذخیره‌شده آن را پاک می‌کند و کلیدش را از بین می‌برد. تلگرام نسخه خودش از پیام‌ها را نگه می‌دارد. کلید استقرار به اپراتور اجازه رمزگشایی فیلدهای ذخیره‌شده را می‌دهد؛ رمزنگاری از پایگاه داده محافظت می‌کند، نه از اپراتور. ربات هیچ لاگی نمی‌نویسد.</blockquote>',
  linkIntro:
    '{e.link} <b>لینک شما آماده است</b>\n' +
    '{e.memo} <b>{memo}</b>\n' +
    '\n' +
    '<code>{link}</code>\n' +
    '\n' +
    'آن را به اشتراک بگذارید؛ هر کسی با آن می‌تواند بدون دیدن هویت شما پیام بدهد.\n' +
    'نام موضوع را با <code>/rename نام</code> داخل آن تغییر دهید.\n' +
    '{guide}',
  linkGuide:
    '<blockquote expandable>{e.link} باز کردن — باز کردن لینک خودتان برای آزمودن نمای فرستنده.\n{e.share} اشتراک — ارسال برای دیگران.\n\nیادداشت بالا برچسب این لینک و موضوع‌های صاحب است. بعداً از /settings → لینک‌های من تغییرش دهید.</blockquote>',
  linkInactive: '{e.warn} این لینک دیگر فعال نیست.',
  linkNotFound: '{e.warn} لینک پیدا نشد.',
  ownLink: '{e.upside} این لینک خودتان است. آن را به اشتراک بگذارید.',
  startFromLink: '{e.link} اول یک لینک باز کنید، بعد پیام بفرستید.',
  prompt:
    '{e.write} پیامتان را بفرستید. ربات هرقدر لازم باشد منتظر می‌ماند.\n' +
    'نام این موضوع را با <code>/rename نام</code> تغییر دهید.',
  senderTopicHint: '{e.inbox} پیام‌های این لینک در موضوع «{e.sender} {token}» هستند. آن را باز کنید و همان‌جا بنویسید.',
  senderTopicMissing:
    'لینک را دوباره باز کنید تا موضوع شما ساخته شود، سپس همان‌جا بنویسید.\n' +
    'پیام‌های بخش All ارسال نمی‌شوند.',
  topicPreparing: '{e.hourglass} موضوع شما در حال آماده‌سازی است — لحظه‌ای بعد دوباره لینک را باز کنید.',
  topicFailed: '{e.warn} ساخت موضوع ممکن نشد. لینک را دوباره باز کنید تا تلاش شود.',
  chooseMode:
    '{e.send} این پیام چطور به صاحب لینک برسد؟\n' +
    '<blockquote expandable>{guide}\n\nحالت فقط چیزی را تغییر می‌دهد که صاحب لینک از شما می‌بیند؛ همه حالت‌ها پیام را به صاحب لینک می‌رسانند.</blockquote>',
  modeGuideAnon: '{e.anon} کاملاً ناشناس — هیچ نام یا سابقه‌ای به اشتراک گذاشته نمی‌شود. پاسخ‌ها همچنان به موضوع شما می‌رسند.',
  modeGuideHistory: '{e.history} با سابقه — نام مستعار ثابت بر پایه نام شما هنگام آغاز گفتگو؛ ارتباط پاسخ‌ها حفظ می‌شود بدون نمایش پروفایل. با تغییر نام تلگرام تغییر نمی‌کند.',
  modeGuideForward: '{e.forward} هدایت — پروفایل تلگرام شما همراه پیام دیده می‌شود.',
  modeAnon: '{e.anon} ناشناس',
  modeHistory: '{e.history} با سابقه',
  modeForward: '{e.forward} هدایت',
  sentAnon: '{e.anon} ناشناس ارسال شد.',
  sentHistory: '{e.history} با سابقه به‌عنوان <code>{indicator}</code> ارسال شد.',
  sentForward: '{e.forward} هدایت شد.',
  capReached: '{e.warn} سقف لینک ({cap}) پر است. در /settings یکی را حذف کنید.',
  about:
    '{e.info} <b>AmnPM</b><br>\n' +
    '{verify}<br>\n' +
    '<table bordered striped compact>\n' +
    '<tr><th align="center">مورد</th><th align="center">لینک</th></tr>\n' +
    '<tr><td align="center" valign="middle">ربات</td><td align="center" valign="middle"><a href="{contact}">@AmnPMBot</a></td></tr>\n' +
    '<tr><td align="center" valign="middle">منبع</td><td align="center" valign="middle"><a href="{repo}">GitHub</a></td></tr>\n' +
    '</table>\n' +
    'هیچ محتوای پیامی ذخیره نمی‌شود.',
  linksTitle:
    '{e.chain} <b>لینک‌های من</b>\n' +
    'یکی را برای مدیریت انتخاب کنید.\n' +
    '<blockquote expandable>برای دیدن کنترل‌ها روی یک لینک بزنید.\n\nداخل آن می‌توانید لینک را باز کنید، به اشتراک بگذارید، یادداشتش را تغییر دهید یا حذفش کنید.\n\nحذف برای ربات دائمی است: لینک از کار می‌افتد و داده‌های ذخیره‌شده پاک می‌شوند. تاریخچه تلگرام می‌ماند.\n\n{e.back} بازگشت به تنظیمات.</blockquote>',
  noLinks: '{e.feather} هنوز لینکی ندارید. با /newlink اولین لینک را بسازید.',
  linkMenuTitle:
    '{e.link} <b>{memo}</b>\n' +
    '<code>{token}</code>\n' +
    '<blockquote expandable>{e.link} باز کردن — باز کردن لینک در تلگرام؛ برای آزمودن نمای فرستنده.\n{e.share} اشتراک — ارسال لینک برای دیگران.\n{e.memo} یادداشت — تغییر یادداشت این لینک؛ نام موضوع‌های صاحب هم به‌روز می‌شود.\n{e.cross} حذف — توقف لینک، پاک کردن داده‌های ذخیره‌شده و بستن موضوع‌ها. قابل بازگشت نیست.\n{e.back} بازگشت — فهرست لینک‌ها.</blockquote>',
  homeTitle:
    '{e.control} <b>تنظیمات</b>\n' +
    'لینک‌ها را مدیریت کنید و انتخاب کنید فرستنده‌ها چطور به شما برسند.\n' +
    '<blockquote expandable><b>هر گزینه چه می‌کند</b>\n' +
    '{e.chain} لینک‌های من — همه لینک‌های فعال. باز کردن، اشتراک، تغییر یادداشت یا حذف.\n' +
    '{e.settings} حالت‌های دریافت — روشن یا خاموش کردن ناشناس، با سابقه یا هدایت برای فرستنده‌ها. حداقل یکی روشن می‌ماند.\n' +
    '{e.book} راهنما — فهرست دستورات و راهنمای کوتاه حالت‌ها، موضوع‌ها و مدیریت لینک‌ها.\n' +
    '{e.info} درباره — نسخه ربات، کد منبع و بررسی کد در حال اجرا.</blockquote>',
  homeLinks: '{e.chain} لینک‌های من',
  homeModes: '{e.settings} حالت‌های دریافت',
  homeHelp: '{e.book} راهنما',
  homeAbout: '{e.info} درباره',
  openMain: '{e.link} باز کردن لینک اصلی',
  modesTitle:
    '{e.settings} <b>حالت‌های دریافت</b>\n' +
    'انتخاب کنید فرستنده‌ها روی همه لینک‌های شما از چه حالت‌هایی استفاده کنند.\n' +
    '<blockquote expandable>برای روشن یا خاموش کردن، روی هر حالت بزنید. فرستنده‌ها فقط حالت‌های فعال را می‌بینند.\n\n{e.anon} ناشناس — نام و سابقه فرستنده پنهان می‌شود.\n{e.history} با سابقه — نام مستعار ثابت برای هر لینک، تا پاسخ‌ها به فرستنده برسد.\n{e.forward} هدایت — پروفایل تلگرام فرستنده نمایش داده می‌شود.\n\nحداقل یک حالت باید روشن بماند. تغییرات روی پیام‌های جدید اثر می‌کند؛ پیام‌های ارسال‌شده تغییر نمی‌کنند.</blockquote>',
  modesKeepOne: '{e.warn} حداقل یک حالت باید روشن بماند.',
  modeUnavailable: '{e.warn} این حالت دیگر در دسترس نیست.',
  back: '{e.back} بازگشت',
  open: '{e.link} باز کردن',
  share: '{e.share} اشتراک',
  revoke: '{e.cross} حذف',
  changeMemo: '{e.memo} یادداشت',
  confirm: '{e.check} تأیید',
  revokeConfirm:
    '{e.warn} لینک <b>{memo}</b> حذف شود؟\n' +
    '<blockquote expandable>لینک بلافاصله از کار می‌افتد. همه داده‌های ذخیره‌شده ربات برای این لینک، از جمله موضوع‌ها و مقصدهای پاسخ، پاک می‌شوند. تاریخچه تلگرام می‌ماند. این کار قابل بازگشت نیست.</blockquote>',
  revoked: '{e.cross} <s>{link}</s>\nلینک حذف شد. داده‌ها پاک شد.',
  revokedShort: 'حذف شد.',
  memoPrompt: '{e.memo} یادداشت جدید را بفرستید (حداکثر {max} نویسه).',
  memoChanged: '{e.memo} <b>یادداشت به‌روز شد</b>\n<blockquote>{memo}</blockquote>',
  memoTaken: '{e.warn} نام دیگری برای لینک دیگری استفاده شده. «{suggestion}» را امتحان کنید.',
  menuExpired: '{e.warn} این منو قدیمی است. دوباره /settings را باز کنید.',
  albumPartialSender: '{e.warn} بخشی از آلبوم دیر رسید و ارسال نشد. لطفاً دوباره بفرستید.',
  renameUsage: '{e.tag} داخل موضوعی که می‌خواهید تغییر نام دهد، بنویسید: <code>/rename نام</code>',
  renamed: '{e.tag} نام موضوع به {name} تغییر کرد.\nاگر برنامه شما هنوز عنوان قبلی را نشان می‌دهد، گفتگو را دوباره باز کنید.',
  renameNoTopic: '{e.warn} برای تغییر نام، <code>/rename نام</code> را داخل یکی از موضوع‌ها (نه در All) بفرستید.',
  renameUnknown: '{e.warn} این موضوع به یک لینک قدیمی یا حذف‌شده تعلق دارد و قابل تغییر نام نیست. یک موضوع فعلی را باز کنید و دوباره تلاش کنید.',
  renameFailed: '{e.warn} تغییر نام این موضوع ممکن نشد.',
  renameFailedRetry: '{e.warn} تلگرام تغییر نام را محدود کرده است. {seconds} ثانیه دیگر تلاش کنید.',
  memoPartial: '{e.warn} یادداشت ذخیره شد، اما {count} موضوع نام قبلی را حفظ کردند. مستقیماً آنجا /rename بزنید.',
  renameRights: '{e.warn} ربات به دسترسی مدیریت موضوعات در این گفتگو نیاز دارد. از ادمین بخواهید آن را بدهد و دوباره تلاش کنید.',
  renameTaken: '{e.warn} این نام قبلاً برای موضوع دیگری استفاده شده. نام دیگری انتخاب کنید.',
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
  modeCleared: '{e.repeat} نشانگر حالت پاک شد. هر پیام پیش از ارسال همچنان یک بار می‌پرسد.',
  cancelled: 'لغو شد.',
  btnAnswer: '{e.answer} پاسخ',
  btnRead: '{e.eyes} خواندن',
  controlsGuide:
    '<blockquote expandable>{e.answer} پاسخ — پاسخ به همین فرستنده؛ پاسخ در موضوع لینک او نمایش داده می‌شود.\n{e.eyes} خواندن — ارسال رسید خواندن.\n{e.block} مسدود در این لینک — توقف این فرستنده فقط در این لینک.\n{e.globe} مسدود در همه لینک‌ها — توقف این فرستنده در همه لینک‌ها.\n\nمسدودکردن پیام‌های بعدی این فرستنده را پنهان می‌کند. از همین دکمه‌ها می‌توانید رفع مسدودی کنید.</blockquote>',
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
  blockedReply: '{e.block} شما این فرستنده را مسدود کرده‌اید. برای پاسخ، ابتدا رفع مسدودی کنید.',
  throttle: '{e.hourglass} خیلی سریع — کمی صبر کنید.',
  albumPartial: '{e.warn} بخشی از آلبوم حذف شده بود؛ بقیه ارسال شد.',
  deleteNotice:
    '{e.trash} لینک در دسترس نیست\n' +
    'صاحب لینک آن را حذف کرده است؛ بنابراین ربات همه داده‌های ذخیره‌شده مربوط به آن را پاک کرد. دیگر نمی‌توانید از این لینک پیام بفرستید یا به کسی پاسخ دهید. تاریخچه گفتگو در تلگرام باقی می‌ماند.',
  topicDeleted:
    '{e.trash} این موضوع بسته شده است\n' +
    'لینک حذف شده و ربات همه داده‌های ذخیره‌شده مربوط به آن را پاک کرده است. دیگر نمی‌توانید در این موضوع پیام بفرستید یا به کسی پاسخ دهید. تاریخچه همین گفتگو در تلگرام باقی می‌ماند.',
  topicClosed:
    '{e.cross} موضوع بسته شد\n' +
    'لینک حذف شده و ربات داده‌های ذخیره‌شده آن را پاک کرده است. این موضوع دیگر پیام یا پاسخ نمی‌پذیرد. تاریخچه گفتگو در تلگرام باقی می‌ماند.',
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
