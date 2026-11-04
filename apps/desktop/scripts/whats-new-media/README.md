# What's new clips

<!-- cspell:words libx libwebp drawtext -->

The welcome flow's What's new walkthrough (`src/components/welcome/steps/WhatsNewTour.tsx`)
plays one short clip per feature. The clips are recorded from the real app, so they can be
re-recorded whenever the UI they show changes. The docs site can reuse this pipeline.

- `clips.mjs`: one entry per clip. `prepare` sets things up off camera and returns the
  region to record; `perform` is what happens on camera. `show` picks the show, `slowdown`
  plays a slow-drawing clip (the 3D View in software) at a fraction of the speed and speeds
  the recording back up, and `pending` marks a clip whose feature isn't on main yet.
- `record.mjs`: opens a show in the built app at 1600 × 1000, light theme, records each clip's
  region with ffmpeg, and encodes it into `src/assets/welcome/whats-new/`:
  - `<clip>.mp4`: H.264, 960 px wide (16:10), 30 fps, no audio. The last 0.6 s fades into the
    first frames, so the clip loops without a jump.
  - `<clip>.webp`: the first frame, used as the poster and for reduced motion.
- `expertShow.mjs`: the timeline clip's show. It takes the demo
  (`web/public/demos/part1-demo.dots`, converted to timelines when the app opens it) and adds
  15 named Expert moves of varied lengths, several crossing page flags, so the timeline stacks
  them in rows. `record.mjs` builds it on each run, so no extra show is committed.
- `placeholder.mjs`: a plain poster for a slide whose feature isn't on main yet.

## Re-recording

From `apps/desktop`, after building the packages and the app:

```sh
pnpm turbo run build --filter="@openmarch/desktop^..."   # from the repo root
pnpm run build
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/whats-new-media/record.mjs          # every clip on main
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/whats-new-media/record.mjs shapes   # one clip
```

It needs `ffmpeg` with libx264 and libwebp, and an X display (`xvfb-run` on Linux; the e2e
Docker image has both). Set `WHATS_NEW_WORK=<dir>` to keep the work folder (failure
screenshots, per-step shots, the Expert show) and `KEEP_RAW=1` to keep the raw recordings.

On a machine without a GPU the field and the 3D View draw with SwiftShader. The script reports
a GPU to the app so the field draws its full view, and hides the 3D View's low-quality notice.

Check the results before committing: watch each clip, and keep all of them together under
about 4 MB (`du -ch src/assets/welcome/whats-new/*`).

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
