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
const hashes = async () => Promise.all(['apps/web/public/cv.pdf','apps/web/public/en/cv.pdf'].map(async p=>{ try { return createHash('sha256').update(await readFile(path.join(root,p))).digest('hex'); } catch(error) { if(error.code==='ENOENT')return null; throw error; } }));
const before = await hashes();
await writeFile(path.join(dir,'short.json'),JSON.stringify(source)); build(path.join(dir,'short.json'));
for(const lang of ['ru','en']) { const pdf=path.join(dir,`example-cv-${lang}.pdf`); assert.match(run('pdfinfo',[pdf]).stdout,/Pages:\s+1\b/); const text=run('pdftotext',[pdf,'-']).stdout; assert.ok(text.includes('#, _, [')); assert.ok(text.includes(lang==='ru'?'ТЕХНИЧЕСКИЕ НАВЫКИ':'TECHNICAL SKILLS'));  }
const radar = structuredClone(source);
radar.pdf = { filename: 'radar-cv', sections: ['technical_radar'], highlights: ['C++', 'Java'], content_highlights: ['0.5-0.8%'] };
radar.skills = [{category:'Backend',items:['C++','Java','JavaScript']}];
radar.assisted_skills = [{category:'Tooling',items:['Kubernetes/k3s']}];
await writeFile(path.join(dir,'radar.json'),JSON.stringify(radar)); build(path.join(dir,'radar.json'));
for (const lang of ['ru','en']) {
  const pdf = path.join(dir,`radar-cv-${lang}.pdf`);
  const text = run('pdftotext',[pdf,'-']).stdout;
  assert.ok(text.includes('C++, Java, JavaScript'));
  assert.ok(text.includes('Kubernetes/k3s'));
  assert.equal(text.split(lang==='ru'?'ТЕХНИЧЕСКИЙ РАДАР':'TECHNICAL RADAR').length,2);
  assert.match(run('pdffonts',[pdf]).stdout,/LibertinusSerif-Semibold/);
}
const long = structuredClone(source); long.pdf.filename='long-cv'; long.pdf.max_pages=2; long.experience=[];
for(let i=0;i<8;i++)long.experience.push({company:`Example Studio ${i+1}`,role:{ru:'Разработчик программных систем',en:'Software Engineer'},dates:'2020 - 2026',bullets:Array.from({length:4},(_,n)=>({ru:`Запись ${i+1}.${n+1}: пример длинного описания проекта, работы с данными, тестирования и выпуска изменений без выдуманных личных достижений.`,en:`Entry ${i+1}.${n+1}: a long structural example covering data, testing and delivery without invented personal achievements. Each entry also covers design reviews, operational handover and verification of the delivered change.`}))});
await writeFile(path.join(dir,'long.json'),JSON.stringify(long)); build(path.join(dir,'long.json'));
for(const lang of ['ru','en']) { const pdf=path.join(dir,`long-cv-${lang}.pdf`); assert.match(run('pdfinfo',[pdf]).stdout,/Pages:\s+2\b/); assert.ok(run('pdftotext',[pdf,'-']).stdout.includes('8.4')); }
long.pdf.max_pages=1; await writeFile(path.join(dir,'over-budget.json'),JSON.stringify(long)); const failed=build(path.join(dir,'over-budget.json'),false);assert.match(failed.stderr,/budget is 1/);
const single = structuredClone(source);
single.pdf = { filename: 'single-entry-cv', max_pages: 3, sections: ['experience'] };
single.experience = [{ company: 'One long engagement', role: 'Software Engineer', bullets: Array.from({length:50}, (_,i) => ({
  ru: `Пункт ${i+1}: проверяем продолжение одной длинной записи на следующих страницах, сохранность текста и отсутствие скрытого выхода за границы листа.`,
  en: `Item ${i+1}: verify that one long entry continues across pages, preserves every paragraph and never silently runs beyond the page boundaries.`
})) }];
await writeFile(path.join(dir,'single-entry.json'),JSON.stringify(single)); build(path.join(dir,'single-entry.json'));
for (const lang of ['ru','en']) {
  const pdf = path.join(dir,`single-entry-cv-${lang}.pdf`);
  const pages = Number(run('pdfinfo',[pdf]).stdout.match(/Pages:\s+(\d+)/)[1]);
  assert.ok(pages > 1 && pages <= 3, 'a long entry must flow across pages');
  assert.ok(run('pdftotext',[pdf,'-']).stdout.includes(lang==='ru'?'Пункт 50':'Item 50'));
  const bbox = run('pdftotext',['-bbox',pdf,'-']).stdout;
  for (const page of bbox.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    for (const word of page[3].matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)"/g)) {
      assert.ok(Number(word[1]) >= 0 && Number(word[2]) >= 0 && Number(word[3]) <= Number(page[1]) && Number(word[4]) <= Number(page[2]), 'text must stay within the page');
    }
  }
}
assert.deepEqual(await hashes(),before);
console.log('Different names, optional sections, literal punctuation, both languages, 1/2-page layouts, a multi-page entry, overflow refusal and unchanged public PDFs passed.');
