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

test('verification renders both states', () => {
  const previous = BUILD.verified;
  const release = BUILD.release;
  BUILD.verified = false;
  assert.match(render.verifyLine(), /unverified/);
  BUILD.verified = true;
  BUILD.release = 'v1.0.0';
  assert.match(render.verifyLine(), /verified · v1\.0\.0/);
  BUILD.verified = previous;
  BUILD.release = release;
});
