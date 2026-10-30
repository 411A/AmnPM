import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as render from '../tgcloud/lib/render.js';
import { BUILD } from '../tgcloud/lib/build.js';

test('welcome stays within five lines in both languages', () => {
  for (const lang of ['en', 'fa']) {
    const text = render.welcome(lang);
    assert.ok(text.split('\n').length <= 5, text);
    assert.match(text, /http/);
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
  assert.match(text, new RegExp(`<code>${hash}</code>`));

  BUILD.verified = true;
  BUILD.release = 'v1.0.0';
  text = render.verifyLine();
  assert.match(text, /verified/);
  assert.match(text, /releases\/tag\/v1\.0\.0/);
  assert.match(text, new RegExp(`<code>${hash}</code>`));

  BUILD.verified = previousVerified;
  BUILD.release = previousRelease;
});
