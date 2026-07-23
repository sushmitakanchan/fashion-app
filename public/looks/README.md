# Landing board photos

The "Let your style speak" board on the landing page (`src/app/page.tsx`) pulls
its photo tiles from this folder. Drop replacements here with the **exact same
filenames** — no code change needed. Portrait 4:5 crops look best (they're
rendered `object-cover` in a 4/5 tile); a square graphic like `club.png` sets
`fit: "contain"` + a matched `surface` in the `board` array so it shows whole,
never cropped.

| File           | Tile     | Look                                                        |
| -------------- | -------- | ---------------------------------------------------------- |
| `ootd.png`     | OOTD     | OOTD flat-lay — "this is what I'm wearing" iMessage styling  |
| `vacation.png` | Vacation | Vacation look — open suitcase packed for the beach            |
| `casual.png`   | Casual   | Casual look — "what's in my cart" flat-lay on red            |
| `club.png`     | Styleclub | "Doing My Best Club" graphic — shown whole on cream         |
| `journey.png`  | GRWM      | AURA "your style journey starts now" promo — full-bleed     |

If you save a file with a different extension (e.g. `.png`, `.webp`), update the
matching `src` in the `board` array in `src/app/page.tsx`.
