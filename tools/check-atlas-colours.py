"""Read-only fidelity check: stored cell colours must equal the source photograph."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[1]
public = ROOT / 'apps/web/public'
entries = json.loads((public / 'art/atlas/manifest.json').read_text())
selections = {entry['id']: entry for entry in json.loads((ROOT / 'content/atlas/selections.json').read_text())}
report = []
for entry in entries:
    photo = Image.open(ROOT / f'.artifacts/atlas/sources/{entry["id"]}.jpg').convert('RGB')
    crop = selections[entry['id']].get('crop', [0, 0, 1, 1])
    photo = photo.crop(tuple(round(v * (photo.width if i % 2 == 0 else photo.height)) for i, v in enumerate(crop)))
    field = entry['variants']['432']
    size = (field['columns'] * 9, field['rows'] * 18)
    fitted = ImageOps.contain(photo, size, Image.Resampling.LANCZOS)
    sheet = Image.new('RGB', size, 'white')
    sheet.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    expected = sheet.resize((432, 162), Image.Resampling.BOX)
    actual = Image.open(public / field['color'].lstrip('/')).convert('RGB')
    assert actual.size == (432, 162), entry['id']
    error = max(high for low, high in ImageChops.difference(expected, actual).getextrema())
    assert error == 0, f'{entry["id"]}: original colours were altered (max channel error {error})'
    assert Image.open(public / field['texture'].lstrip('/')).size == size, entry['id']
    report.append({'place': entry['id'], 'maxRGBError': error})
print(f'{len(report)}/{len(entries)} photographic colour fields match exactly; glyph mask geometry passed.')
