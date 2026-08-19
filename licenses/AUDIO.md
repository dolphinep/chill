# Audio asset ledger

Every non-generated sound in `apps/web/public/audio/`, with source, licence, and the date it
was pulled in. Music is generative (Tone.js, `apps/web/src/lib/audio/generative.ts`) and owned
outright — nothing to log there.

All assets below are **CC0** (public-domain dedication — no attribution legally required).
Original files were FLAC/WAV; re-encoded to MP3 here for universal `<audio>`/`decodeAudioData`
support across browsers. Re-encoding does not change the licence.

**Prototype-only per the project plan**: fine for local dev and internal review; get Balerion
sign-off on provenance before this ships past prototype. _(Not legal advice.)_

| Local file(s) | Source | Original title | Licence | URL | Date pulled |
| --- | --- | --- | --- | --- | --- |
| `audio/ambience/wave-01.mp3` … `wave-04.mp3` | OpenGameArt.org (uploader: jasinski) | Beach Ocean Waves | CC0 | https://opengameart.org/content/beach-ocean-waves | 2026-08-09 |
| `audio/ambience/wind-loop.mp3` | OpenGameArt.org | Wind Whoosh Loop | CC0 | https://opengameart.org/content/wind-whoosh-loop | 2026-08-09 |
| `audio/footsteps/sand-01.mp3` … `sand-06.mp3` | OpenGameArt.org (uploader: Fantozzi, via freesound.org) | Fantozzi's Footsteps (Grass/Sand & Stone) — Sand L1–3/R1–3 only | CC0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | 2026-08-09 |
| `audio/birds/gull-01.mp3` … `gull-04.mp3` | OpenGameArt.org | Solo Seagull Sound Effects — "Ambient" cuts 1–4 (skipped the hit/death cuts, not relevant here) | CC0 | https://opengameart.org/content/solo-seagull-sound-effects | 2026-08-09 |
| `audio/footsteps/snow-01.mp3` … `snow-04.mp3` | OpenGameArt.org (recorded by Iwan "qubodup" Gabovitch) | 4 dry snow steps | CC0 | https://opengameart.org/content/4-dry-snow-steps | 2026-08-10 |

## Usage in the engine

- **`wind-loop`** — the non-positional ambience bed. Streamed via `MediaElementAudioSource`
  (plan calls for this specifically, so it doesn't need full decode), looped, routed through
  `ambienceBus`.
- **`wave-01..04`** — not a seamless loop (each is one wave breaking), so used as round-robin
  **positional** one-shots along the shoreline curve instead of a bed — a better fit for what
  the source recording actually is. `THREE.PositionalAudio`, HRTF panning, cap 8 concurrent.
- **`sand-01..06`** — round-robin footstep one-shots, ±8% detune per play, triggered on footfall.
  Six variants, not the plan's minimum four — more available, so used them all.
- **`gull-01..04`** — sparse, low-probability, loosely-positional one-shots for incidental life;
  not present in the original plan's example list (which said "cicadas" — cicadas fit a summer
  forest, not a Kamakura Bay dawn beach, so this substitutes a closer match to the scene).
- **`snow-01..04`** — Frostholm Ridge's footstep round-robin, same mechanism as `sand-*` but a
  different sound set per scenery (`Scenery.audio.footstepUrls`, not a hardcoded module
  constant — see `docs/engine-notes.md`'s scenery-registry writeup). The source files were
  quiet and 96kHz; re-encoded with `loudnorm` + resampled to 44.1kHz per the pack's own
  `info.txt` note, not just transcoded as-is.

## Deliberate deviation from the plan's example list

The plan's prose names "waves, wind, cicadas, footsteps" as example CC0 categories — a generic
illustration, not a fixed requirement. For Kamakura Bay (dawn, coastal, no treeline), gulls are
the better-fitting incidental wildlife sound; cicadas were dropped rather than forced in.
Frostholm Ridge (alpine, snow-bound) has no incidental wildlife sound at all for the same
reason — reused the wind bed (alpine wind is the same phenomenon as coastal wind) and skipped
gulls/cicadas both, rather than inventing a sound for wildlife the scenery has no reason to have.
