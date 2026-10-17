#!/usr/bin/env python3
"""Compile a private XLSX catalogue and explicit photographic sources into static art."""
import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
import urllib.error
import time
import zipfile
import concurrent.futures
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content/atlas"
PUBLIC = ROOT / "apps/web/public/art/atlas"
CACHE = ROOT / ".artifacts/atlas/sources"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
UA = "KeykomiAtlas/1.0 (local personal portfolio; source attribution retained)"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            time.sleep(min(45, int(error.headers.get("Retry-After", "20"))))


def import_xlsx(path):
    # Read values as data. Never evaluate formulas or execute text from the workbook.
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(n.itertext()) for n in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next(s for s in workbook.findall("s:sheets/s:sheet", NS) if s.attrib["name"] == "Каталог")
        rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(r.attrib["Target"] for r in rels if r.attrib["Id"] == rel_id)
        target = target.lstrip("/") if target.startswith("/") else "xl/" + target
        rows = ET.fromstring(archive.read(target)).findall("s:sheetData/s:row", NS)
        entries = []
        keys = ["country", "destination", "area", "name", "category", "priority", "hours", "note", "visitStatus", "guide", "map"]
        for row in rows[1:]:
            record = {key: None for key in keys}
            for cell in row.findall("s:c", NS):
                col = re.match(r"[A-Z]+", cell.attrib["r"])[0]
                index = 0
                for char in col:
                    index = index * 26 + ord(char) - 64
                if index > len(keys):
                    continue
                value = cell.find("s:v", NS)
                text = value.text if value is not None else None
                if cell.attrib.get("t") == "s" and text is not None:
                    text = shared[int(text)]
                elif cell.attrib.get("t") == "inlineStr":
                    text = "".join(cell.find("s:is", NS).itertext())
                record[keys[index - 1]] = text
            if not record["name"]:
                continue
            record["id"] = "place-" + hashlib.sha256((record["country"] + "/" + record["name"]).encode()).hexdigest()[:12]
            record["sourceRow"] = int(row.attrib["r"])
            # Blank visit status is unknown, never evidence of a visit.
            entries.append(record)
    write_json(CONTENT / "catalogue.json", {"source": Path(path).name, "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(), "places": entries})
    print(f"Imported {len(entries)} places, {len(set(p['destination'] for p in entries))} destinations; input unchanged.")


def prepare(only=None):
    from PIL import Image
    from ascii_renderer import compile_art
    selections = json.loads((CONTENT / "selections.json").read_text())
    if only and not any(entry["id"] == only for entry in selections):
        raise SystemExit(f"Unknown selected place: {only}")
    lock_path = CONTENT / "source-lock.json"
    locked = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    CACHE.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    font_path = ROOT / "tools/fonts/IBMPlexMono-Regular.ttf"
    if not font_path.exists():
        font_path.parent.mkdir(parents=True, exist_ok=True)
        font_path.write_bytes(fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf"))
    manifest, errors = [], []
    for entry in selections:
        if only and entry["id"] != only:
            continue
        try:
            meta_path = CACHE / (entry["id"] + ".json")
            image_path = CACHE / (entry["id"] + ".jpg")
            if entry["id"] in locked and not image_path.exists():
                meta = locked[entry["id"]]
                payload = fetch(meta["download"])
                if hashlib.sha256(payload).hexdigest() != meta["sha256"]:
                    raise ValueError("Pinned photo changed; review before updating source-lock.json")
                image_path.write_bytes(payload)
                write_json(meta_path, meta)
            if not meta_path.exists() or not image_path.exists():
                filename = entry.get("commons")
                if not filename:
                    summary = json.loads(fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(entry["wiki"])))
                    original = summary.get("originalimage", {}).get("source") or summary["thumbnail"]["source"]
                    url = re.sub(r"/\d+px-", "/960px-", original).split("?")[0]
                    if "/thumb/" not in url:
                        url = re.sub(r"/\d+px-", "/960px-", summary["thumbnail"]["source"].split("?")[0])
                    filename = urllib.parse.unquote(url.split("/thumb/")[-1].split("/")[2])
                api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata|url", "iiurlwidth": 960, "titles": "File:" + filename})
                info = json.loads(fetch(api))
                pages = list(info["query"]["pages"].values())
                details = pages[0].get("imageinfo", [{}])[0]
                if entry.get("commons"):
                    url = details["thumburl"].split("?")[0]
                ext = details.get("extmetadata", {})
                clean = lambda key: re.sub("<[^>]*>", "", ext.get(key, {}).get("value", "")).strip()
                meta = {"page": details.get("descriptionurl", "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(filename)), "download": url, "author": clean("Artist"), "license": clean("LicenseShortName"), "licenseUrl": clean("LicenseUrl"), "retrieved": "2026-10-17", "file": filename}
                if not meta["license"] or not meta["author"]:
                    raise ValueError("Missing source attribution; explicit source metadata required")
                image_path.write_bytes(fetch(url))
                write_json(meta_path, meta)
            meta = json.loads(meta_path.read_text())
            # Some Artist fields contain prose and requests. Keep only a reviewed credit.
            meta["author"] = entry.get("credit", meta["author"])
            if len(meta["author"]) > 120 or "\n" in meta["author"]:
                raise ValueError("Review verbose Artist metadata and supply a concise credit")
            meta["sha256"] = hashlib.sha256(image_path.read_bytes()).hexdigest()
            meta["changes"] = "Photographic luminance and subcell matching against all 95 printable ASCII glyphs with strengthened strokes; fixed 4:3 sheet with preserved photo proportions, a single maximum-detail grid, tonal glyph alpha, lossless masks and unmodified photographic cell colours. Derivative retains source licence."
            locked[entry["id"]] = meta
            photo = Image.open(image_path).convert("RGB")
            crop = entry.get("crop", [0, 0, 1, 1])
            photo = photo.crop(tuple(round(v * (photo.width if i % 2 == 0 else photo.height)) for i, v in enumerate(crop)))
            compiled = compile_art(photo, font_path, PUBLIC, entry["id"])
            manifest.append({**{k:v for k,v in entry.items() if k not in ("wiki", "commons")}, **compiled, "source": meta})
            print(f"Prepared {entry['id']} ({meta['license']})", flush=True)
        except Exception as error:
            errors.append({"id": entry["id"], "error": str(error)})
            print(f"FAILED {entry['id']}: {error}", flush=True)
    if only:
        previous = json.loads((PUBLIC / "manifest.json").read_text()) if (PUBLIC / "manifest.json").exists() else []
        manifest = [p for p in previous if p["id"] != only] + manifest
    order = {entry["id"]: index for index, entry in enumerate(selections)}
    manifest.sort(key=lambda entry: order[entry["id"]])
    write_json(PUBLIC / "manifest.json", manifest)
    write_json(lock_path, locked)
    write_json(CONTENT / "build-report.json", {"ready": len(manifest), "failed": errors})
    if errors:
        raise SystemExit(1)


def compile_cached(entry):
    from PIL import Image
    from ascii_renderer import compile_art
    meta = json.loads((CACHE / (entry['id'] + '.json')).read_text())
    path = CACHE / (entry['id'] + '.jpg')
    if hashlib.sha256(path.read_bytes()).hexdigest() != meta['sha256']:
        raise ValueError('Cached source hash changed: ' + entry['id'])
    photo = Image.open(path).convert('RGB')
    crop = entry.get('crop', [0, 0, 1, 1])
    photo = photo.crop(tuple(round(v * (photo.width if i % 2 == 0 else photo.height)) for i, v in enumerate(crop)))
    compiled = compile_art(photo, ROOT / 'tools/fonts/IBMPlexMono-Regular.ttf', PUBLIC, entry['id'])
    return {**{k:v for k,v in entry.items() if k not in ('wiki', 'commons')}, **compiled, 'source': meta}


def prepare_missing(jobs):
    selections = json.loads((CONTENT / 'selections.json').read_text())
    previous = {p['id']: p for p in json.loads((PUBLIC / 'manifest.json').read_text())}
    locked = json.loads((CONTENT / 'source-lock.json').read_text())
    missing = [p for p in selections if p['id'] not in previous
               or previous[p['id']]['source']['sha256'] != locked[p['id']]['sha256']
               or previous[p['id']].get('crop', [0,0,1,1]) != p.get('crop', [0,0,1,1])]
    errors = []
    # Each process owns separate output filenames; only the parent writes the manifest.
    with concurrent.futures.ProcessPoolExecutor(max_workers=jobs) as pool:
        pending = {pool.submit(compile_cached, entry):entry for entry in missing}
        for count, future in enumerate(concurrent.futures.as_completed(pending), 1):
            entry = pending[future]
            try: previous[entry['id']] = future.result()
            except Exception as error: errors.append({'id':entry['id'], 'error':str(error)})
            if count % 10 == 0 or count == len(missing):
                print(f'Compiled {count}/{len(missing)} new glyph fields; errors {len(errors)}', flush=True)
    internal = {'wiki', 'commons', 'wikiLang', 'wikidata', 'credit', 'displayName'}
    manifest = [{**{k:v for k,v in previous[p['id']].items() if k not in internal},
                 **{k:v for k,v in p.items() if k not in internal}, 'source':locked[p['id']]}
                for p in selections if p['id'] in previous]
    write_json(PUBLIC / 'manifest.json', manifest)
    write_json(CONTENT / 'build-report.json', {'ready':len(manifest), 'failed':errors})
    if errors: raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import")
    importer.add_argument("xlsx", type=Path)
    builder = commands.add_parser("build")
    builder.add_argument("--only")
    builder.add_argument('--missing', action='store_true')
    builder.add_argument('--jobs', type=int, choices=[1, 2], default=2)
    args = parser.parse_args()
    if args.command == 'import': import_xlsx(args.xlsx)
    elif args.missing: prepare_missing(args.jobs)
    else: prepare(args.only)
