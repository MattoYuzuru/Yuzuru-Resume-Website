# Photographs to characters

220 prepared works, based on 219 named places from the source catalogue and Neuschwanstein Castle. Three unnamed Maldives activities were excluded by the owner. Compound catalogue rows use one representative subject.

Each work contains a single 432 by 162 grid. The converter matches photo patches to measured IBM Plex Mono glyphs, using all 95 printable ASCII characters. The browser receives a cached glyph mask and a small map of the original cell colours. It does not simulate individual characters.

`source-lock.json` records source pages, authors, licences, download URLs and hashes. Every postcard links to that information. Adaptations retain the source licence. Compiled assets are checked in, so a normal site build does not download or convert photographs.

## Tools

Use Python with the packages in `tools/requirements-atlas.txt`:

```sh
python3 -m venv .venv-atlas
.venv-atlas/bin/pip install -r tools/requirements-atlas.txt
pnpm atlas:acquire
pnpm atlas:build --missing --jobs 2
pnpm atlas:review
pnpm atlas:review --posters
pnpm atlas:check
```

`expansion.tsv` maps catalogue rows to named subjects. `source-overrides.json` holds reviewed source corrections. Acquisition downloads real Commons photographs and pins their hashes. Replacement sources retain a local backup under `.artifacts/atlas/history`. Review contact sheets before accepting a new photograph.

The original XLSX and local photo cache are not in the repository. The catalogue included here keeps only place identifiers and names. Coordinates retain source URLs; three photographic viewpoints are explicitly marked as such.

The incremental build needs the cached original for a changed work. `pnpm atlas:build --only ID` can restore its pinned download and compile it. The independent colour check in `tools/check-atlas-colours.py` requires those local originals.
