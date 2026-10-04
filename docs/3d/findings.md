# 3D View Findings

Measurements and human verdicts. Append-only, grouped by heading.

Entry template:

```markdown
### YYYY-MM-DD · <owner> · P5.1

- Result: (against the budget)
- Machine and commit:
- Fixture and command:
```

## Performance

Budgets are in [design.md](design.md) §9.

### 2026-10-04 · 3d-worker (3d/p5-perf) · P5.1

- Result (against the budget):
  - **Draw calls: met.** At most 32 in any kit (budget 300), counted with `renderer.info.render.calls`, shadow pass included, with crowd and 300 performers. High / low: hs 32 / 21, bighs 28 / 28, college 23 / 23, pro 22 / 22, gym 22 / 19, blank 5 / 4. Bighs, college and pro open at night or roof closed, where the sun casts no shadows, so `low` saves no calls there.
  - **Triangles** (high / low): hs 77k / 39k, bighs 97k / 61k, college 215k / 123k, pro 485k / 277k, gym 65k / 33k, blank 49k / 25k. The crowd is most of it (12 triangles a person; pro seats 34,664 people, 17,315 in `low`). The 300 performers are 24k triangles, doubled while they cast shadows.
  - **Kit build: met.** Median of 5 in the real window, CPU only (first run in brackets): kit hs 1.6 (2.1) ms, bighs 3.0, college 3.0 (4.4), pro 21 (48), gym 24 (30), blank 0.2. Crowd: hs 1.9, bighs 3.2, college 9.7, pro 19, gym 1.1 ms. Field surface: 68–116 ms per kit, the biggest build cost. Environment: under 1 ms. Pro with crowd and field is about 150 ms on the first build (budget 400 ms).
  - **CPU per frame: well under budget.** While playing with 300 performers, all `useFrame` callbacks together took 0.13–0.42 ms a frame, and `renderer.render` took 0.4–1.4 ms of main-thread time. Allocation-free `positionAtInto` for 300 performers: 37 µs a frame, against 54 µs for `positionAt` (a Node benchmark over 20,000 frames). `scene.updateMatrixWorld` costs 1–13 µs a frame per kit (3–58 objects), so freezing matrices isn't worth doing.
  - **60 fps on an integrated GPU: not measured.** This machine has no GPU. Under SwiftShader at 1280 × 683 the window draws 1–11 fps: pro 1.4 fps high and 1.2 low, hs 4.8 and 7.7, blank 7.3 and 11.3, all while playing. These numbers are GPU-bound software rasterization, not representative. The fallback check stays open for V6 on real hardware.
  - **Fallback: works.** On SwiftShader the window logged `3D View: below 30 fps for 3 s; switched to low quality (no shadows, half crowd).` once, 6.1 s after opening (3 s of slow frames after load), and stayed `low`.
  - **Kit swap hitch:** the longest frame after a venue change was 0.9–3.7 s under SwiftShader, mostly first-use shader compilation and the field surface. Not representative either; re-check on real hardware.
- Machine and commit: AMD Ryzen 5 3600 <!-- cspell:ignore Ryzen --> (6 cores, 12 threads), 7 GB RAM, Debian 13, no GPU. Electron on SwiftShader (ANGLE) in Docker plus Xvfb (`~/om-capture` toolkit). Branch `3d/p5-perf` on `3d-async` `da4782c2`, with a temporary measurement hook (`window.__view3dDebug`) that was not committed.
- Fixture and command: a 300-marcher, 7-page show built from `src/test/mock-data/marchers-and-pages.sql` (pages and beats kept; marchers replaced by a 25 × 12 block that turns and shifts every page). The 3D window was 1280 × 720 and the editor 640 × 1080. For each kit at its default lighting with crowd on: `setQuality("high")`, then 3 s paused and 4 s playing, and the same at `low`. Build times came from calling the kit, crowd, field and environment builders five times inside the window. The scenario and run folders are listed in the P5.1 pull request.

## Verdicts
