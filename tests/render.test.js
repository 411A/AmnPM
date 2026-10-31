import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as render from '../tgcloud/lib/render.js';
import { t } from '../tgcloud/lib/i18n.js';
import { BUILD } from '../tgcloud/lib/build.js';

const COMMANDS = ['/start', '/newlink', '/links', '/rename', '/help', '/privacy', '/about'];

test('welcome lists every command once in the required order', () => {
  const expected = ['🔰 /start', '🔗 /newlink', '⛓️ /links', '🏷 /rename', '📖 /help', '🔏 /privacy', 'ℹ️ /about'];
  for (const lang of ['en', 'fa']) {
    const text = render.welcome(lang);
    assert.deepEqual(text.split('\n').filter((line) => line.includes(' /')), expected);
    assert.ok(text.split('\n').length <= 13, text);
    assert.match(text, /http/);
  }
});

test('help lists every command once in the required order', () => {
  for (const lang of ['en', 'fa']) {
    const text = t(lang, 'help');
    const positions = COMMANDS.map((command) => text.indexOf(command));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, lang);
    assert.equal(
      text.split('\n').filter((line) => !line.includes('<blockquote') && COMMANDS.some((command) => line.includes(command))).length,
      7,
    );
  }
});

test('button screens include a collapsed guide', () => {
  for (const lang of ['en', 'fa']) {
    for (const key of ['homeTitle', 'linksTitle', 'linkMenuTitle', 'chooseMode', 'controlsGuide']) {
      assert.match(t(lang, key), /<blockquote expandable>[\s\S]*<\/blockquote>/, `${lang}:${key}`);
    }
  }
});

test('about stays within five lines in both languages', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.about(lang);
    assert.ok(text.split('\n').length <= 5, text);
  }
});

test('link intro stays within five lines', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.linkIntro(lang, 'https://t.me/bot?start=amber_fox_k7m2p', 'work');
    assert.ok(text.split('\n').length <= 5, text);
  }
});

test('verification renders both states with the release page and hash', () => {
  const previousVerified = BUILD.verified;
  const previousRelease = BUILD.release;
  const hash = BUILD.bundleHash;
  assert.ok(hash);

  BUILD.verified = false;
  BUILD.release = 'dev';
  let text = render.verifyLine();
  assert.match(text, /unverified/);
  assert.match(text, /https:\/\/github\.com\/411A\/AmnPM\/releases"/);
  assert.match(text, new RegExp(`<blockquote>${hash}</blockquote>`));

  BUILD.verified = true;
  BUILD.release = 'v1.0.0';
  text = render.verifyLine();
  assert.match(text, /verified/);
  assert.match(text, /releases\/tag\/v1\.0\.0/);
  assert.match(text, new RegExp(`<blockquote>${hash}</blockquote>`));

  BUILD.verified = previousVerified;
  BUILD.release = previousRelease;
});
