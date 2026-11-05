# What's new clips

<!-- cspell:words libx libwebp drawtext winget Gyan xvfb cwebp -->

The welcome flow's What's new walkthrough (`src/components/welcome/steps/WhatsNewTour.tsx`)
plays one short clip per feature. These scripts record the clips from the real app, so they
can be re-recorded whenever the UI they show changes. The docs site can reuse them.

## How it records

`record.mjs` launches the locally built Electron app with Playwright (in a profile of its own,
so your settings and recent files are untouched), sets each clip up, then films it frame by
frame. A virtual clock is injected into every window: the app's playback time and the 3D View's
clock both follow it, so each frame is exactly 1/60 s after the last however slowly the machine
draws. Each frame is a screenshot of the clip's region; ffmpeg turns them into the clip.

Each clip is written to `src/assets/welcome/whats-new/`:

- `<clip>.mp4`: H.264, 60 fps, 1280 × 800 (16:10), no audio, one keyframe. The last 0.6 s
  blends into the first frames, ending on the frame just before the first, so it loops without
  a jump.
- `<clip>.webp`: the first frame, the poster (also shown with reduced motion).

Each run also gets a folder, `scripts/whats-new-media/runs/<time>/` (git-ignored), with
`record.log` (what was written where, and any failure with a screenshot) and
`contact-sheet.png` (six frames of every clip). The last lines of the output name both.

The clips (`clips.mjs`):

| Clip       | Show             | What it films                                                                                                                                                                                                                                             |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeline` | `line-test.dots` | The 20-marcher drill playing in Expert mode, field and timeline: Move 1 for the whole line with Moves 2–4 nested under it; the field is zoomed in and panned so the marchers sit just above the moves, framed close enough to read the names on the slide |
| `shapes`   | demo             | A section placed in a box, then on a line, then on an arc, with the snapping guides                                                                                                                                                                       |
| `view3d`   | demo             | The 3D View in the Pro dome from a higher box angle than the press box seat, the band mid-march                                                                                                                                                           |
| `props`    | demo             | An amber riser sliding and turning along the back of the field in the 3D View, clear of every marcher (checked on every frame), from a camera high enough that the guard's flags don't rise over it; the frame follows the riser, found by its color      |
| `tempo`    | demo             | Waits for #550 (see below)                                                                                                                                                                                                                                |
| `pathways` | demo             | Waits for #674 (see below)                                                                                                                                                                                                                                |

The demo is `web/public/demos/part1-demo.dots`, converted to timelines when the app opens it.

## Recording on a desktop machine (macOS, Windows or Linux)

### Prerequisites

- Git.
- Node 24 (the version in the repo's `.nvmrc`), for example `nvm install 24`.
- pnpm, through Corepack: `corepack enable` (the repo pins the version).
- ffmpeg with libx264 on the `PATH`, and libwebp in it or `cwebp` beside it (for the posters):
  - macOS: `brew install ffmpeg webp` (Homebrew's ffmpeg has no libwebp; `cwebp` stands in)
  - Windows: `winget install Gyan.FFmpeg` (then open a new terminal)
  - Debian or Ubuntu: `sudo apt install ffmpeg`
- A screen that fits a 1600 × 1000 window (in points; on a smaller screen add
  `--window 1440x900`). The app's windows open on screen while it records; leave them be until
  it finishes. They don't need to stay in front, and no screen-recording permission is needed.

No Playwright browsers are needed: it drives the app's own Electron.

### Build and record

From a fresh clone:

```sh
git clone https://github.com/AlexDumo/OpenMarch-timeline.git
cd OpenMarch-timeline
git checkout convergence/p7-welcome-back
pnpm install
pnpm turbo run build --filter="@openmarch/desktop^..."
pnpm --dir apps/desktop run build
cd apps/desktop
node scripts/whats-new-media/record.mjs
```

The last command records every clip that's on main. To record one clip at a time, name it
(several names work too):

```sh
node scripts/whats-new-media/record.mjs timeline
node scripts/whats-new-media/record.mjs shapes
node scripts/whats-new-media/record.mjs view3d
node scripts/whats-new-media/record.mjs props
```

On Windows, the same commands work in PowerShell (`node scripts\whats-new-media\record.mjs`).
After changing the app, run the two build commands again before recording.

Watch each clip and the contact sheet before committing, and keep all the media together
under about 4 MB (`du -ch src/assets/welcome/whats-new/*`).

### Options

| Option             | Default                        |                                                          |
| ------------------ | ------------------------------ | -------------------------------------------------------- |
| `--width <px>`     | 1280                           | Output width (even); the height follows at 16:10         |
| `--fps <n>`        | 60                             | Frames per second                                        |
| `--window <w>x<h>` | 1600x1000                      | The app window's size, in points                         |
| `--out <dir>`      | `src/assets/welcome/whats-new` | Where the clips go (use another folder for test renders) |
| `--max-frames <n>` | all                            | Stop filming each clip after n frames, for a quick test  |
| `--keep-frames`    | off                            | Keep the PNG frames in the run folder                    |
| `--software-gl`    | off                            | Draw with SwiftShader, for machines without a GPU        |

`WHATS_NEW_WORK=<dir>` puts the run folder somewhere else. A quick test that leaves the real
clips alone: `node scripts/whats-new-media/record.mjs --width 480 --fps 30 --max-frames 30 --out /tmp/whats-new-test`.

There's no real-time mode: stepping the clock works on every machine and gives the most even
motion, while real-time capture would need each OS's own screen grabbing.

## Linux without a GPU, or Docker

The same script runs headless under Xvfb with software drawing. It's slow (the Pro dome takes
about 20 s a frame in SwiftShader), but the result is the same:

```sh
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/whats-new-media/record.mjs --software-gl
```

In Docker, use an image with Node 24, pnpm, ffmpeg, Xvfb and Electron's libraries, mount the
repo, and run the install, the two builds and that command inside the container (node_modules
are per platform, so a host install won't run there).

## Slides waiting on a feature

The Tempo mode (fork PR #550) and Pathways (fork PR #674) slides are written but hidden. Each
has a `requires` field in `src/components/welcome/whatsNewSlides.ts`, checked against
`SHIPPED_FEATURES`, and a placeholder poster from `placeholder.mjs` (needs ffmpeg's drawtext).
When the feature is on main:

1. Check the selectors in its `clips.mjs` entry (marked `TODO(#550)` or `TODO(#674)`), then
   record it: `node scripts/whats-new-media/record.mjs tempo` (or `pathways`). This writes
   the real clip and poster over the placeholder.
2. Add the video to its slide and set its switch in `SHIPPED_FEATURES` to `true`.

To review the hidden slides before then, run or build the app with
`VITE_PUBLIC_WHATS_NEW_PREVIEW=true`.

## The files

- `record.mjs`: the recorder (options above).
- `clips.mjs`: one entry per clip. `prepare` sets things up off camera and returns the region
  to film; `perform` films it with `film` (`freeze`, `skip`, `frame`, `hold`, `drag`). `show`
  picks the show, and `pending` marks a clip whose feature isn't on main yet.
- `line-test.dots`: the timeline clip's show, made in Expert mode: Move 1 (counts 9–24) for
  the whole line, with Moves 2–4 nested under it. Its undo history and music are stripped to
  keep it small.
- `placeholder.mjs`: a plain poster for a slide whose feature isn't on main yet.
