# Re-adding playback-hitch profiling instrumentation

This describes how to re-add the diagnostic instrumentation used to track down playback
hitches (page-change stutters, dropped frames during animation, etc). It was stripped
from the codebase once the hitches it found were fixed, to keep the app free of
always-on logging overhead — but the pattern is worth reusing if a similar hitch shows
up again (a new one, or a regression of an old one).

It has three independent pieces. Add whichever ones are relevant — you don't need all
three every time.

## 1. `performance.mark`/`measure` around suspect code (`perfMarks.ts`)

Create `apps/desktop/src/services/perf/perfMarks.ts`:

```ts
export const PERF_MARKS_ENABLED = true;

const hasPerformance =
  typeof performance !== "undefined" && typeof performance.mark === "function";

/** Wraps a synchronous function call with a named `performance.measure`. */
export function measureSync<T>(name: string, fn: () => T): T {
  if (!PERF_MARKS_ENABLED || !hasPerformance) return fn();

  const label = `playback:${name}`;
  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  performance.mark(startMark);
  try {
    return fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(label, startMark, endMark);
    } catch {
      // Marks can be missing in edge cases; never let instrumentation break the app.
    }
  }
}

/** Records a zero-duration mark, useful as a timeline reference point (e.g. page changes). */
export function markInstant(name: string) {
  if (!PERF_MARKS_ENABLED || !hasPerformance) return;
  performance.mark(`playback:${name}`);
}
```

Wrap any synchronous block you suspect is slow:

```ts
measureSync("canvas:update-coordinates", () => {
  // ...the code you want timed...
});
```

Then, in Chrome DevTools, record a Performance trace across the hitch and look at the
"Timings" track — every `measureSync` call shows up as a labeled span, giving you an
exact duration and nesting, without eyeballing flame-graph internals.

**Where this was useful last time:** `frame-clock.ts`'s `tick()`, `useAnimation.ts` /
`useAppearanceAnimation.ts`'s per-frame callbacks, `OpenMarchCanvas.ts`'s
`updateMarcherCoordinates`/`updateMarcherAppearances`/`_getCanvasMarchersByIdsMap`, and
the two page-scoped effects in `Canvas.tsx` (shape-path cleanup, collision markers).

## 2. Proactive console logging (`hitchLogger.ts`)

Create `apps/desktop/src/services/perf/hitchLogger.ts`:

```ts
import { useFrameClockStore } from "@/services/clock/frame-clock";

const LOG_PREFIX = "[hitch]";
const FRAME_BUDGET_MS = 1000 / 60;
const FRAME_DROP_THRESHOLD_MS = FRAME_BUDGET_MS * 2;
const PAGE_CHANGE_CORRELATION_WINDOW_MS = 500;

let lastPageChangeAtMs: number | null = null;
let lastPageId: number | null = null;

/** Call whenever the selected page changes so hitch reports can be correlated to it. */
export function notePageChange(pageId: number | null) {
  if (pageId === lastPageId) return;
  lastPageId = pageId;
  lastPageChangeAtMs = performance.now();
  console.debug(
    `${LOG_PREFIX} page changed -> ${pageId} @ ${lastPageChangeAtMs.toFixed(1)}ms`,
  );
}

function describeRecency(now: number): string {
  if (lastPageChangeAtMs == null) return "no page change yet";
  const deltaMs = now - lastPageChangeAtMs;
  if (deltaMs >= 0 && deltaMs <= PAGE_CHANGE_CORRELATION_WINDOW_MS) {
    return `${deltaMs.toFixed(1)}ms after page change to ${lastPageId}`;
  }
  return "not near a recent page change";
}

let initialized = false;

/** Starts both detectors. Idempotent — safe to call once at app startup. */
export function initHitchLogger(): () => void {
  if (initialized) return () => {};
  initialized = true;

  const cleanups: Array<() => void> = [];

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const observer = new PerformanceObserver((list) => {
        if (!useFrameClockStore.getState().playing) return;
        for (const entry of list.getEntries()) {
          const now = performance.now();
          console.warn(
            `${LOG_PREFIX} long task: ${entry.duration.toFixed(1)}ms ` +
              `(${describeRecency(now)})`,
            entry,
          );
        }
      });
      // cspell:disable-next-line
      observer.observe({ entryTypes: ["longtask"] });
      cleanups.push(() => observer.disconnect());
    } catch (e) {
      // cspell:disable-next-line
      console.debug(`${LOG_PREFIX} longtask API unavailable`, e);
    }
  }

  let rafId: number | null = null;
  let lastFrameAtMs: number | null = null;
  let wasPlayingLastFrame = false;
  const watchFrames = () => {
    const now = performance.now();
    const playing = useFrameClockStore.getState().playing;
    if (playing && wasPlayingLastFrame && lastFrameAtMs != null) {
      const gapMs = now - lastFrameAtMs;
      if (gapMs > FRAME_DROP_THRESHOLD_MS) {
        console.warn(
          `${LOG_PREFIX} dropped frame: ${gapMs.toFixed(1)}ms gap ` +
            `(budget ~${FRAME_BUDGET_MS.toFixed(1)}ms, ${describeRecency(now)})`,
        );
      }
    }
    wasPlayingLastFrame = playing;
    lastFrameAtMs = now;
    rafId = requestAnimationFrame(watchFrames);
  };
  rafId = requestAnimationFrame(watchFrames);
  cleanups.push(() => {
    if (rafId != null) cancelAnimationFrame(rafId);
  });

  return () => {
    cleanups.forEach((fn) => fn());
    initialized = false;
  };
}
```

Wire it up once, near the top of `App.tsx`:

```ts
import { initHitchLogger } from "./services/perf/hitchLogger";
// ...inside the App() component:
useEffect(() => initHitchLogger(), []);
```

Call `notePageChange(selectedPage?.id ?? null)` from `SelectedPageContext.tsx` wherever
the selected page is derived (both the pages-changed effect and the frame-clock-tick
subscription), so hitch reports know how recently a page change happened:

```ts
const derived = derivePage(pages, timeMs);
notePageChange(derived?.id ?? null);
setSelectedPage(derived);
```

This gives you, in the console, tagged `[hitch]`:

- `long task: Nms (...)` — any main-thread block ≥50ms (the browser's own signal,
  catches anything regardless of cause).
- `dropped frame: Nms gap (...)` — RAF-interval gaps wider than ~2 frame-budgets,
  catching smaller drops the long-task floor misses.
- `page changed -> id @ Tms` — a timeline of page transitions to correlate against.

## 3. React commit-level profiling (`renderProfiler.tsx`)

Create `apps/desktop/src/services/perf/renderProfiler.tsx`:

```tsx
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { useFrameClockStore } from "@/services/clock/frame-clock";

const REPORT_THRESHOLD_MS = 4;

const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (actualDuration < REPORT_THRESHOLD_MS) return;
  if (!useFrameClockStore.getState().playing) return;
  console.warn(
    `[hitch] render: "${id}" (${phase}) actual=${actualDuration.toFixed(1)}ms ` +
      `base=${baseDuration.toFixed(1)}ms`,
    { startTime, commitTime },
  );
};

export function HitchProfiler({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
```

Wrap suspect subtrees with it — cast a wide net first (wrap every major region: canvas,
timeline, inspector, sidebar, the always-mounted singletons), then narrow once you see
which `id` dominates:

```tsx
<HitchProfiler id="Canvas">
    <Canvas ... />
</HitchProfiler>
<HitchProfiler id="TimelineContainer">
    <TimelineContainer />
</HitchProfiler>
```

This is what caught the actual root cause last time: a `PageTimeline` (nested inside
`TimelineContainer`) render/commit taking 275-350ms on every page change, dwarfing every
`measureSync`-timed piece of non-React code. `React.Profiler` measures commit cost
per-subtree regardless of DOM output, so it's worth wrapping components that render
`null` too (e.g. `RegisteredActionsHandler`) if you suspect their hook/render work, not
their DOM, is the cost.

## Where to look first

If a similar hitch shows up again, start with #3 (`HitchProfiler`) wrapping the major
top-level regions — it immediately tells you whether the cost is a React commit and, if
so, which subtree, which is usually the fastest way to the actual fix. Add #1
(`measureSync`) once you've narrowed to a subtree and need to find which effect/callback
inside it is slow. Add #2 (`hitchLogger`) if you want a standing, always-on signal in
the console rather than a manually-recorded trace — useful for catching hitches you
weren't specifically looking for.

## Cleanup

Once done diagnosing, delete `apps/desktop/src/services/perf/` and all `measureSync`/
`markInstant`/`HitchProfiler`/`notePageChange`/`initHitchLogger` call sites — grep for
`services/perf` to find every place it was wired in.
