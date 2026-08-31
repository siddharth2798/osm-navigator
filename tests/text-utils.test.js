import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPlaceLabel, escapeHtml, isSafeHttpUrl } from '../lib/text-utils.js';

test('splitPlaceLabel splits on the first comma, trims both halves', () => {
  assert.deepEqual(splitPlaceLabel('Lulu Mall, Edapally, Kochi'), { primary: 'Lulu Mall', secondary: 'Edapally, Kochi' });
  assert.deepEqual(splitPlaceLabel('No Comma Here'), { primary: 'No Comma Here', secondary: '' });
  assert.deepEqual(splitPlaceLabel('  Padded  ,  Also Padded  '), { primary: 'Padded', secondary: 'Also Padded' });
});

test('escapeHtml escapes all five reserved characters, leaves everything else untouched', () => {
  assert.equal(escapeHtml(`<script>alert("x") & 'y'</script>`), '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
  assert.equal(escapeHtml('Plain text 123'), 'Plain text 123');
  assert.equal(escapeHtml(42), '42');
});

test('isSafeHttpUrl accepts http/https, rejects other schemes', () => {
  assert.equal(isSafeHttpUrl('https://example.com/path'), true);
  assert.equal(isSafeHttpUrl('http://example.com'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
});

test('isSafeHttpUrl: a non-absolute string resolves against the http://localhost/ fallback base (no `location` in Node), so it is NOT rejected on that basis alone — matches browser behavior against the page origin', () => {
  assert.equal(isSafeHttpUrl('not a url at all'), true);
  assert.equal(isSafeHttpUrl(''), true);
});

test('isSafeHttpUrl still rejects a non-http(s) scheme even when it could parse as relative-looking text', () => {
  assert.equal(isSafeHttpUrl('ftp://example.com/file'), false);
});
