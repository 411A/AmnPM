import { api, InputFile } from 'sdk';
import { BUILD } from './build.js';
import { CONFIG } from './config.js';
import { t } from './i18n.js';

const REPO = CONFIG.repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');

function localTime(lang, date) {
  const utc = `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  if (lang !== 'fa') return utc;
  try {
    return `${new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Tehran',
    }).format(date)} · ${utc}`;
  } catch {
    return utc;
  }
}

export function validatorFileName(build = BUILD) {
  const commit = String(build.commit ?? 'local').slice(0, 7);
  return `amnpm-validator-${commit}.js`;
}

export function buildValidatorScript(build = BUILD, now = new Date()) {
  const target = {
    repo: REPO,
    commit: String(build.commit ?? 'local'),
    bundleHash: String(build.bundleHash ?? ''),
    files: Array.isArray(build.files) ? build.files : [],
  };
  return `// AmnPM source validator
// Generated: ${now.toISOString()}
// Checks the public GitHub source at the pinned commit against the embedded
// bundle hash and file list. It cannot inspect the running server.
'use strict';

const TARGET = ${JSON.stringify(target)};
const apiUrl = 'https://api.github.com/repos/' + TARGET.repo;
const rawUrl = 'https://raw.githubusercontent.com/' + TARGET.repo + '/' + TARGET.commit + '/tgcloud/';

async function fetchChecked(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'amnpm-source-validator' },
  });
  if (!response.ok) {
    throw new Error(response.status + ' ' + response.statusText + ': ' + url);
  }
  return response;
}

async function main() {
  const { createHash } = await import('node:crypto');
  if (typeof fetch !== 'function') {
    throw new Error('Node 18 or newer is required');
  }
  if (!TARGET.files.length) {
    throw new Error('this validator was generated without a file list; update the bot');
  }

  const commit = await (await fetchChecked(apiUrl + '/commits/' + TARGET.commit)).json();
  const tree = await (await fetchChecked(
    apiUrl + '/git/trees/' + commit.commit.tree.sha + '?recursive=1',
  )).json();
  if (tree.truncated) throw new Error('GitHub tree is truncated');

  const remote = tree.tree
    .filter((entry) => entry.type === 'blob'
      && entry.path.startsWith('tgcloud/')
      && entry.path.endsWith('.js')
      && entry.path !== 'tgcloud/lib/build.js'
      && entry.path !== 'tgcloud/lib/secret.js')
    .map((entry) => entry.path.slice('tgcloud/'.length))
    .sort();
  const expected = [...TARGET.files].sort();
  const missing = expected.filter((file) => !remote.includes(file));
  const extra = remote.filter((file) => !expected.includes(file));

  const hash = createHash('sha256');
  for (const file of TARGET.files) {
    const response = await fetchChecked(
      rawUrl + file.split('/').map(encodeURIComponent).join('/'),
    );
    hash.update(file);
    hash.update('\\0');
    hash.update(Buffer.from(await response.arrayBuffer()));
  }
  const actual = hash.digest('hex');

  console.log('AmnPM source validator');
  console.log('commit:   ' + TARGET.commit);
  console.log('expected: ' + TARGET.bundleHash);
  console.log('actual:   ' + actual);
  if (missing.length) console.log('missing:  ' + missing.join(', '));
  if (extra.length) console.log('extra:    ' + extra.join(', '));

  if (actual !== TARGET.bundleHash || missing.length || extra.length) {
    console.log('FAIL');
    process.exitCode = 1;
    return;
  }
  console.log('PASS');
}

main().catch((error) => {
  console.error('ERROR: ' + error.message);
  process.exitCode = 2;
});
`;
}

export function validatorCaption(lang, now = new Date(), build = BUILD) {
  return t(lang, 'validatorCaption', {
    time: localTime(lang, now),
    commit: String(build.commit ?? 'local').slice(0, 12),
    hash: String(build.bundleHash ?? '').slice(0, 16),
    file: validatorFileName(build),
  });
}

export async function sendValidator(msg, lang, now = new Date()) {
  const bytes = new TextEncoder().encode(buildValidatorScript(BUILD, now));
  const document = new InputFile(bytes, validatorFileName(BUILD), {
    type: 'application/javascript',
  });
  return api.sendDocument({
    chat_id: msg.chat.id,
    document,
    caption: validatorCaption(lang, now),
    parse_mode: 'HTML',
    ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
  });
}
