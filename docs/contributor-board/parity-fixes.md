# Contributor Board — visual parity fixes

After the first PR merged, a side-by-side of the live boards (e.g. holke.xyz's
"Hypercerts Documentation" and "atproto" boards) against hyperboards.org showed
the render was **not** at parity: no background image, opaque white card tiles,
and a long tail of empty boxes. Root-caused against the real on-chain board data
(captured with a headless browser) and fixed.

## Root causes (from the actual board records)

- **`backgroundImage` is stored as a bare URL string** in hyperboards-v2 (e.g.
  `"https://…/photo.jpg"`), not a `uri`/`smallImage` union. `boardImageUrl` only
  handled the union → the background never rendered. Now returns a bare string
  as-is. Types widened to `BoardImage | string`.
- **`backgroundOpacity` is a `0–1` value, often a string** (`"0.55"`). The code
  only accepted a number in `0–100` → it fell back to `0.15`. Now normalises any
  of number/string × 0–1/0–100 to a 0–1 fraction (background layer + settings).

## Visual parity changes

- **Tiles are transparent** over the board background (translucent mosaic, like
  hyperboards), not opaque `--bg-elevated` cards; subtle theme-aware hover tint.
- **Avatars get an explicit wrapper size and scale with the tile**, so a heavy
  contributor gets a big medallion and the long tail still shows small faces
  (down to ~14px) instead of empty cells. Fixes the prior `img{width:100%}` /
  unsized-wrapper bug that let large-tile images balloon.

## Verified

Built locally and screenshotted the same two boards (4-contributor and
98-contributor) — both now render the background photo with translucent
weighted tiles and consistent circular avatars, matching hyperboards.org.
tsc/lint/build clean; 703 unit tests pass (added `boardImageUrl` bare-string
coverage; updated `tileSizing` thresholds).
