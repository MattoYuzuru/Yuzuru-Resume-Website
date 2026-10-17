"""Compile real photographs into dense, mixed, measured font-glyph fields."""
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

CELL_WIDTH, CELL_HEIGHT, FONT_SIZE, BASELINE = 9, 18, 14, 14
COLS = (432,)
ALPHABET = ''.join(chr(code) for code in range(32, 127))
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16 - .5


def glyph_features(font):
    masks = []
    for char in ALPHABET:
        mask = Image.new('L', (CELL_WIDTH, CELL_HEIGHT), 0)
        ImageDraw.Draw(mask).text((0, BASELINE), char, font=font, fill=255, stroke_width=1, anchor='ls')
        masks.append(np.asarray(mask))
    masks = np.stack(masks)
    tiles = masks.astype(np.float32).reshape(len(ALPHABET), 3, 6, 3, 3).mean(axis=(2, 4)).reshape(len(ALPHABET), 9) / 255
    return masks, tiles, tiles.mean(axis=1)


def convert(photo, features, columns):
    # The sheet is always 4:3. Contain preserves the photographed subject and its proportions.
    rows = columns * 3 // 8
    size = (columns * CELL_WIDTH, rows * CELL_HEIGHT)
    sheet = Image.new('RGB', size, 'white')
    fitted = ImageOps.contain(photo, size, Image.Resampling.LANCZOS)
    sheet.paste(fitted, ((size[0]-fitted.width)//2, (size[1]-fitted.height)//2))
    grey = ImageOps.autocontrast(sheet.convert('L'), cutoff=.6)
    grey = ImageEnhance.Contrast(grey).enhance(1.18)
    grey = grey.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=3))
    pixels = (1 - np.asarray(grey, dtype=np.float32) / 255) ** .85
    patches = pixels.reshape(rows, CELL_HEIGHT, columns, CELL_WIDTH).transpose(0, 2, 1, 3)
    tiles = patches.reshape(rows, columns, 3, 6, 3, 3).mean(axis=(3, 5)).reshape(-1, 9)
    masks, glyph_tiles, coverage = features
    target = tiles * float(coverage.max())
    ys, xs = np.indices((rows, columns))
    means = target.mean(axis=1) + BAYER[ys % 4, xs % 4].reshape(-1) * .014
    delta = target - target.mean(axis=1, keepdims=True)
    glyph_delta = glyph_tiles - coverage[:, None]
    indices = np.zeros(len(tiles), dtype=np.uint8)
    # Bounded batches keep the offline matcher below a full cells×alphabet×features tensor.
    for start in range(0, len(tiles), 2048):
        end = min(start + 2048, len(tiles))
        cost = 5 * (means[start:end, None] - coverage[None, :]) ** 2
        cost += .35 * ((delta[start:end, None, :] - glyph_delta[None, :, :]) ** 2).mean(axis=2)
        seeds = (xs.reshape(-1, 1)[start:end] * 73856093) ^ (ys.reshape(-1, 1)[start:end] * 19349663) ^ (np.arange(len(ALPHABET))[None, :] * 83492791)
        seeds = (seeds ^ (seeds >> 13)) * 1274126177
        seeds = ((seeds ^ (seeds >> 16)) & 65535) / 65535
        cost += seeds * .006
        indices[start:end] = cost.argmin(axis=1)
    # Empty margins and photographic whites stay paper; the image is never used as an underlay.
    darkness = pixels.reshape(rows, CELL_HEIGHT, columns, CELL_WIDTH).mean(axis=(1, 3))
    indices[darkness.reshape(-1) < .018] = 0
    flat = ''.join(ALPHABET[int(index)] for index in indices)
    tone = np.round(np.clip(.65 + .35 * darkness ** .65, 0, 1) * 31).astype(np.uint8)
    colors = np.asarray(sheet.resize((columns, rows), Image.Resampling.BOX), dtype=np.uint8)
    alpha = masks[indices].astype(np.uint16) * (tone.reshape(-1, 1, 1).astype(np.uint16) * 255 // 31) // 255
    alpha = alpha.reshape(rows, columns, CELL_HEIGHT, CELL_WIDTH).transpose(0, 2, 1, 3).reshape(size[1], size[0]).astype(np.uint8)
    texture = Image.new('RGBA', size, (255, 255, 255, 0))
    texture.putalpha(Image.fromarray(alpha, 'L'))
    source_color = Image.fromarray(colors, 'RGB')
    return {
        'columns': columns, 'rows': rows, 'characters': flat, 'tone': tone.tobytes().hex(),
        'usedCharacters': len(set(flat) - {' '}), 'occupiedCells': len(flat) - flat.count(' '),
    }, texture, source_color


def compile_art(photo, font_path, output, identifier):
    output = Path(output)
    features = glyph_features(ImageFont.truetype(str(font_path), FONT_SIZE))
    variants = {}
    default_texture = None
    for columns in COLS:
        variant, texture, source_color = convert(photo, features, columns)
        path = output / f'{identifier}-{columns}-mask-v4.webp'
        texture.save(path, lossless=True, method=4, exact=True)
        variant['texture'] = f'/art/atlas/{path.name}'
        color_path = output / f'{identifier}-{columns}-color-v4.webp'
        source_color.save(color_path, lossless=True, method=4, exact=True)
        variant['color'] = f'/art/atlas/{color_path.name}'
        variants[str(columns)] = variant
        if columns == 432:
            default_texture = texture
    payload = {
        'version': 4, 'cellWidth': CELL_WIDTH, 'cellHeight': CELL_HEIGHT,
        'fontSize': FONT_SIZE, 'baseline': BASELINE, 'alphabet': ALPHABET,
        'font': 'IBM Plex Mono', 'defaultVariant': '432', 'variants': variants,
    }
    (output / f'{identifier}-glyphs.json').write_text(json.dumps(payload, ensure_ascii=True, separators=(',', ':')) + '\n')
    ImageOps.contain(photo, (1200, 1200), Image.Resampling.LANCZOS).save(output / f'{identifier}-original.webp', quality=90, method=6)
    alpha = default_texture.getchannel('A')
    poster = Image.new('RGB', default_texture.size, (248, 248, 242))
    poster.paste((36, 46, 61), mask=alpha)
    full_poster = poster
    for preview_width in [960, 720, 560, 480]:
        poster = full_poster.resize((preview_width, preview_width*3//4), Image.Resampling.LANCZOS)
        for quality in [82, 65, 48, 32]:
            buffer = io.BytesIO()
            poster.save(buffer, format='WEBP', quality=quality, method=4)
            if buffer.tell() <= 60_000:
                break
        if buffer.tell() <= 60_000:
            break
    if buffer.tell() > 60_000:
        raise ValueError('Poster exceeds its 60 KB budget')
    (output / f'{identifier}-poster-v4.webp').write_bytes(buffer.getvalue())
    return {
        'glyphs': f'/art/atlas/{identifier}-glyphs.json', 'original': f'/art/atlas/{identifier}-original.webp',
        'width': 960, 'height': 720, 'poster': f'/art/atlas/{identifier}-poster-v4.webp',
        'fallback': f'/art/atlas/{identifier}-poster-v4.webp', 'renderer': 'mixed-font-glyphs-v4',
        'variants': {key: {k: value for k, value in item.items() if k not in ('characters', 'tone')} for key, item in variants.items()},
    }


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('photo', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--font', type=Path, required=True)
    parser.add_argument('--id', default='preview')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    print(compile_art(Image.open(args.photo).convert('RGB'), args.font, args.output, args.id))
