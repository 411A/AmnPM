import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as render from '../tgcloud/lib/render.js';
import { t } from '../tgcloud/lib/i18n.js';
import { BUILD } from '../tgcloud/lib/build.js';

const COMMANDS = ['/start', '/newlink', '/settings', '/rename', '/help', '/privacy', '/about'];

test('welcome explains the bot and modes without listing commands', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.welcome(lang);
    assert.match(text, /AmnPM/);
    assert.match(text, /newlink/);
    assert.match(text, /👽/);
    assert.match(text, /😶‍🌫️/);
    assert.match(text, /😎/);
    assert.doesNotMatch(text, /<blockquote>[0-9a-f]{64}<\/blockquote>/);
    assert.match(text, /matches source|unverified release/);
    assert.ok(text.split('\n').length <= 20, text);
  }
});

test('help lists every command once in the required order inside collapsed details', () => {
  for (const lang of ['en', 'fa']) {
    const text = t(lang, 'help');
    const positions = COMMANDS.map((command) => text.indexOf(command));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, lang);
    const commands = text.match(/<details><summary><b>[^<]+<\/b><\/summary>([\s\S]*?)<\/details>/)?.[1] ?? '';
    for (const command of COMMANDS) {
      assert.equal(commands.split('\n').filter((line) => line.includes(command)).length, 1, `${lang}: ${command}`);
    }
    assert.match(text, /<details><summary>/);
    assert.doesNotMatch(text, /<details open>/);
  }
});

test('button screens include a collapsed guide', () => {
  for (const lang of ['en', 'fa']) {
    for (const key of ['homeTitle', 'linksTitle', 'linkMenuTitle', 'linkGuide', 'chooseMode', 'controlsGuide', 'modesTitle', 'revokeConfirm']) {
      assert.match(t(lang, key), /<blockquote expandable>[\s\S]*<\/blockquote>/, `${lang}:${key}`);
    }
  }
});

test('mode keyboard only shows enabled modes', () => {
  const callbacks = { anon: 'M|a', history: 'H|a', forward: 'F|a' };
  const keyboard = render.modeKeyboard('en', callbacks, 'history', ['history', 'forward']);
  assert.deepEqual(keyboard.inline_keyboard.map((row) => row[0].callback_data), ['H|a', 'F|a']);
  assert.match(keyboard.inline_keyboard[0][0].text, /✓$/);
});

test('about uses a rich table for bot and source', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.about(lang);
    assert.match(text, /AmnPM<\/b><br>/, text);
    assert.match(text, /running code matches source<\/a><br>/, text);
    assert.match(text, /<table bordered striped compact>/, text);
    assert.match(text, /<th align="center">/);
    assert.match(text, /<td align="center" valign="middle">/);
    assert.match(text, /@AmnPMBot/);
    assert.match(text, /GitHub/);
    assert.doesNotMatch(text, /<blockquote>/);
  }
});

test('link intro puts the note on its own line and the link in its own block', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.linkIntro(lang, 'https://t.me/bot?start=amber_fox_k7m2p', 'work');
    assert.match(text, /📝 <b>work<\/b>/);
    assert.match(text, /\n\n<code>https:\/\/t\.me\/bot\?start=amber_fox_k7m2p<\/code>\n\n/);
    assert.match(text, /<blockquote expandable>/);
    assert.ok(text.split('\n').length <= 13, text);
  }
});

test('verification says the running code matches source without printing the hash', () => {
  const previousVerified = BUILD.verified;
  const previousRelease = BUILD.release;
  const hash = BUILD.bundleHash;
  assert.ok(hash);

  BUILD.verified = false;
  BUILD.release = 'dev';
  let text = render.verifyLine();
  assert.match(text, /unverified/);
  assert.match(text, /https:\/\/github\.com\/411A\/AmnPM\/releases"/);
  assert.equal(text.includes(hash), false);

  BUILD.verified = true;
  BUILD.release = 'v1.0.0';
  text = render.verifyLine();
  assert.match(text, /running code matches source/);
  assert.match(text, /releases\/tag\/v1\.0\.0/);
  assert.equal(text.includes(hash), false);

  BUILD.verified = previousVerified;
  BUILD.release = previousRelease;
});
