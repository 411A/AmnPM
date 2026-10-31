// Production handler benchmark. Uses the management API's /run endpoint, which
// executes the local sources on the platform and returns server-side time.
// Usage: node tools/bench-cloud.mjs --scenario start --n 20 --concurrency 5
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const credentials = JSON.parse(readFileSync(join(root, '.tgcloud', 'credentials'), 'utf8'));
const token = credentials.token;
const appId = token.split(':')[0];
const base = process.env.TG_CLOUD_API_URL || 'https://cloud.telegram.org';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const scenario = args.scenario ?? (args.module ? 'custom' : 'start');
const count = Math.max(1, Number(args.n ?? 10));
const concurrency = Math.max(1, Number(args.concurrency ?? 3));
const customArgs = args.args ? JSON.parse(args.args) : null;
const customCtx = args.ctx ? JSON.parse(args.ctx) : null;

function sources() {
  const out = {};
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js')) {
        out[relative(root, path).split(sep).slice(1).join('/').replace(/\.js$/, '')] = readFileSync(path, 'utf8');
      }
    }
  })(join(root, 'tgcloud'));
  return out;
}

const allSources = sources();

function payload(i) {
  const chat = 930000000 + i;
  if (args.module) {
    return { module: args.module, args: customArgs ?? {} };
  }
  if (scenario === 'start') {
    return { module: 'handlers/message', args: {
      message_id: i + 1,
      date: 0,
      chat: { id: chat, type: 'private' },
      from: { id: chat, first_name: 'Bench', language_code: 'en', is_bot: false },
      text: '/start',
    } };
  }
  if (scenario === 'newlink') {
    return { module: 'handlers/message', args: {
      message_id: i + 1,
      date: 0,
      chat: { id: chat, type: 'private' },
      from: { id: chat, first_name: 'Bench', language_code: 'en', is_bot: false },
      text: `/newlink bench-${i}`,
    } };
  }
  if (['help', 'about', 'privacy', 'settings'].includes(scenario)) {
    return { module: 'handlers/message', args: {
      message_id: i + 1,
      date: 0,
      chat: { id: chat, type: 'private' },
      from: { id: chat, first_name: 'Bench', language_code: 'en', is_bot: false },
      text: `/${scenario}`,
    } };
  }
  if (scenario.startsWith('menu-')) {
    const data = {
      'menu-home': 'm:home',
      'menu-help': 'm:help',
      'menu-about': 'm:about',
    }[scenario];
    if (!data) throw new Error(`unknown scenario: ${scenario}`);
    return { module: 'handlers/callback_query', args: {
      id: `bench-${i}`,
      from: { id: chat, first_name: 'Bench', language_code: 'en' },
      message: { message_id: 900000 + i, chat: { id: chat, type: 'private' } },
      data,
    } };
  }
  throw new Error(`unknown scenario: ${scenario}`);
}

async function invoke(i) {
  const { module, args: input } = payload(i);
  const body = JSON.stringify({
    module,
    sources: allSources,
    args: input,
    ctx: customCtx ?? { update: { update_id: i + 1 } },
  });
  const started = performance.now();
  const res = await fetch(`${base}/${appId}/manage/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  const rtt = performance.now() - started;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`invalid response (HTTP ${res.status})`);
  }
  if (!res.ok || !json.ok) {
    throw new Error(`${json.description ?? `HTTP ${res.status}`}${json.parameters?.module ? ` (${json.parameters.module})` : ''}`);
  }
  return {
    serverMs: json.result?.time == null ? null : Math.round(json.result.time * 1000),
    rttMs: Math.round(rtt),
  };
}

function percentile(rows, q) {
  return rows[Math.min(rows.length - 1, Math.floor(rows.length * q))];
}

async function main() {
  const results = [];
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < count) {
      const i = next;
      next += 1;
      try {
        results.push(await invoke(i));
      } catch (err) {
        failures.push(String(err?.message ?? err));
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const server = results.map((row) => row.serverMs).filter((value) => value != null).sort((a, b) => a - b);
  const rtt = results.map((row) => row.rttMs).sort((a, b) => a - b);
  const summary = (rows) => rows.length ? {
    n: rows.length,
    min: rows[0],
    p50: percentile(rows, 0.5),
    p95: percentile(rows, 0.95),
    p99: percentile(rows, 0.99),
    max: rows.at(-1),
  } : null;

  console.log(JSON.stringify({
    scenario,
    concurrency,
    requested: count,
    ok: results.length,
    failed: failures.length,
    failures: failures.slice(0, 5),
    serverMs: summary(server),
    clientRttMs: summary(rtt),
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
