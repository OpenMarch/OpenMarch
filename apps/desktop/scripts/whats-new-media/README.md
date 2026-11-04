# What's new clips

<!-- cspell:words libx libwebp -->

The welcome flow's What's new walkthrough (`src/components/welcome/steps/WhatsNewTour.tsx`)
plays one short clip per feature. The clips are recorded from the real app, so they can be
re-recorded whenever the UI they show changes. The docs site can reuse this pipeline.

- `clips.mjs`: one entry per clip. `prepare` sets things up off camera and returns the
  region to record; `perform` is what happens on camera.
- `record.mjs`: opens the demo show (`web/public/demos/part1-demo.dots`, converted to
  timelines) in the built app at 1600 × 1000, light theme, records each clip's region with
  ffmpeg, and encodes it into `src/assets/welcome/whats-new/`:
  - `<clip>.mp4`: H.264, 960 px wide (16:10), 30 fps, no audio. The last 0.6 s crossfades
    into the first frames, so the clip loops without a jump.
  - `<clip>.webp`: the first frame, used as the poster and for reduced motion.

## Re-recording

From `apps/desktop`, after building the packages and the app:

```sh
pnpm turbo run build --filter="@openmarch/desktop^..."   # from the repo root
pnpm run build
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/whats-new-media/record.mjs          # every clip
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/whats-new-media/record.mjs shapes   # one clip
```

It needs `ffmpeg` with libx264 and libwebp, and an X display (`xvfb-run` on Linux; the e2e
Docker image has both). Set `WHATS_NEW_WORK=<dir>` to keep the work folder (failure
screenshots and per-step shots) and `KEEP_RAW=1` to keep the raw recordings.

On a machine without a GPU the field and the 3D View draw with SwiftShader. The script reports
a GPU to the app so the field draws its full view, and hides the 3D View's low-quality notice.

Check the results before committing: watch each clip, and keep all of them together under
about 4 MB (`du -ch src/assets/welcome/whats-new/*`).
