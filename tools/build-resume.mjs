import { readFile, writeFile, mkdir, copyFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateResume, assertPublishTarget, DEFAULT_THEME } from './resume-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const canonical = path.join(root, 'content/resume/resume.yaml');
const options = { source: canonical, output: path.join(root, 'output/pdf'), theme: DEFAULT_THEME, lang: 'both', publish: false };
const args = process.argv.slice(2).filter(arg => arg !== '--');
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--publish') options.publish = true;
  else if (key === '--no-publish') options.publish = false;
  else if (['--source', '--out-dir', '--theme', '--lang'].includes(key)) {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    const field = { '--source': 'source', '--out-dir': 'output', '--theme': 'theme', '--lang': 'lang' }[key];
    options[field] = ['source', 'output'].includes(field) ? path.resolve(value) : value;
  } else throw new Error(`Unknown option: ${key}`);
}
if (!['white', 'paper'].includes(options.theme)) throw new Error('--theme must be white or paper');
if (!['both', 'ru', 'en'].includes(options.lang)) throw new Error('--lang must be both, ru or en');
const locales = options.lang === 'both' ? ['ru', 'en'] : [options.lang];
if (options.publish) assertPublishTarget({ ...options, canonical, locales });
const source = await readFile(options.source, 'utf8');
let data;
if (path.extname(options.source) === '.json') data = JSON.parse(source);
else {
  const require = createRequire(path.join(root, 'apps/web/package.json'));
  const { parse } = require('yaml');
  data = parse(source);
}
validateResume(data, locales);
const run = (command, argv) => {
  const result = spawnSync(command, argv, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} failed:\n${result.stderr}`);
  if (result.stderr.trim()) process.stderr.write(result.stderr);
  return result.stdout;
};
await mkdir(path.join(root, 'resume/data'), { recursive: true });
const staging = await mkdtemp(path.join(root, 'resume/data/build-'));
const input = path.join(staging, 'resume.json');
await writeFile(input, JSON.stringify(data, null, 2) + '\n');
const maxPages = data.pdf?.max_pages ?? 1;
const base = data.pdf?.filename ?? 'cv';
const results = [];
try {
  for (const lang of locales) {
    const filename = `${base}-${lang}${options.theme === DEFAULT_THEME ? '' : `-${options.theme}`}.pdf`;
    const output = path.join(staging, filename);
    run('typst', ['compile', '--root', root, '--font-path', path.join(root, 'resume/fonts'), '--creation-timestamp', '1792368000', '--input', `lang=${lang}`, '--input', `theme=${options.theme}`, '--input', `source=${path.relative(path.join(root, 'resume'), input)}`, path.join(root, 'resume/main.typ'), output]);
    const info = run('pdfinfo', [output]);
    const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
    if (!pages || pages > maxPages) throw new Error(`${lang}: ${pages} pages; budget is ${maxPages}. Edit content or explicitly raise pdf.max_pages; the template does not shrink text.`);
    const text = run('pdftotext', [output, '-']);
    const name = typeof data.basics.name === 'string' ? data.basics.name : data.basics.name[lang];
    if (!text.includes(name) || text.includes('\uFFFD')) throw new Error(`${lang}: extracted text is incomplete or contains replacement characters`);
    results.push({ lang, filename, output, pages });
  }
  await mkdir(options.output, { recursive: true });
  for (const result of results) {
    const destination = path.join(options.output, result.filename);
    await copyFile(result.output, destination);
    console.log(`Built ${result.lang.toUpperCase()} (${options.theme}): ${result.pages} page(s) → ${destination}`);
  }
  if (options.publish) {
    for (const result of results) {
      const destination = path.join(root, result.lang === 'ru' ? 'apps/web/public/cv.pdf' : 'apps/web/public/en/cv.pdf');
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(result.output, `${destination}.next`);
      await rename(`${destination}.next`, destination);
    }
    console.log('Updated both website PDFs. Deployment is a separate step.');
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
