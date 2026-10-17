import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Check the emitted HTML, including first paint before the client script starts.
for (const [path, locale, heading] of [
  ['', 'en', 'hire me.'], ['en/', 'en', 'hire me.'], ['ru/', 'ru', 'го на созвон.'],
  ['art/', 'en', 'Photograph to characters'], ['en/art/', 'en', 'Photograph to characters'],
  ['ru/art/', 'ru', 'Из фото в символы'],
]) {
  const html = await readFile(new URL(`../apps/web/dist/${path}index.html`, import.meta.url), 'utf8');
  assert.match(html, new RegExp(`<html lang="${locale}"`), `${path}: document language`);
  const title = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]*>/g, '').trim();
  assert.equal(title, heading, `${path}: first-paint heading language`);
  const source = html.match(/<source\b[^>]*>/)?.[0];
  assert.ok(source && !source.includes('srcset'), `${path}: no intermediate photograph before client selection`);
  assert.match(html, /<span class="footer-location" data-coordinates><\/span>/, `${path}: no intermediate coordinates`);
  assert.ok(!html.includes('data-prev') && !html.includes('data-next') && !html.includes('class="calm-button"'));
  if (!path.includes('art')) {
    assert.ok(html.includes(`Matvei-Riabushkin-CV-${locale.toUpperCase()}.pdf`));
    assert.ok(!html.includes('class="alamo-note"') && !html.includes('class="footer-actions"'));
  }
}
console.log('6 static entry points: initial language, CV downloads and removed controls passed.');
