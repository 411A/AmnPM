import { api } from 'sdk';
import { CONFIG } from './config.js';
import { openJob, ownerChatId, sealActions, linkDek } from './keys.js';
import * as crypto from './crypto.js';
import * as store from './store.js';
import { recreateOwnerTopic } from './topics.js';
import { ownerKeyboard } from './render.js';
import { t } from './i18n.js';
import { userKeyFor } from './links.js';
import { CALLBACK } from './constants.js';

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

async function sendControls(link, payload, sentIds, now, blockedLink = false, blockedAll = false) {
  const lang = payload.lang ?? (await store.getOwner(link.owner_key))?.lang ?? 'en';

  const dek = await linkDek(link);
  const [answer, read, blockLink, blockAll] = await sealActions(link, [
    { kind: 'answer', payload: {
      link_id: link.id,
      sender_chat_id: payload.from_chat_id,
      sender_key: payload.sender_key,
      sender_thread_id: payload.sender_thread_id ?? 0,
      owner_thread_id: payload.thread_id ?? 0,
      conversation_id: payload.conversation_id ?? 0,
      original_id: payload.message_ids[0],
    } },
    { kind: 'read', payload: {
      link_id: link.id,
      sender_chat_id: payload.from_chat_id,
      message_id: payload.message_ids[0],
    } },
    { kind: 'block', payload: {
      link_id: link.id,
      sender_key: payload.sender_key,
      sender_chat_id: payload.from_chat_id,
      scope: 'link',
      blocked: !blockedLink,
    } },
    { kind: 'block', payload: {
      link_id: link.id,
      sender_key: payload.sender_key,
      sender_chat_id: payload.from_chat_id,
      scope: 'all',
      blocked: !blockedAll,
    } },
  ], now, CONFIG.actionTtlSeconds, dek);

  const message = {
    chat_id: payload.chat_id,
    ...(payload.thread_id ? { message_thread_id: payload.thread_id } : {}),
    text: `${payload.header}\n${t(lang, 'controlsGuide')}`,
    parse_mode: 'HTML',
    reply_markup: ownerKeyboard({
      answer: t(lang, 'btnAnswer'),
      read: t(lang, 'btnRead'),
      blockLink: blockedLink ? t(lang, 'btnUnblockLink') : t(lang, 'btnBlockLink'),
      blockAll: blockedAll ? t(lang, 'btnUnblockAll') : t(lang, 'btnBlockAll'),
      answerData: `${CALLBACK.ANSWER}${CALLBACK.SEP}${answer.prefix}${CALLBACK.SEP}${answer.suffix}`,
      readData: `${CALLBACK.READ}${CALLBACK.SEP}${read.prefix}${CALLBACK.SEP}${read.suffix}`,
      blockLinkData: `${CALLBACK.BLOCK}${CALLBACK.SEP}${blockLink.prefix}${CALLBACK.SEP}${blockLink.suffix}`,
      blockAllData: `${CALLBACK.BLOCK}${CALLBACK.SEP}${blockAll.prefix}${CALLBACK.SEP}${blockAll.suffix}`,
    }),
  };
  if (sentIds.length) message.reply_to_message_id = sentIds[sentIds.length - 1];
  await api.sendMessage(message);
}

async function notifyFailure(job) {
  const payload = job ? (await openJob(job))?.payload : null;
  const link = job ? await store.getLink(job.link_id) : null;
  if (!link || !payload?.from_chat_id) return;
  const lang = payload.sender_lang ?? 'en';
  try {
    await api.sendMessage({
      chat_id: payload.from_chat_id,
      ...(payload.sender_thread_id ? { message_thread_id: payload.sender_thread_id } : {}),
      text: t(lang, 'failed'),
    });
  } catch {
    // best effort; the job is already failed
  }
}

export async function drain(maxJobs = 3) {
  const started = Date.now();
  let sent = 0;

  for (let i = 0; i < maxJobs; i += 1) {
    if (Date.now() - started > 3500) break;
    const job = await store.claimJob(nowSec());
    if (!job) break;

    try {
      const opened = await openJob(job);
      if (!opened || opened.link.state !== 'active') {
        await store.finishJob(job.id);
        continue;
      }

      // The owner may block between enqueue and drain; re-check here so a
      // queued message does not slip through. Reuse the result for the buttons.
      let blockedLink = false;
      let blockedAll = false;
      if (opened.payload.sender_key && opened.payload.from_chat_id) {
        const globalKey = opened.payload.global_key
          ?? await userKeyFor(opened.payload.from_chat_id);
        [blockedLink, blockedAll] = await Promise.all([
          store.hasBlock(opened.link.owner_key, opened.link.id, opened.payload.sender_key),
          store.hasBlock(opened.link.owner_key, 0, globalKey),
        ]);
        if (blockedLink || blockedAll) {
          await store.finishJob(job.id);
          continue;
        }
      }

      let sentIds = job.sent_ids ? JSON.parse(job.sent_ids) : null;
      if (!sentIds) {
        let result;
        try {
          result = await send(job, opened.payload);
        } catch (err) {
          const description = String(err?.description ?? err);
          // A Telegram topic can die after creation: every write to it fails with
          // "message thread not found". Recreate the owner topic and retry once.
          if (/message thread not found/i.test(description) && opened.payload.thread_id) {
            const topic = await store.getOwnedTopicByThread(opened.link.owner_key, opened.payload.thread_id);
            // Prefer the stored row, then the mode sealed at enqueue time: a
            // forward topic with a conversation must not be reborn as history.
            const kind = topic?.kind ?? opened.payload.mode
              ?? (opened.payload.conversation_id ? 'history' : 'anon');
            const conversationId = topic?.conversation_id ?? opened.payload.conversation_id ?? 0;
            const newThread = await recreateOwnerTopic(
              opened.link,
              opened.payload.chat_id,
              kind,
              conversationId,
              nowSec(),
            );
            if (newThread) {
              opened.payload.thread_id = newThread;
              const dek = await linkDek(opened.link);
              const sealed = await crypto.encrypt(
                dek,
                JSON.stringify(opened.payload),
                `link:${opened.link.id}:job:v1`,
              );
              await store.setJobPayload(job.id, sealed.ct, sealed.nonce);
              result = await send(job, opened.payload);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
        sentIds = Array.isArray(result)
          ? result.map((message) => message.message_id)
          : (result?.message_id ? [result.message_id] : []);
        if (job.kind === 'copy' || job.kind === 'forward') {
          await store.setJobSent(job.id, JSON.stringify(sentIds));
        }
        if (Array.isArray(result) && result.length < opened.payload.message_ids.length) {
          const lang = opened.payload.lang
            ?? (await store.getOwner(opened.link.owner_key))?.lang
            ?? 'en';
          await api.sendMessage({
            chat_id: opened.payload.chat_id,
            ...(opened.payload.thread_id ? { message_thread_id: opened.payload.thread_id } : {}),
            text: t(lang, 'albumPartial'),
          });
        }
      }

      if ((job.kind === 'copy' || job.kind === 'forward') && opened.payload.conversation_id) {
        try {
          await store.setConversationLastMessage(
            opened.payload.conversation_id,
            opened.payload.message_ids[opened.payload.message_ids.length - 1],
          );
        } catch {
          // direct replies fall back to the previous target
        }
      }

      if ((job.kind === 'copy' || job.kind === 'forward') && sentIds.length) {
        await sendControls(opened.link, opened.payload, sentIds, nowSec(), blockedLink, blockedAll);
      }
      await store.finishJob(job.id);
      sent += 1;
    } catch (err) {
      const retryAfter = err?.parameters?.retry_after;
      // A 429 is backpressure, not a failed delivery. Keep the attempt budget
      // so a busy bot does not drop messages after a short rate-limit burst.
      if (retryAfter != null && Number.isFinite(Number(retryAfter))) {
        await store.deferJob(job.id, nowSec() + Math.max(1, Math.floor(Number(retryAfter))));
        continue;
      }
      const attempts = job.attempts + 1;
      if (attempts >= CONFIG.maxAttempts) {
        await store.failJob(job.id);
        try {
          await notifyFailure(job);
        } catch {
          // best effort; the job is already failed
        }
      } else {
        const backoff = Math.min(60, 2 ** attempts);
        await store.retryJob(job.id, nowSec() + backoff);
      }
    }
  }

  return sent;
}
