import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const dist = new URL('../apps/web/dist/', import.meta.url);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding:'utf8'}).trim();
const files = {};
async function walk(relative = '') {
  for (const entry of (await readdir(new URL(relative, dist), {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative,entry.name);
    if (name === 'release-manifest.json') continue;
    if (entry.isSymbolicLink()) throw new Error('Release cannot contain symlinks');
    if (entry.isDirectory()) await walk(name + '/');
    else files[name] = createHash('sha256').update(await readFile(new URL(name, dist))).digest('hex');
  }
}
await walk();
for (const name of ['index.html','ru/index.html','cv.pdf','en/cv.pdf','favicon.svg','art/atlas/manifest.json']) if (!files[name]) throw new Error(`Missing ${name}`);
await writeFile(new URL('release-manifest.json', dist),JSON.stringify({revision,files},null,2)+'\n');
console.log(`Prepared ${revision}: ${Object.keys(files).length} files`);
