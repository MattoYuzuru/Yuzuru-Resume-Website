#!/usr/bin/env python3
"""Acquire explicitly mapped catalogue subjects; never silently substitute unrelated imagery."""
import concurrent.futures
import hashlib
import html
import json
import re
import unicodedata
import urllib.parse
import time
from pathlib import Path
from atlas import ROOT, CONTENT, CACHE, fetch, write_json

COUNTRIES={'Китай (САР)':'Hong Kong','Япония':'Japan','Германия':'Germany','Грузия':'Georgia','Россия':'Russia','Испания':'Spain','Чехия':'Czechia','Австрия':'Austria','Венгрия':'Hungary','Мальдивы':'Maldives','Южная Корея':'South Korea','Китай':'China','Азербайджан':'Azerbaijan'}
CITIES={'Гонконг':'Hong Kong','Токио':'Tokyo','Эносима':'Fujisawa','Камакура':'Kamakura','Мюнхен':'Munich','Тбилиси':'Tbilisi','Москва':'Moscow','Санкт-Петербург':'Saint Petersburg','Майорка':'Mallorca','Менорка':'Menorca','Гран-Канария':'Gran Canaria','Барселона':'Barcelona','Мадрид':'Madrid','Кастилия и Леон':'Castile and León','Тенерифе':'Tenerife','Бенидорм':'Benidorm','Саламанка':'Salamanca','Прага':'Prague','Вена':'Vienna','Будапешт':'Budapest','Сеул':'Seoul','Пусан':'Busan','Чеджу':'Jeju','Хайнань':'Hainan','Пекин':'Beijing','Севилья':'Seville','Гранада':'Granada','Валенсия':'Valencia','Баку':'Baku'}
NON_PLACES={158:'Unnamed house reef; an island or reef name is required to identify a real subject.',159:'Unnamed sandbank or island; no specific geographical subject in the workbook.',161:'Sunset cruise / dolphin watching is an activity, not an identified landmark.'}
META=ROOT/'.artifacts/atlas/discovery'
META.mkdir(parents=True,exist_ok=True)
CACHE.mkdir(parents=True,exist_ok=True)

def api(url):
    key=hashlib.sha256(url.encode()).hexdigest()
    p=META/(key+'.json')
    if p.exists():return json.loads(p.read_text())
    time.sleep(.8)
    data=json.loads(fetch(url));write_json(p,data);return data

def commons_details(filename):
    # Public file descriptions are cached by Commons. Avoid expensive extmetadata API requests.
    page='https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(filename.replace(' ','_'))
    cached=META/(hashlib.sha256(page.encode()).hexdigest()+'.html')
    if cached.exists():text=cached.read_text()
    else:
        time.sleep(.8);text=fetch(page).decode();cached.write_text(text)
    text=html.unescape(text)
    clean=lambda value:re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',re.sub(r'<(style|script)\b[^>]*>.*?</\1>','',value,flags=re.S))).strip()
    author=re.search(r'<span\b[^>]*id="creator"[^>]*>(.*?)</span>',text,re.S)
    if not author:author=re.search(r'id="fileinfotpl_aut"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>',text,re.S)
    shorts=re.findall(r'<span\b[^>]*class="licensetpl_short"[^>]*>(.*?)</span>',text,re.S)
    links=re.findall(r'<span\b[^>]*class="licensetpl_link"[^>]*>(.*?)</span>',text,re.S)
    chosen=next((i for i,value in enumerate(shorts) if re.search(r'CC(?:-| )BY|CC0|Public domain|PDM|FAL|Free Art|KOGL Type 1',clean(value),re.I)),None)
    image=re.search(r'<div\b[^>]*class="fullImageLink"[^>]*>.*?<img\b[^>]*src="([^"]+)"',text,re.S)
    if not image:raise ValueError('No full photograph on the Commons description page')
    return {'descriptionurl':page,'thumburl':image.group(1),'author':clean(author.group(1)) if author else '',
        'license':clean(shorts[chosen]) if chosen is not None else '',
        'licenseUrl':clean(links[chosen]) if chosen is not None and chosen<len(links) else page}

def acquire(entry):
    identifier=entry['id'];wiki=entry['wiki']
    summary_url='https://'+entry.get('wikiLang','en')+'.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(wiki)
    if entry.get('coordinates') and entry.get('commons'):
        coords=entry['coordinates'];summary_url=coords['source']
        summary={'title':entry.get('displayName',wiki),'coordinates':{'lat':coords['latitude'],'lon':coords['longitude']}}
    elif entry.get('wikidata'):
        entity_url='https://www.wikidata.org/wiki/Special:EntityData/'+entry['wikidata']+'.json'
        entity=api(entity_url)['entities'][entry['wikidata']]
        claim=entity.get('claims',{}).get('P625',[{}])[0].get('mainsnak',{}).get('datavalue',{}).get('value',{})
        summary={'title':entity.get('labels',{}).get('en',{}).get('value',wiki),'coordinates':{'lat':claim['latitude'],'lon':claim['longitude']} if 'latitude' in claim else None,'wikibase_item':entry['wikidata']}
        summary_url=entity_url
    else:summary=api(summary_url)
    if summary.get('type')=='disambiguation':raise ValueError('Disambiguation page; choose a specific subject')
    coordinates=summary.get('coordinates');coordinate_source=summary_url
    image=summary.get('originalimage',{}).get('source')
    if image and '/wikipedia/en/' in image:image=None
    if image and re.search(r'\.svg(?:[/?]|$)',image,re.I):image=None
    if not coordinates and summary.get('wikibase_item'):
        coordinate_source='https://www.wikidata.org/wiki/Special:EntityData/'+summary['wikibase_item']+'.json'
        entity=api(coordinate_source)['entities'][summary['wikibase_item']]
        claim=entity.get('claims',{}).get('P625',[{}])[0].get('mainsnak',{}).get('datavalue',{}).get('value',{})
        if 'latitude' in claim:coordinates={'lat':claim['latitude'],'lon':claim['longitude']}
    if not coordinates:raise ValueError('No verified landmark coordinates')
    filename=entry.get('commons')
    if not image and not filename and summary.get('wikibase_item'):
        data=api('https://www.wikidata.org/wiki/Special:EntityData/'+summary['wikibase_item']+'.json')['entities'][summary['wikibase_item']]
        filename=data.get('claims',{}).get('P18',[{}])[0].get('mainsnak',{}).get('datavalue',{}).get('value')
    if not image and not filename:raise ValueError('No lead photograph; explicit Commons source required')
    if not filename:
        image_path=urllib.parse.urlparse(image).path
        filename=urllib.parse.unquote(image_path.split('/thumb/')[-1].split('/')[2] if '/thumb/' in image_path else image_path.rsplit('/',1)[-1])
    if not re.search(r'\.(jpg|jpeg|png|webp)$',filename,re.I):raise ValueError('Lead image is not a raster photograph: '+filename)
    cached_meta=CACHE/(identifier+'.json');cached_photo=CACHE/(identifier+'.jpg')
    same_source=cached_meta.exists() and json.loads(cached_meta.read_text())['file'].replace('_',' ')==filename.replace('_',' ')
    if same_source and cached_photo.exists():
        meta=json.loads(cached_meta.read_text())
        if hashlib.sha256(cached_photo.read_bytes()).hexdigest()!=meta['sha256']:raise ValueError('Cached hash changed')
    else:
        detail=commons_details(filename)
        author=entry.get('credit') or detail['author'];licence=detail['license']
        if not author or len(author)>120:raise ValueError('Author credit needs review: '+author[:400])
        if not re.search(r'CC(?:-| )BY|CC0|Public domain|PDM|FAL|Free Art|KOGL Type 1',licence,re.I) or re.search(r'NC|ND',licence):raise ValueError('Licence needs review: '+licence)
        download=detail.get('thumburl') or detail.get('url')
        if not download:raise ValueError('No Commons photograph with metadata')
        payload=fetch(download)
        from PIL import Image
        import io
        photo=Image.open(io.BytesIO(payload));photo.verify()
        meta={'page':detail['descriptionurl'],'download':download,'author':author,'license':licence,'licenseUrl':detail['licenseUrl'],'retrieved':'2026-10-17','file':filename,'sha256':hashlib.sha256(payload).hexdigest(),'changes':'Photograph cropped/resized and converted to a mixed ASCII glyph field; tonal adaptation and photographic colour reveal. Derivative retains source licence.'}
        if cached_photo.exists() and cached_meta.exists():
            import shutil
            old=json.loads(cached_meta.read_text());history=ROOT/'.artifacts/atlas/history/source-review';history.mkdir(parents=True,exist_ok=True)
            prefix=identifier+'-'+old['sha256'][:12]
            shutil.copyfile(cached_photo,history/(prefix+'.jpg'));shutil.copyfile(cached_meta,history/(prefix+'.json'))
        cached_photo.write_bytes(payload);write_json(cached_meta,meta)
    entry.update({'commons':filename,'name':{'ru':entry['name']['ru'],'en':entry.get('displayName') or summary.get('title',wiki).replace('_',' ')},'coordinates':{**entry.get('coordinates',{}),'latitude':coordinates['lat'],'longitude':coordinates['lon'],'source':coordinate_source}})
    return entry,meta

def main(cached_only=False):
    catalogue=json.loads((CONTENT/'catalogue.json').read_text())['places']
    selected=json.loads((CONTENT/'selections.json').read_text())
    lock=json.loads((CONTENT/'source-lock.json').read_text())
    existing={p.get('sourceRow'):p for p in selected}
    mapped={int(row):wiki for row,wiki in (line.split('\t') for line in (CONTENT/'expansion.tsv').read_text().splitlines() if line.strip())}
    overrides=json.loads((CONTENT/'source-overrides.json').read_text())
    candidates=[];report=[]
    for place in catalogue:
        row=place['sourceRow']
        override=overrides.get(str(row),{})
        replacement=row in existing and override.get('commons') and override['commons'].replace('_',' ')!=existing[row].get('commons','').replace('_',' ')
        if row in existing and not replacement:report.append({'row':row,'status':'ready','id':existing[row]['id']});continue
        if row in NON_PLACES:report.append({'row':row,'status':'not-a-place','reason':NON_PLACES[row]});continue
        if row not in mapped:report.append({'row':row,'status':'missing-mapping'});continue
        wiki=mapped[row];slug=unicodedata.normalize('NFKD',wiki).encode('ascii','ignore').decode().lower();slug=re.sub('[^a-z]+','-',slug).strip('-')
        destination=place['destination'].split(' — ')[0]
        entry={'id':'landmark-'+slug,'wiki':wiki,'name':{'ru':place['name'],'en':wiki.replace('_',' ')},'location':{'ru':', '.join(dict.fromkeys([destination,place['country']])),'en':', '.join(dict.fromkeys(filter(None,[CITIES.get(destination),COUNTRIES[place['country']]])))},'origin':'catalogue','catalogueId':place['id'],'sourceRow':row}
        if row in existing:entry['id']=existing[row]['id']
        entry.update(override)
        candidates.append(entry)
    if cached_only:
        pending=[entry for entry in candidates if not (CACHE/(entry['id']+'.json')).exists()]
        report.extend({'row':entry['sourceRow'],'status':'pending-acquisition'} for entry in pending)
        candidates=[entry for entry in candidates if entry not in pending]
    completed=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        jobs={pool.submit(acquire,e):e for e in candidates}
        for job in concurrent.futures.as_completed(jobs):
            entry=jobs[job];completed+=1
            try:
                ready,meta=job.result();selected=[p for p in selected if p['id']!=ready['id']];selected.append(ready);lock[ready['id']]=meta;report.append({'row':ready['sourceRow'],'id':ready['id'],'status':'acquired'})
            except Exception as error:report.append({'row':entry['sourceRow'],'status':'needs-review','wiki':entry['wiki'],'reason':str(error)});print('REVIEW',entry['sourceRow'],str(error)[:180],flush=True)
            if completed%20==0:print(f'Fetched {completed}/{len(candidates)} candidates',flush=True)
    selected.sort(key=lambda e:e.get('sourceRow',0));report.sort(key=lambda e:e['row'])
    write_json(CONTENT/'selections.json',selected);write_json(CONTENT/'source-lock.json',lock);write_json(CONTENT/'acquisition-report.json',{'catalogueRows':len(catalogue),'selected':len(selected),'rows':report})
    print('Acquired selection count',len(selected),'; review',sum(r['status']=='needs-review' for r in report),flush=True)

if __name__=='__main__':
    import sys
    main('--cached-only' in sys.argv)
