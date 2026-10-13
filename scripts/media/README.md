# Media pipeline (WP-03)

Builds every video and image the landing page plays or shows (spec section 11), plus
`src/content/generated/film.json`. The manifest in `src/content/media.ts` (WP-00) names
every output path and size. These scripts make files that match it, and then prove they do.

| Command | What it does |
| --- | --- |
| `npm run media` | Builds the app clips, the app stills, the film files, the posters, the chapter stills and `film.json`. Outputs that are already up to date are skipped. |
| `npm run media -- --force` | Rebuilds everything and ignores the stamps. |
| `npm run media -- --only=app` / `--only=film` | Builds one half only. |
| `npm run media -- --no-render` | Never calls Remotion. Without a brand-palette loop the film is not ready. |
| `npm run media -- --scratch` | Dry run of the film pipeline. It accepts renders that are older than the timeline and writes to `node_modules/.cache/agent-uncle-media/scratch/`. `public/` and `film.json` are not touched. |
| `npm run media:audit` | Film colour audit (blocking). Exits 1 if any frame contains orange or lime. |
| `npm run media:verify` | Checks that every file in the manifest exists and probes to the expected values. Exits 1 on any mismatch. Add `-- --scratch` to verify a dry run. |
| `node --test 'scripts/media/**/*.test.mjs'` | Unit tests for the audit classifier, the colour conversion choice, the film source gate, the chapter mapping and the chapter keyframe check. |

## The capture is local, so rebuild media here

`.context/` is gitignored and never leaves this machine. The app capture lives there
(`.context/app-capture/videos` and `screenshots`), so a fresh clone cannot rebuild the app
clips or stills.

- If a capture source is missing but the earlier outputs still exist, the build keeps them and
  prints a warning.
- If the outputs are missing too, the build fails.

Rebuild media in the workspace that has the capture, and commit `public/media/**` from there.

The Remotion project (`video/`) is only read:

- The build never writes into `video/`.
- The brand loop it renders goes to `node_modules/.cache/agent-uncle-media/`.

## Requirements

- **Node 22.18 or newer** (this workspace runs Node 25). The scripts import
  `src/content/media.ts` and `video/src/timeline.ts` with Node's built-in type stripping.
  `lib/ts-import.mjs` registers two module hooks, so no CLI flags are needed:
  - `.ts` files load as TypeScript. Node therefore does not print the typeless `package.json`
    warning.
  - `.json` imports get the `type: "json"` attribute.
- **ffmpeg 7 or newer** with `libx264`, `libsvtav1` and `aac`, plus `ffprobe`
  (`brew install ffmpeg`). The build checks for these encoders first.
- **sharp**, a devDependency of the app.
- **Remotion installed in `video/`** (`npm ci` there). It is needed only when the brand loop
  is not in the cache.

## Inputs and outputs

### App clips (spec 11; used in S7 and S8)

Sources are `.context/app-capture/videos/<clip>_1080w30.mp4`.

Each clip is built twice:

- **H.264 High** (`yuv420p`, CRF 26, preset slow, GOP 15, faststart, no audio).
- **AV1 WebM** (SVT-AV1, CRF 38, preset 6, GOP 15). List it first in `<video>`.

Both are 720x1564.

| Manifest id | Source and trim | Output |
| --- | --- | --- |
| `retailerDenimDetail` | `03-request-detail_1080w30.mp4`, 0 to 17.62 s | `public/media/app/retailer-denim-detail.{webm,mp4}` |
| `uncleHome` | `05-uncle-home_1080w30.mp4`, 0 to 16.72 s | `public/media/app/uncle-home.{webm,mp4}` |
| `chatHistory` | `09-chat_1080w30.mp4`, 14.0 to 23.1 s (ends on the scrolled-up records, before the capture goes back to the 채팅 list at 23.17 s) | `public/media/app/chat-history.{webm,mp4}` |

Gates:

- Each MP4 must be at most 1.8 MB (spec 13).
- Each clip must be 720x1564.
- Each length must be within 0.1 s of the manifest.

Codec strings for `<source type>`: `video/webm; codecs="av01.0.08M.08"` (AV1 Main, level 4.0,
8-bit) and `video/mp4; codecs="avc1.640028"` (H.264 High, level 4.0).

### App stills (sharp)

- Colour space is converted to sRGB.
- Resize is Lanczos3 to the exact manifest sizes: 540x1173 and 1080x2347, from 1320x2868.
- Formats are AVIF (quality 60, effort 6, chroma 4:4:4) and WebP (quality 82, effort 6).

| Manifest id | Source |
| --- | --- |
| `retailerHome0941` | `screenshots/04-home-scroll.png` |
| `uncleHome0941` | `screenshots/10-uncle-home.png` |
| `retailerDenimDetailFirst` | Frame at 0.1 s of `videos/03-request-detail.mp4` (1320 wide, 60 fps master) |
| `uncleHomeFirst` | Frame at 0.1 s of `videos/05-uncle-home.mp4` |
| `chatHistoryFirst` | Frame at 14.0 s of `videos/09-chat.mp4` |
| `chatHistoryRecords` | Frame at 23.0 s of `videos/09-chat.mp4`: the chat clip's end frame (20:31, 02:16, 03:06, the 03:07 bubble, 05:53) |

Gate: each 1080w AVIF must be at most 120 KB (spec 13).

### Film (spec 11; used in S9)

The film comes from `video/out`, and only from green v2 renders.

The plan named the renders `agent-uncle-promo-v2-*.mp4`. `video/scripts/render-all.sh` writes
them under the canonical names instead, and the persimmon v1 cut was renamed with a `-v1`
suffix. The build therefore tries these candidates in order:

| Role | Candidates (first usable wins) |
| --- | --- |
| master | `agent-uncle-promo-v2-16x9.mp4`, then `agent-uncle-promo-16x9.mp4` |
| social | `agent-uncle-promo-v2-9x16.mp4`, then `agent-uncle-promo-9x16.mp4` |
| loop | `agent-uncle-hero-loop-v2-brand.mp4`, then the brand loop rendered into the cache, then `agent-uncle-hero-loop-v2.mp4`, then `agent-uncle-hero-loop.mp4` |

The cache render uses `npx remotion render HeroLoop <cache>/hero-loop-brand.mp4 --props='{"palette":"brand"}' --muted`,
run from `video/`. The last two loop candidates are the calm palette. They work as a fallback,
with a warning that S9 wants the brand palette.

A candidate is used only if it passes all of these checks:

1. **It is not a `-v1` file.**
2. **It is not still being written.** The file must be at least 15 s old. It is then copied into
   the cache, and the copy is refused if the original changed during the copy. This means a
   render in progress cannot change under the encoder.
3. **It matches the current timeline.** Size, 30 fps, and the frame count from
   `video/src/timeline.ts`:
   - master: `MASTER.total`
   - social: `SOCIAL.total`
   - loop: `LOOP_FRAMES` in `HeroLoop.tsx`

   The masters must also have audio. A v1 cut, or a render older than the timeline, is
   therefore refused under any name.
4. **It passes the colour audit.**

Encodes (all H.264 High, `yuv420p`, preset slow, faststart, tagged BT.709):

| Output | Source | Size | CRF | Level | Keyframes | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| `promo-16x9-1080.mp4` | master | 1920x1080 | 23 | 4.0 | GOP 60 + IDR on each chapter start | AAC 128k |
| `promo-16x9-720.mp4` | master | 1280x720 | 25 | 3.1 | GOP 60 + IDR on each chapter start | AAC 128k |
| `promo-9x16-720.mp4` | social | 720x1280 | 24 | 3.1 | GOP 60 | AAC 128k |
| `loop-720.mp4` | loop | 1280x720 | 24 | 3.1 | GOP 30 | none |
| `loop-1080.mp4` | loop | 1920x1080 | 24 | 4.0 | GOP 30 | none |

Seeking:

- The S9 chapter ticks (16:9 frame only) seek the master to each `film.json` chapter start.
- Both master encodes therefore get `-force_key_frames <chapter starts> -forced-idr 1`, so every
  tick lands on an IDR frame and paints at once.
- Without it, four of the eight starts (요청, 수락, 확보, 미송) fell up to 1.5 s after the
  previous keyframe, and the browser had to decode forward to them.
- The build and `media:verify` both fail if a chapter start has no keyframe within half a frame.
- The 1080p files are pinned to level 4.0, which caps x264 at 4 reference frames. Left to
  itself, x264 picks level 5.0 at preset slow. Level 4.0 is the level hardware decoders take for
  granted, and it matches the `avc1.640028` string the app clips use.

Stills from the film:

- `poster-end-{800,1600}.{avif,webp}`: the last frame of the master (`-sseof -0.1`), at
  800x450 and 1600x900.
- `poster-9x16-end-{540,1080}.{avif,webp}`: the last frame of the social cut, at 540x960 and
  1080x1920.
- `poster-loop-{800,1600}.{avif,webp}`: the brand loop at 0.1 s, matching the loop still before decode.
- `poster-9x16-loop-{540,1080}.{avif,webp}`: the centre cover crop of the brand loop at 0.1 s for mobile Save-Data.
- `chapter-{0..7}-480.avif`: a frame from the master at each chapter start plus 0.8 s, at
  480x270.

### `film.json`

The chapters are `MASTER.chapters` from `video/src/timeline.ts`:

- Labels have their number prefix stripped (`00 연결` becomes `연결`).
- `start` is `from / FPS`.
- `duration` is `MASTER.total / FPS`, and is cross-checked against ffprobe of the master
  (within 0.2 s).

`files` copies `FILM_FILES` from `media.ts`, so the paths always come from one place.

`ready` is true only when all of these hold:

- all three sources passed their checks
- every encode matches its size, audio and length
- every shipped film file passes the colour audit

If the master, social or loop source is missing, the build:

- writes `ready: false` with `files: {}` and the timeline chapters
- prints a loud banner
- exits 0, because the WP-20 release gate blocks later

Before `film.json` is written, it is type-checked against the `Film` type: `media.ts` is
compiled with the candidate JSON in a scratch project. A generated file can therefore never
break `tsc` or `next build`.

`media.ts` types `Poster.variants` as a readonly array, so `film.json` carries every poster.
(While it was a tuple, the build omitted the posters from `film.json` with a warning; that
fallback is still there.)

## Colour handling

Every output is tagged with the BT.709 matrix, BT.709 primaries and an sRGB transfer, in
limited range. Stills are cut through the same conversion as the videos, so a `<video>` poster
does not shift colour when playback starts.

- **App capture.** It is tagged Display P3 (`smpte432`), because the simulator recorder works
  in P3.
  - The clips and the first-frame stills are converted to sRGB primaries at encode time, using
    ffmpeg's `colorspace` filter. Browsers that ignore video colour tags then show the same
    colours as colour-managed browsers.
  - The two screenshots are already sRGB PNGs.
- **Remotion renders.** They leave the YUV matrix untagged but are encoded with BT.601
  coefficients. The `#0C483E` field decodes to 11,71,62 with BT.601, and to 5,64,63 if read
  as BT.709. The film encodes therefore convert BT.601 to BT.709 and tag the result, so every
  browser shows the brand green.

## Colour audit (spec 11, blocking)

`npm run media:audit` checks every video and image in `public/media/film`, plus every manifest
file when `film.json` is ready.

- **Sampling.** Videos are sampled at 2 fps and scaled to 480 px wide. Images are scaled to
  480 px.
- **Orange pixel.** Hue 8 to 60 degrees, saturation above 0.35, value above 0.35.
- **Lime pixel.** Hue 65 to 100 degrees, saturation above 0.5, value above 0.6.
- **Failing frame.** More than 100 orange and lime pixels combined.
- **Exit code.** 1 if any frame fails. The frames of a failing video are kept in a temp folder,
  and the path is printed.

The app's red badge (`#E42939`, hue about 355) is outside both ranges. The pixel rule allows it
inside real footage.

The build also audits every source before using it, and every shipped file after encoding.

### Negative control (run on 2026-10-12)

```
$ npm run media:audit -- video/out/agent-uncle-promo-16x9-v1.mp4 video/out/agent-uncle-hero-loop-v1.mp4
file                                     frames  failing  worst frame                result
---------------------------------------  ------  -------  -------------------------  ------
video/out/agent-uncle-promo-16x9-v1.mp4      37       34  9.0s orange 121748 lime 0  FAIL
video/out/agent-uncle-hero-loop-v1.mp4       14       14  1.5s orange 242 lime 0     FAIL
[audit] FAIL: orange or lime found (or files missing). Never ship these files.
exit 1
```

Run the same command on the shipped files (`npm run media:audit`) and it passes with exit 0.
The v1 files (persimmon) must never be copied into `public/`.

## Verification

`npm run media:verify` checks the following.

**App clips**

- the codec (H.264 MP4 with faststart, AV1 WebM)
- 720x1564, no audio
- length within 0.1 s of the manifest
- the 1.8 MB budget

**App stills**

- both formats at both widths, at the manifest sizes
- the 120 KB AVIF budget

**`film.json`**

- It type-checks.
- Its chapters equal the timeline, and its labels equal spec S9 (연결 요청 수락 확보 미송 전달 수령 기록).
- When `ready` is true, every film file has:
  - the right size and codec
  - audio on the masters and the social cut, and none on the loops
  - faststart
  - the master length within 0.2 s of `duration`
  - a keyframe on every chapter start of both masters (within half a frame)
- The posters and chapter stills have the right sizes.

**Unreferenced files** in `public/media` are reported as warnings.

When `ready` is false, `verify` prints a banner and still exits 0 after checking the app media.
The WP-20 release gate blocks on `ready`.

## Cache, stamps and timing

`node_modules/.cache/agent-uncle-media/` holds:

| File or folder | Contents |
| --- | --- |
| `stamps.json` | A hash of each output's recipe, plus the size and mtime of its sources |
| `sources/` | Snapshots of the `video/out` renders that were used |
| `hero-loop-brand.mp4` | The brand loop render. It is reused until a file under `video/src` or `video/public` changes. |
| `frames/` | Extracted PNG frames |
| `tmp/` | Scratch files. Encoders write here first, and the result is moved into `public/`, so no half-written file is ever served. |

A rerun with nothing changed finishes in seconds. On 2026-10-12, 47 outputs were up to date
after 2.8 s, and `film.json` was left untouched.

The encodes are deterministic: a `--scratch` rebuild from the same sources produced
byte-identical MP4, AVIF and WebP files.

A full rebuild takes about 10 minutes on a loaded machine, and almost all of it is the three AV1
encodes. SVT-AV1's default screen-content mode detects the UI footage and switches on its
screen-content tools. In a test with that mode forced on, the encode ran about 60 times slower
than with it off (257 s against 4 s for `chat-history`). The build keeps the encoder default,
and the result is stamped, so this cost recurs only when a source changes.

## Last full build (2026-10-12, final v2 film)

Sources:

- the final v2 renders in `video/out` (written 05:09 to 05:10, after the last `video/src` change at
  05:07): master 1554 frames (51.8 s, round 5 timeline) and social 885 frames (29.5 s), both
  30 fps with audio. The `-v1` files are refused by name.
- the brand loop, 210 frames, rendered into the cache at 06:19 from the same `video/src`.
  `video/out/agent-uncle-hero-loop.{mp4,webm}` is the calm palette (off-white field), so it is
  only the fallback. Spec S9 opens on the green field.
- `video/out/*.webm` (VP9) and `agent-uncle-promo-poster.jpg` are not inputs. `FILM_FILES` ships
  H.264 only, and the posters are cut from the master and the social cut through the same colour
  conversion as the encodes. The poster JPG is the same outro frame.

| Output | Size |
| --- | --- |
| `promo-16x9-1080.mp4` | 5.92 MB |
| `promo-16x9-720.mp4` | 3.51 MB |
| `promo-9x16-720.mp4` | 2.24 MB |
| `loop-720.mp4` | 283 KB |
| `loop-1080.mp4` | 561 KB |
| `retailer-denim-detail.mp4` | 1.64 MB |
| `uncle-home.mp4` | 1.65 MB |
| `chat-history.mp4` | 894 KB (9.1 s; AV1 WebM 833 KB) |

- The AV1 WebMs are about the same size as the MP4s at the spec's CRF values (1.09 to 1.72 MB).
- Each 1080w still AVIF is 37 to 42 KB.
- `film.json`: 51.8 s. Chapters 연결 0, 요청 6.8, 수락 13.3, 확보 17.3, 미송 22.2, 전달 31.8,
  수령 37.3 and 기록 42.3. These equal the HUD chapter frames in `.context/video/v2-edl.md` §1.6
  (0, 204, 399, 519, 666, 954, 1119 and 1269).

Gate results:

- `npm run media:audit`: 21 film files pass (worst frame: 2 orange pixels), exit 0.
  - The final `video/out` files pass too: both masters (MP4 and WebM), the social cut, both
    loops and the poster JPG. Worst frame: 0 pixels.
- `npm run media:verify`: 49 checks match, including a keyframe on all 8 chapter starts of both
  masters. Exit 0.
- `node --test 'scripts/media/**/*.test.mjs'`: 25 pass.

Playback was checked against the dev server:

- **1440x900 (Chrome stable).**
  - The reveal plays `loop-1080.mp4`.
  - 영상 보기 plays `promo-16x9-1080.mp4` with sound.
  - The ticks for 확보, 전달 and 기록 land exactly on 17.3, 31.8 and 42.3 s. `seeked` fires
    after 48 to 239 ms.
  - At the end, the frame shows the outro poster (`poster-end-1600.avif`) and the button reads
    영상 보기.
- **390x844 (WebKit).**
  - Before play, the frame shows `poster-9x16-end-1080.avif`.
  - A tap plays `promo-9x16-720.mp4` inline with sound.
- **Brand green.** The loop field renders at 13 to 16, 72 to 75, 63 to 65 (#0C483E is 12,72,62),
  so there is no seam against the CSS green.
