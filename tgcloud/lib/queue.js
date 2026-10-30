import { api } from 'sdk';
import { CONFIG } from './config.js';
import { openJob, ownerChatId, sealAction } from './keys.js';
import * as store from './store.js';
import { ownerKeyboard } from './render.js';
import { t } from './i18n.js';

const nowSec = () => Math.floor(Date.now() / 1000);

async function send(job, payload) {
  const base = { chat_id: payload.chat_id };
  if (payload.thread_id) base.message_thread_id = payload.thread_id;

  if (job.kind === 'copy') {
    return api.copyMessages({
      ...base,
      from_chat_id: payload.from_chat_id,
      message_ids: payload.message_ids,
    });
  }
  if (job.kind === 'forward') {
    return api.forwardMessages({
      ...base,
      from_chat_id: payload.from_chat_id,
      message_ids: payload.message_ids,
    });
  }
  return api.sendMessage({
    ...base,
    text: payload.text,
    parse_mode: 'HTML',
    ...(payload.reply_to ? { reply_to_message_id: payload.reply_to } : {}),
  });
}

async function sendControls(link, payload, sent, now) {
  const owner = await store.getOwner(link.owner_key);
  const lang = owner?.lang ?? 'en';
  const blockedLink = await store.hasBlock(link.owner_key, link.id, payload.sender_key);
  const blockedAll = await store.hasBlock(link.owner_key, 0, payload.sender_key);

  const answer = await sealAction(link, 'answer', {
    link_id: link.id,
    sender_chat_id: payload.from_chat_id,
    original_id: payload.message_ids[0],
  }, now);
  const read = await sealAction(link, 'read', {
    link_id: link.id,
    sender_chat_id: payload.from_chat_id,
    message_id: payload.message_ids[0],
  }, now);
  const blockLink = await sealAction(link, 'block', {
    link_id: link.id,
    sender_key: payload.sender_key,
    scope: 'link',
  }, now);
  const blockAll = await sealAction(link, 'block', {
    link_id: link.id,
    sender_key: payload.sender_key,
    scope: 'all',
  }, now);

  const message = {
    chat_id: payload.chat_id,
    ...(payload.thread_id ? { message_thread_id: payload.thread_id } : {}),
    text: payload.header,
    parse_mode: 'HTML',
    reply_markup: ownerKeyboard({
      answer: t(lang, 'btnAnswer'),
      read: t(lang, 'btnRead'),
      blockLink: blockedLink ? t(lang, 'btnUnblockLink') : t(lang, 'btnBlockLink'),
      blockAll: blockedAll ? t(lang, 'btnUnblockAll') : t(lang, 'btnBlockAll'),
      answerData: `A|${answer.prefix}|${answer.suffix}`,
      readData: `R|${read.prefix}|${read.suffix}`,
      blockLinkData: `B|${blockLink.prefix}|${blockLink.suffix}`,
      blockAllData: `B|${blockAll.prefix}|${blockAll.suffix}`,
    }),
  };
  if (sent.length) message.reply_to_message_id = sent[sent.length - 1].message_id;
  await api.sendMessage(message);
}

async function notifyFailure(job) {
  const link = await store.getLink(job.link_id);
  if (!link) return;
  const chat = await ownerChatId(link);
  const owner = await store.getOwner(link.owner_key);
  await api.sendMessage({
    chat_id: chat,
    text: t(owner?.lang ?? 'en', 'failed'),
  });
}

export async function drain() {
  const started = Date.now();
  let sent = 0;

  for (let i = 0; i < 3; i += 1) {
    if (Date.now() - started > 3500) break;
    const job = await store.claimJob(nowSec());
    if (!job) break;

    try {
      const opened = await openJob(job);
      if (!opened) {
        await store.finishJob(job.id);
        continue;
      }
      const result = await send(job, opened.payload);
      if (Array.isArray(result) && result.length < opened.payload.message_ids.length) {
        const owner = await store.getOwner(opened.link.owner_key);
        await api.sendMessage({
          chat_id: opened.payload.chat_id,
          ...(opened.payload.thread_id ? { message_thread_id: opened.payload.thread_id } : {}),
          text: t(owner?.lang ?? 'en', 'albumPartial'),
        });
      }
      if ((job.kind === 'copy' || job.kind === 'forward') && Array.isArray(result) && result.length) {
        await sendControls(opened.link, opened.payload, result, nowSec());
      }
      await store.finishJob(job.id);
      sent += 1;
    } catch (err) {
      const attempts = job.attempts + 1;
      if (attempts >= CONFIG.maxAttempts) {
        await store.failJob(job.id);
        try {
          await notifyFailure(job);
        } catch {
          // best effort; the job is already failed
        }
      } else {
        const retryAfter = err?.parameters?.retry_after;
        const backoff = retryAfter ?? Math.min(60, 2 ** attempts);
        await store.retryJob(job.id, nowSec() + backoff);
      }
    }
  }

  return sent;
}
