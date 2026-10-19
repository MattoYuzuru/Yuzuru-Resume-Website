import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, '.artifacts/resume-qa'); await mkdir(dir, {recursive:true});
const source = JSON.parse(await readFile(path.join(root,'resume/examples/engineer.json'),'utf8'));
const run = (exe,args,success=true) => { const r=spawnSync(exe,args,{cwd:root,encoding:'utf8'}); if(r.error)throw r.error; if(success&&r.status!==0)throw new Error(r.stderr); if(!success)assert.notEqual(r.status,0); return r; };
const build = (file, success=true) => run(process.execPath,['tools/build-resume.mjs','--source',file,'--out-dir',dir],success);
const hashes = async () => Promise.all(['apps/web/public/cv.pdf','apps/web/public/en/cv.pdf'].map(async p=>createHash('sha256').update(await readFile(path.join(root,p))).digest('hex')));
const before = await hashes();
await writeFile(path.join(dir,'short.json'),JSON.stringify(source)); build(path.join(dir,'short.json'));
for(const lang of ['ru','en']) { const pdf=path.join(dir,`example-cv-${lang}.pdf`); assert.match(run('pdfinfo',[pdf]).stdout,/Pages:\s+1\b/); assert.ok(run('pdftotext',[pdf,'-']).stdout.includes('#, _, [')); }
const long = structuredClone(source); long.pdf.filename='long-cv'; long.pdf.max_pages=2; long.experience=[];
for(let i=0;i<8;i++)long.experience.push({company:`Example Studio ${i+1}`,role:{ru:'Разработчик программных систем',en:'Software Engineer'},dates:'2020 - 2026',bullets:Array.from({length:4},(_,n)=>({ru:`Запись ${i+1}.${n+1}: пример длинного описания проекта, работы с данными, тестирования и выпуска изменений без выдуманных личных достижений.`,en:`Entry ${i+1}.${n+1}: a long structural example covering data, testing and delivery without invented personal achievements. Each entry also covers design reviews, operational handover and verification of the delivered change.`}))});
await writeFile(path.join(dir,'long.json'),JSON.stringify(long)); build(path.join(dir,'long.json'));
for(const lang of ['ru','en']) { const pdf=path.join(dir,`long-cv-${lang}.pdf`); assert.match(run('pdfinfo',[pdf]).stdout,/Pages:\s+2\b/); assert.ok(run('pdftotext',[pdf,'-']).stdout.includes('8.4')); }
long.pdf.max_pages=1; await writeFile(path.join(dir,'over-budget.json'),JSON.stringify(long)); const failed=build(path.join(dir,'over-budget.json'),false);assert.match(failed.stderr,/budget is 1/);
assert.deepEqual(await hashes(),before);
console.log('Different names, optional sections, literal punctuation, both languages, 1/2-page layouts, overflow refusal and unchanged public PDFs passed.');
