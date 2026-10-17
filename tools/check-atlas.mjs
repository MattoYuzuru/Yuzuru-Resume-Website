import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async name => JSON.parse(await readFile(`${root}${name}`, 'utf8'));
const catalogue = await read('content/atlas/catalogue.json');
const selections = await read('content/atlas/selections.json');
const manifest = await read('apps/web/public/art/atlas/manifest.json');
const lock = await read('content/atlas/source-lock.json');
const acquisition = await read('content/atlas/acquisition-report.json');
assert.equal(acquisition.rows.length, catalogue.places.length, 'Every workbook row needs an acquisition outcome');
assert.equal(new Set(acquisition.rows.map(row => row.row)).size, catalogue.places.length);
for (const row of acquisition.rows) {
  if ([158,159,161].includes(row.row)) {
    assert.equal(row.status, 'not-a-place', 'Owner-approved exclusions must remain explicit');
  } else {
    assert.ok(['ready','acquired'].includes(row.status), `Unresolved workbook row ${row.row}`);
    assert.ok(selections.some(place => place.sourceRow === row.row && place.id === row.id));
  }
}
assert.equal(new Set(catalogue.places.map(place => place.id)).size, catalogue.places.length);
assert.equal(manifest.length, selections.length, 'Every selected work must be prepared');
assert.equal(new Set(manifest.map(place => place.id)).size, manifest.length);
for (const place of manifest) {
  const selected = selections.find(entry => entry.id === place.id);
  assert.deepEqual(place.coordinates, selected.coordinates, `${place.id}: coordinate metadata drift`);
  assert.ok(Number.isFinite(place.coordinates.latitude) && Math.abs(place.coordinates.latitude) <= 90);
  assert.ok(Number.isFinite(place.coordinates.longitude) && Math.abs(place.coordinates.longitude) <= 180);
  assert.match(place.coordinates.source, /^https:\/\/((en|es)\.wikipedia\.org\/api\/rest_v1\/page\/summary\/|www\.wikidata\.org\/wiki\/Special:EntityData\/|www\.japan47go\.travel\/ja\/detail\/|www\.atollsofmaldives\.gov\.mv\/atolls\/|commons\.wikimedia\.org\/wiki\/File:)/);
  for (const locale of ['ru', 'en']) { assert.ok(place.name[locale]); assert.ok(place.location[locale]); }
  assert.ok(place.source.author && place.source.license && place.source.changes);
  assert.ok(place.source.author.length <= 120 && !place.source.author.includes('\n'), 'Author credit must be concise');
  assert.match(place.source.page, /^https:\/\/commons\.wikimedia\.org\//);
  assert.match(place.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(lock[place.id].sha256, place.source.sha256);
  if (place.origin === 'catalogue') {
    assert.ok(catalogue.places.some(row => row.id === place.catalogueId && row.sourceRow === place.sourceRow));
  }
  for (const asset of ['poster', 'fallback']) {
    assert.match(place[asset], /^\/art\/atlas\/[a-z-]+-poster-v4\.webp$/);
    const size = (await stat(`${root}apps/web/public${place[asset]}`)).size;
    assert.ok(size > 0 && size <= 60_000, `${place.id}: ${asset} budget exceeded`);
  }
  assert.equal(place.renderer, 'mixed-font-glyphs-v4');
  assert.match(place.original, /^\/art\/atlas\/[a-z-]+-original\.webp$/);
  assert.ok((await stat(`${root}apps/web/public${place.original}`)).size < 600_000);
  const payload = await readFile(`${root}apps/web/public${place.glyphs}`);
  assert.ok(gzipSync(payload).length < 250_000, `${place.id}: glyph payload budget exceeded`);
  const glyphs = JSON.parse(payload);
  assert.equal(glyphs.version, 4);
  assert.equal(glyphs.alphabet,Array.from({length:95},(_,i)=>String.fromCharCode(i+32)).join(''));
  assert.equal(glyphs.defaultVariant,'432');
  assert.equal(Object.keys(glyphs.variants).length, 1);
  for (const [key, variant] of Object.entries(glyphs.variants)) {
    assert.equal(variant.characters.length, variant.columns * variant.rows, `${place.id}/${key}: wrong cell count`);
    assert.match(variant.characters, /^[\x20-\x7e]+$/, 'Artwork must contain actual printable ASCII characters');
    assert.equal(variant.tone.length, variant.characters.length * 2);
    assert.equal(place.variants[key].texture,variant.texture);
    assert.equal(variant.columns,432);
    assert.equal(place.variants[key].color,variant.color);
    assert.ok((await stat(`${root}apps/web/public${variant.color}`)).size < 250_000, `${place.id}: photographic colours budget exceeded`);
    assert.equal(variant.occupiedCells,variant.characters.replaceAll(' ', '').length);
    assert.equal(place.variants[key].occupiedCells,variant.occupiedCells);
    assert.equal(place.variants[key].usedCharacters,variant.usedCharacters);
    assert.match(variant.tone,/^[0-9a-f]+$/);
    assert.ok((await stat(`${root}apps/web/public${variant.texture}`)).size < 1_400_000, `${place.id}/${key}: texture budget exceeded`);
    assert.match(variant.characters, /[A-Za-z]/); assert.match(variant.characters, /[0-9]/); assert.match(variant.characters, /[|/\\_+<>=-]/);
    assert.equal(variant.columns / variant.rows, 8/3);
    assert.deepEqual([place.width,place.height],[960,720]);
    assert.equal(variant.usedCharacters, new Set(variant.characters.replaceAll(' ', '')).size);
    assert.ok(variant.usedCharacters >= 30, `${place.id}/${key}: degenerate alphabet`);
    const ratio = variant.columns * glyphs.cellWidth / (variant.rows * glyphs.cellHeight);
    assert.ok(Math.abs(ratio / (place.width/place.height) - 1) < .035, `${place.id}/${key}: distorted image proportions`);
  }
}
console.log(`${catalogue.places.length} catalogue places; ${manifest.length} photographs at maximum detail, with separate glyph masks and photographic colours. Actual ASCII, cell geometry, references, translations, attribution and budgets passed.`);
