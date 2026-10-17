import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { parse } = require('yaml');
const source = await readFile(path.join(root, 'content/resume/resume.yaml'), 'utf8');
if (/\bTODO\b/.test(source)) throw new Error('Unfilled resume field');
const data = parse(source);
await mkdir(path.join(root, 'resume/data'), { recursive: true });
await mkdir(path.join(root, 'output/pdf'), { recursive: true });
await mkdir(path.join(root, 'apps/web/public/en'), { recursive: true });
await writeFile(path.join(root, 'resume/data/resume.json'), JSON.stringify(data, null, 2) + '\n');
for (const lang of ['ru', 'en']) {
  const output = path.join(root, `output/pdf/matvei-riabushkin-cv-${lang}.pdf`);
  const result = spawnSync('typst', ['compile', '--root', root, '--creation-timestamp', '1792195200', '--input', `lang=${lang}`, path.join(root, 'resume/main.typ'), output], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Typst failed (${lang})`);
  const info = spawnSync('pdfinfo', [output], { encoding: 'utf8' });
  if (info.status !== 0 || !/^Pages:\s+1$/m.test(info.stdout)) throw new Error(`Expected one page (${lang})`);
  await copyFile(output, path.join(root, lang === 'ru' ? 'apps/web/public/cv.pdf' : 'apps/web/public/en/cv.pdf'));
  console.log(`Built ${lang.toUpperCase()} CV: one page`);
}
