# Video Export Benchmark Script

## Purpose

Provide a repeatable way to measure video export time before and after performance changes. The script should run a single focused Playwright/Electron E2E benchmark, write a JSON result, and optionally compare it against a previous run.

This benchmark is not a correctness replacement for the full E2E suite. It exists to answer one question: did video export get faster under the same benchmark conditions?

## Command Shape

Run from the repo root:

```bash
pnpm --dir apps/desktop bench:video-export -- --label before
pnpm --dir apps/desktop bench:video-export -- --label after --compare before
```

The package script should call a Node wrapper, for example:

```json
{
  "bench:video-export": "node scripts/video-export-benchmark.mjs"
}
```

## Script Responsibilities

The wrapper script should:

1. Build the production Electron app with `pnpm run build:electron`.
2. Create deterministic paths for benchmark output and exported video.
3. Run only `e2e/tests/video-export-benchmark.spec.mts`.
4. Pass benchmark settings through environment variables.
5. Read the JSON result written by the E2E test.
6. Print a concise summary.
7. If `--compare <label>` is provided, compare the current result against the earlier JSON result.

## Arguments

`--label <name>`

Required. Used in result filenames, for example `video-export-before.json`.

`--compare <name>`

Optional. Loads `video-export-<name>.json` and reports elapsed-time delta.

`--keep-video`

Optional. Keeps the exported video file for inspection. By default, the script may delete it after recording file size.

## Environment Variables

The wrapper should pass these to Playwright:

`VIDEO_EXPORT_BENCHMARK_LABEL`

The label for the current run.

`VIDEO_EXPORT_BENCHMARK_RESULT_PATH`

Absolute path where the E2E test writes JSON results.

`PLAYWRIGHT_VIDEO_EXPORT_PATH`

Absolute path where the app should write the exported video.

`PLAYWRIGHT_SESSION=true`

Required so app code can safely enable test-only behavior.

## Required App Test Hook

Video export normally opens a native save dialog. The benchmark must avoid native dialogs.

Add a Playwright-only bypass in `VideoExportService.start()`:

```ts
if (
  process.env.PLAYWRIGHT_SESSION === "true" &&
  process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH
) {
  this.fileHandle = await fs.promises.open(
    process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH,
    "w",
  );
  this.filePath = process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH;
  return this.filePath;
}
```

This should only be active during Playwright sessions.

## E2E Benchmark Responsibilities

The Playwright spec should:

1. Launch the production Electron build using existing E2E fixtures.
2. Use a deterministic benchmark `.dots` file.
3. Seed or load a representative show.
4. Select consistent export options.
5. Start a timer immediately before triggering video export.
6. Wait for the success state and exported file.
7. Stop the timer.
8. Write a JSON result to `VIDEO_EXPORT_BENCHMARK_RESULT_PATH`.

Recommended benchmark shape:

- Duration: 5 minutes.
- Resolution: 1080p.
- FPS: 60.
- Marchers: 100-150.
- Pages: 30-40.
- Include at least one path-heavy mode if pathway performance is being tested.

## Result JSON

The E2E test should write this shape:

```json
{
  "label": "before",
  "elapsedMs": 124200,
  "exportPath": "/tmp/openmarch-video-export-before.mp4",
  "outputBytes": 12345678,
  "settings": {
    "durationSeconds": 300,
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "marchers": 120,
    "pages": 36,
    "overlay": true
  },
  "git": {
    "sha": "abc1234",
    "branch": "feature/video-export"
  },
  "createdAt": "2026-06-19T12:00:00.000Z"
}
```

## Summary Output

Without comparison:

```text
Video export benchmark
label: before
elapsed: 124.2s
output: apps/desktop/e2e/benchmark-results/video-export-before.json
```

With comparison:

```text
Video export benchmark
before: 124.2s
after:   96.8s
delta:  -22.1%
output: apps/desktop/e2e/benchmark-results/video-export-after.json
```

## Notes

- Always run the benchmark against a production Electron build.
- Use the same machine and power conditions for before/after comparisons.
- Run more than once if results are noisy.
- Keep the benchmark isolated from the full E2E suite so performance runs stay fast and intentional.
