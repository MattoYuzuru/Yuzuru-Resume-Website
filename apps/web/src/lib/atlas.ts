import manifest from '../../public/art/atlas/manifest.json';
import { choosePostcard, rememberPostcard } from './atlas-selection';
import { createGlyphGPU, type GlyphGPU } from './atlas-gpu';
import ru from '../i18n/ru.json';
import en from '../i18n/en.json';
import { formatCoordinates } from './minimal-routes';
import { AtlasWaves } from './atlas-waves';
const STORAGE='keykomi.postcards.lru.v1';
const DETAIL='432';
export function mountAtlas(root: HTMLElement,initiallyCalm: boolean) {
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!;
  const surface=root.querySelector<HTMLButtonElement>('[data-ripple]')!;
  const source=root.querySelector<HTMLSourceElement>('source')!;
  const original=root.querySelector<HTMLImageElement>('[data-original]')!;
  const select=document.querySelector<HTMLSelectElement>('select[data-place-select]');
  const controller=new AbortController();const {signal}=controller;
  const gallery=root.dataset.mode==='gallery';
  const params=new URL(location.href).searchParams;
  const ids=manifest.map(place=>place.id);
  const nav=navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const lowPower=nav.connection?.saveData || (nav.deviceMemory??8)<=2 || (navigator.hardwareConcurrency||8)<=2;
  let calm=initiallyCalm||reduced.matches,current=manifest[0]!;
  let view=gallery&&params.get('view')==='photo'?'photo':'ascii';
  let destroyed=false,visible=true,ready=false,loading=0,frame=0;
  let quality=(navigator.hardwareConcurrency||8)<=4?1:1.5;
  let gpu:GlyphGPU|undefined,images:[HTMLImageElement,HTMLImageElement]|undefined;
  let pointer:[number,number]=[-10000,-10000],target:[number,number]=[-10000,-10000];
  let hover=0,targetHover=0,movementEnd=0,lastFrame=0,pendingInput=0,perfPublished=0;
  const waves=new AtlasWaves();
  const intervals:number[]=[],costs:number[]=[],latencies:number[]=[];
  let recent:string[]=[];
  root.dataset.instance=crypto.randomUUID();root.dataset.renderer='photographic-glyphs';root.dataset.alphabet='mixed';
  root.dataset.detail='maximum';root.dataset.effect='grey';
  try{const value:unknown=JSON.parse(localStorage.getItem(STORAGE)??'[]');if(Array.isArray(value))recent=value.filter((id):id is string=>typeof id==='string'&&ids.includes(id));}catch{/* Optional storage. */}
  function persist(){
    if(!gallery)return;
    const url=new URL(location.href);for(const key of ['alphabet','zoom','size','palette'])url.searchParams.delete(key);
    url.searchParams.set('place',current.id);url.searchParams.set('view',view);history.replaceState(history.state,'',url);
  }
  function caption(){
    const locale=document.documentElement.lang==='en'?'en':'ru';
    root.querySelector('[data-place-name]')!.textContent=current.name[locale];root.querySelector('[data-place-location]')!.textContent=current.location[locale];
    const credit=root.querySelector<HTMLAnchorElement>('[data-source]')!;credit.href=current.source.page;credit.textContent=current.source.author;
    const license=root.querySelector<HTMLAnchorElement>('[data-license]')!;license.href=current.source.licenseUrl||current.source.page;license.textContent=current.source.license;
    root.querySelector('[data-source-title]')!.textContent=current.source.file;
    document.querySelector('[data-coordinates]')!.textContent=formatCoordinates(current.coordinates.latitude,current.coordinates.longitude);
    document.querySelectorAll<HTMLImageElement>('[data-reference-image]').forEach(el=>{el.alt=current.name[locale];});
    const variant=current.variants[DETAIL];
    document.querySelectorAll('[data-cell-count]').forEach(el=>{el.textContent=new Intl.NumberFormat(locale).format(variant.occupiedCells);});
    document.querySelectorAll('[data-glyph-count]').forEach(el=>{el.textContent=String(variant.usedCharacters);});
    root.dataset.cells=String(variant.occupiedCells);root.dataset.grid=`${variant.columns}×${variant.rows}`;if(select)select.value=current.id;
  }
  function diagnostics(){
    const percentile=(values:number[],q:number)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)]!.toFixed(2):null;
    root.dataset.performance=JSON.stringify({frames:costs.length,submitP95:percentile(costs,.95),intervalP50:percentile(intervals,.5),intervalP95:percentile(intervals,.95),inputP95:percentile(latencies,.95),drawCallsPerFrame:Number(root.dataset.waves)>0?2:1,glyphLoopsPerFrame:0});
  }
  function paint(now:number){
    frame=0;if(destroyed||!ready||!gpu||document.hidden||!visible||view!=='ascii')return;
    const dt=lastFrame?Math.min(50,now-lastFrame):16;
    const follow=1-Math.exp(-dt/70),fade=1-Math.exp(-dt/(targetHover?110:230));
    pointer[0]+=(target[0]-pointer[0])*follow;pointer[1]+=(target[1]-pointer[1])*follow;
    hover=calm?0:hover+(targetHover-hover)*fade;
    const live=waves.sample(now);root.dataset.waves=String(live.length/4);
    const started=performance.now();gpu.paint(pointer,hover,now,live);
    costs.push(performance.now()-started);if(costs.length>240)costs.shift();
    if(lastFrame&&now-lastFrame<150)intervals.push(now-lastFrame);lastFrame=now;if(intervals.length>240)intervals.shift();
    if(pendingInput){latencies.push(Math.max(0,performance.now()-pendingInput));pendingInput=0;if(latencies.length>80)latencies.shift();}
    root.dataset.frameMs=costs[costs.length-1]!.toFixed(2);
    if(intervals.length>=65&&intervals.reduce((sum,value)=>sum+value,0)>2000){
      const median=[...intervals].sort((a,b)=>a-b)[Math.floor(intervals.length/2)]!;
      if(median>24){if(quality>1){quality=1;resize();}else{gpu.destroy();gpu=undefined;ready=false;delete root.dataset.ready;root.dataset.backend='poster';}intervals.length=0;}
    }
    const activeWaves=!calm&&now<waves.end;
    root.dataset.effect=activeWaves?'waves':hover>.005?'hover':'grey';
    const settling=Math.abs(hover-targetHover)>.002||Math.hypot(target[0]-pointer[0],target[1]-pointer[1])>.3;
    if(!calm&&(activeWaves||settling||now<movementEnd))frame=requestAnimationFrame(paint);
    else{lastFrame=0;if(now-perfPublished>500){diagnostics();perfPublished=now;}}
  }
  function wake(inputTime=0){if(inputTime)pendingInput=inputTime;if(!frame&&!destroyed&&ready&&visible&&!document.hidden)frame=requestAnimationFrame(paint);}
  function resize(){const rect=surface.getBoundingClientRect();if(rect.width>0){gpu?.resize(rect.width,rect.height,quality);wake();}}
  function setView(){
    root.dataset.view=view;surface.disabled=view==='photo';if(view==='photo')original.src=current.original;
    document.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===view)));
    if(view==='photo'){cancelAnimationFrame(frame);frame=0;lastFrame=0;}else wake();persist();
  }
  async function show(id:string,announce=true){
    const entry=manifest.find(place=>place.id===id);if(!entry||destroyed)return;const request=++loading;
    try{
      const next=gpu?[new Image(),new Image()] as [HTMLImageElement,HTMLImageElement]:undefined;
      if(next){next[0].src=entry.variants[DETAIL].texture;next[1].src=entry.variants[DETAIL].color;await Promise.all(next.map(image=>image.decode()));}
      if(destroyed||request!==loading)return;
      images=next;current=entry;source.srcset=entry.poster;root.dataset.place=entry.id;delete root.dataset.error;
      waves.clear();
      document.querySelectorAll<HTMLImageElement>('[data-reference-image]').forEach(el=>{el.src=entry.original;});
      if(gpu&&images){gpu.upload(...images);ready=true;resize();root.dataset.ready='true';root.dataset.backend='webgl2';}else root.dataset.backend='poster';
      caption();setView();persist();root.dataset.selected='true';document.querySelector<HTMLElement>('[data-coordinates]')!.dataset.selected='true';
      if(!gallery){recent=rememberPostcard(entry.id,ids,recent);try{localStorage.setItem(STORAGE,JSON.stringify(recent));}catch{/* Optional. */}}
      if(announce)root.querySelector('[data-art-status]')!.textContent=entry.name[document.documentElement.lang==='en'?'en':'ru'];
    }catch{
      if(destroyed||request!==loading)return;if(select)select.value=current.id;root.dataset.error='true';
      root.querySelector('[data-art-status]')!.textContent=document.documentElement.lang==='en'?en.minimal.loadingError:ru.minimal.loadingError;
    }
  }
  surface.addEventListener('pointermove',event=>{
    if(calm||event.pointerType==='touch')return;const rect=surface.getBoundingClientRect();target=[event.clientX-rect.left,event.clientY-rect.top];
    if(!targetHover&&hover<.01)pointer=[...target];targetHover=1;movementEnd=performance.now()+550;wake(event.timeStamp);
  },{signal,passive:true});
  surface.addEventListener('pointerleave',()=>{targetHover=0;movementEnd=performance.now()+750;wake();},{signal});
  surface.addEventListener('click',event=>{
    if(calm)return;const rect=surface.getBoundingClientRect(),now=performance.now();
    const x=event.detail?(event.clientX-rect.left)/rect.width:.5,y=event.detail?(event.clientY-rect.top)/rect.height:.5;
    waves.add(x,y,now);root.dataset.waveToken=String(now);wake(event.timeStamp);
  },{signal});
  select?.addEventListener('change',()=>void show(select.value),{signal});
  document.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(el=>el.addEventListener('click',()=>{view=el.dataset.view==='photo'?'photo':'ascii';setView();},{signal}));
  document.addEventListener('localechange',()=>{caption();root.querySelector('[data-art-status]')!.textContent='';},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;lastFrame=0;}else wake();},{signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);frame=0;ready=false;gpu=undefined;delete root.dataset.ready;root.dataset.backend='poster';},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{void startGPU();},{signal});
  const observer=new IntersectionObserver(entries=>{visible=entries[0]!.isIntersecting;if(!visible){cancelAnimationFrame(frame);frame=0;lastFrame=0;}else wake();});observer.observe(root);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(surface);
  async function startGPU(){const next=lowPower?undefined:await createGlyphGPU(canvas);if(destroyed){next?.destroy();return;}gpu=next;if(images&&gpu){gpu.upload(...images);ready=true;root.dataset.ready='true';root.dataset.backend='webgl2';resize();}}
  root.dataset.motion=calm?'still':'interactive';
  const requested=gallery?params.get('place'):root.dataset.selection,initial=requested&&ids.includes(requested)?requested:gallery?ids[0]!:choosePostcard(ids,recent)!;
  // Chosen once per document, including mobile → desktop remounts. No default-poster flash.
  root.dataset.selection=initial;
  void startGPU().then(()=>show(initial,false));
  return{
    setCalm(value:boolean){calm=value||reduced.matches;root.dataset.motion=calm?'still':'interactive';hover=0;targetHover=0;movementEnd=0;waves.clear();cancelAnimationFrame(frame);frame=0;wake();},
    destroy(){destroyed=true;loading++;controller.abort();observer.disconnect();resizeObserver.disconnect();cancelAnimationFrame(frame);gpu?.destroy();delete root.dataset.ready;delete root.dataset.instance;canvas.width=0;images=undefined;},
  };
}
