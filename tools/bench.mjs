// Local load harness. Runs the real handlers against the in-memory SQLite stub.
// Usage: node --import ./tests/register.mjs tools/bench.mjs [--n 200] [--db-ms 0] [--api-ms 0]
import { performance } from 'node:perf_hooks';
import { resetDb, rawDb, callsOf, api, db } from '../tests/stub-sdk.mjs';
import { applySchema } from '../tests/stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { CONFIG } from '../tgcloud/lib/config.js';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const iterations = Math.max(1, Number(args.n ?? 200));
const dbMs = Math.max(0, Number(args['db-ms'] ?? 0));
const apiMs = Math.max(0, Number(args['api-ms'] ?? 0));

// The point of this harness is raw capacity, not the abuse caps.
CONFIG.throttlePerMinute = 0;
CONFIG.deliverPerMinute = 0;
CONFIG.ownerPerMinute = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sqlCount = 0;
let apiCount = 0;
let currentSql = [];
const sqlVerbs = new Map();
const sqlShapes = new Map();
const original = { run: db.run, get: db.get, all: db.all };

function sqlText(query) {
  return typeof query === 'object' && query && 'text' in query ? query.text : String(query);
}

for (const method of ['run', 'get', 'all']) {
  db[method] = async (query) => {
    const text = sqlText(query);
    sqlCount += 1;
    const verb = text.trim().split(/\s+/, 1)[0].toUpperCase();
    sqlVerbs.set(verb, (sqlVerbs.get(verb) ?? 0) + 1);
    const shape = text.trim().replace(/\s+/g, ' ').slice(0, 110);
    sqlShapes.set(shape, (sqlShapes.get(shape) ?? 0) + 1);
    currentSql.push(shape);
    if (dbMs) await sleep(dbMs);
    return original[method](query);
  };
}

for (const key of Object.keys(api)) {
  if (typeof api[key] !== 'function') continue;
  const fn = api[key];
  api[key] = async (...callArgs) => {
    apiCount += 1;
    if (apiMs) await sleep(apiMs);
    return fn(...callArgs);
  };
}

function message(text, chatId, extra = {}) {
  return {
    message_id: extra.message_id ?? nextMessageId++,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: chatId, first_name: extra.first_name ?? 'Bench', language_code: 'en', is_bot: false },
    ...(text === undefined ? {} : { text }),
    ...extra,
  };
}

let nextMessageId = 1;
let nextCallbackId = 1;

function lastToken() {
  const sent = callsOf('sendMessage').filter((call) => String(call.args.text).includes('?start='));
  return sent.at(-1)?.args.text.match(/\?start=([0-9a-z]+)/)?.[1];
}

function lastModeData() {
  return callsOf('sendMessage')
    .flatMap((call) => call.args.reply_markup?.inline_keyboard?.flat() ?? [])
    .map((button) => button.callback_data)
    .filter((data) => data?.startsWith('M|'))
    .at(-1);
}

function senderThread() {
  return rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id DESC LIMIT 1').get()?.thread_id ?? 0;
}

async function callback(data, userId) {
  await onCallback({
    id: `bench-${nextCallbackId++}`,
    from: { id: userId, first_name: 'Bench', language_code: 'en' },
    message: { message_id: 999, chat: { id: userId } },
    data,
  });
}

const samples = [];
function record(label, elapsed, sql, api, shapes) {
  samples.push({ label, elapsed, sql, api, shapes });
}

async function timed(label, fn) {
  const t0 = performance.now();
  const s0 = sqlCount;
  const a0 = apiCount;
  currentSql = [];
  await fn();
  record(label, performance.now() - t0, sqlCount - s0, apiCount - a0, currentSql);
}

function topShapes(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const shape of row.shapes) counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function summary(label) {
  const rows = samples.filter((row) => row.label === label).map((row) => row.elapsed).sort((a, b) => a - b);
  if (!rows.length) return null;
  const pick = (q) => rows[Math.min(rows.length - 1, Math.floor(rows.length * q))];
  const total = rows.reduce((a, b) => a + b, 0);
  const all = samples.filter((row) => row.label === label);
  return {
    label,
    n: rows.length,
    avgMs: +(total / rows.length).toFixed(2),
    p50Ms: +pick(0.5).toFixed(2),
    p95Ms: +pick(0.95).toFixed(2),
    p99Ms: +pick(0.99).toFixed(2),
    minMs: +rows[0].toFixed(2),
    maxMs: +rows.at(-1).toFixed(2),
    sqlPerOp: +(all.reduce((a, b) => a + b.sql, 0) / all.length).toFixed(2),
    apiPerOp: +(all.reduce((a, b) => a + b.api, 0) / all.length).toFixed(2),
    topSql: topShapes(all),
  };
}

async function main() {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());

  // Warm-up: bootstrap config, salt, and the owner/link once.
  await onMessage(message('/start', 900000000));
  await onMessage(message('/newlink', 900000000));
  const token = lastToken();
  if (!token) throw new Error('benchmark could not create a link');

  // Warm the code paths on one sender.
  await onMessage(message(`/start ${token}`, 900000001));
  const warmThread = senderThread();
  await onMessage(message('warmup', 900000001, { message_thread_id: warmThread }));
  await callback(lastModeData(), 900000001);

  for (let i = 0; i < iterations; i += 1) {
    const sender = 910000000 + i;
    await timed('open-link', async () => {
      await onMessage(message(`/start ${token}`, sender));
    });
    const thread = senderThread();
    await timed('sender-message', async () => {
      await onMessage(message('hello', sender, { message_thread_id: thread }));
    });
    const data = lastModeData();
    await timed('mode-delivery', async () => {
      await callback(data, sender);
    });
  }

  for (let i = 0; i < iterations; i += 1) {
    const owner = 920000000 + i;
    await timed('owner-start', async () => {
      await onMessage(message('/start', owner));
    });
    await timed('owner-settings', async () => {
      await onMessage(message('/settings', owner));
    });
    await timed('owner-help', async () => {
      await onMessage(message('/help', owner));
    });
  }

  console.log(JSON.stringify({
    n: iterations,
    dbDelayMs: dbMs,
    apiDelayMs: apiMs,
    results: ['open-link', 'sender-message', 'mode-delivery', 'owner-start', 'owner-settings', 'owner-help']
      .map(summary)
      .filter(Boolean),
    sqlTotals: Object.fromEntries([...sqlVerbs.entries()].sort((a, b) => b[1] - a[1])),
    topSql: [...sqlShapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
