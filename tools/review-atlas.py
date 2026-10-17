#!/usr/bin/env python3
"""Render local contact sheets for human source and glyph review; no external uploads."""
import argparse,json,math,textwrap
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
from atlas import ROOT,CACHE,CONTENT,PUBLIC
parser=argparse.ArgumentParser();parser.add_argument('--posters',action='store_true');args=parser.parse_args()
selected=json.loads((CONTENT/'selections.json').read_text());out=ROOT/'.artifacts/atlas/review';out.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype(str(ROOT/'tools/fonts/IBMPlexMono-Regular.ttf'),12)
for index in range(0,len(selected),36):
 entries=selected[index:index+36];sheet=Image.new('RGB',(1500,6*225),(248,248,242));draw=ImageDraw.Draw(sheet)
 for j,entry in enumerate(entries):
  path=PUBLIC/(entry['id']+'-poster-v4.webp') if args.posters else CACHE/(entry['id']+'.jpg')
  if not path.exists():continue
  photo=ImageOps.contain(Image.open(path).convert('RGB'),(240,180));x=(j%6)*250;y=(j//6)*225
  sheet.paste(photo,(x+(240-photo.width)//2,y+(180-photo.height)//2))
  label=f"{entry.get('sourceRow','owner')}: {entry['name']['en']}"
  draw.multiline_text((x+4,y+182),'\n'.join(textwrap.wrap(label,29)[:3]),font=font,fill=(48,54,48),spacing=2)
 p=out/f"{'glyphs' if args.posters else 'photos'}-{index//36+1:02}.jpg";sheet.save(p,quality=90);print(p)
