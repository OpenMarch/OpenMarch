# 3D View Worker Procedure

The procedure an agent (or a person) follows to take one 3D View work package
from `open` to `in-review`. It is tool-agnostic. The Claude Code skill
`/3d-work` and the `3d-worker` agent both just run this file.

The design goal is that **any session can stop at any moment**, whether from a
usage limit, a crash or a closed laptop, and a later session can continue from
what's on the remote. Checkpoint often, and keep nothing important only in your
head.

Input: an optional work package ID such as `P2.3`. Without one, pick the next
available package (step 2).

## Current policy

Set by the project owner on 2026-10-04, until they lift it here:

- **Scope is the MVP** in [README.md](README.md). Don't build post-MVP ideas
  (in-editor preview, imports, video export, analysis), even if they look
  small.
- **Don't run the full `test:history` suite or the whole Playwright e2e
  suite.** Run focused tests for the files you change, for example
  `pnpm --dir apps/desktop exec vitest run src/view3d` or
  `pnpm --dir apps/desktop run test:history <file>`. Say in the PR which suites
  you skipped.
- **CI doesn't run on PRs into `3d-async`**, so the lead re-runs your checks by
  hand. List every command you ran, with its result.
- **Workers never merge their own PRs.** The lead reviews each PR against ADR
  0002, [design.md](design.md), [ui.md](ui.md) and the phase file, re-runs its
  checks, and merges. The lead escalates to the project owner only when the
  docs can't answer a question.
- **Visual evidence:** packages that change what the window shows attach
  screenshots to the PR. On the project's headless Linux box, use the
  capture toolkit in `~/om-capture` if it exists (see its README). Otherwise,
  describe what you checked and how.

## 1. Orient

1. Fetch: `git fetch <remote>`. `<remote>` is the git remote that points at
   `AlexDumo/OpenMarch-timeline`. If it's missing, add it:
   `git remote add timeline https://github.com/AlexDumo/OpenMarch-timeline.git`.
   The coordination branch is `3d-async`.
2. Read [README.md](README.md), then, if you haven't in this session,
   [plan.md](plan.md), [design.md](design.md) and ADR 0002. Read [ui.md](ui.md)
   for any package that touches the window's UI or cameras.
3. Read the **coordination branch's** copy of the phase file, not a possibly
   stale local one: `git show <remote>/3d-async:docs/3d/phases/<file>.md`.
4. Read that phase's **Handoff notes** and its last three **Progress log**
   entries. If the last entry for your package has a `Resume from:` line, you
   are resuming, and that line is where you start.

## 2. Choose

- **With an ID:** use it. Stop if someone else owns it and it isn't stale, or
  if its `Owner` is `human`.
- **Without an ID:** take the first package that is `open` or stale, isn't
  `human`, and whose `Depends on` packages are `done`. Prefer lower phases,
  then lower IDs.
- **Resuming your own package:** continue it without re-claiming.
- If nothing is available, finish with `VIEW3D-STATUS: none` (step 7).

## 3. Claim

Edit coordination files only through the helper, which works in a separate
checkout of the coordination branch and retries on push races:

```sh
dir=$(scripts/3d/coord.sh start)    # prints the coordination checkout path
# edit "$dir/docs/3d/phases/<file>.md": Owner, Status: claimed
scripts/3d/coord.sh commit "docs(3d): claim P2.3"
```

Owner format: `<agent-or-person> (<code-branch>)`. If the phase front matter is
`not-started`, set it to `in-progress` and set its `owner` to you in the same
commit. If the push loses a race for the same package, re-read the file; if
they got it first, go back to step 2.

## 4. Set up the code branch

- Branch name: `3d/p<phase>-<short-name>`, such as `3d/p2-pro-dome`, based on
  `<remote>/3d-async`. If it already exists on the remote, check it out.
- Work in a separate git work tree unless your session already runs in one.
- In a fresh work tree, run `pnpm install`, then build the workspace packages
  the desktop app consumes (`pnpm --filter "@openmarch/desktop^..." build`)
  before type-checking or testing.

## 5. Work in small steps, with checkpoints

Break the package into steps that each end in a passing state. After **every**
step, and before starting anything long:

1. Commit to the code branch and push it. `wip:` commits are fine; they get
   squashed at merge.
2. Append a log entry through `coord.sh`, in the README's format, including the
   `Resume from:` line.
3. Keep your package's `- Status:` at `in-progress`.

Run anything expected to take more than about five minutes in the background,
with its output redirected to a file, and check the file's tail every few
minutes. If you sense the session ending, checkpoint first.

Throughout:

- Follow the root `AGENTS.md`, `apps/desktop/AGENTS.md` and `docs/conventions/`.
- Respect the `view3d/core/` boundary (ADR 0002 D-1): no React, React Three
  Fiber, drei, Electron or database imports there.
- Build against `apps/desktop/src/view3d/core/types.ts`. If a contract there
  doesn't fit, log a blocker for the lead; don't change it on your own.
- Don't edit other packages' lines. Use a `Cross-phase note from P<n>` log
  entry in the other phase's file instead.
- A decision that changes the ADR, the schema, the file format, IPC or a shared
  contract stops the work: log it as a blocker.

## 6. Finish

1. Run the exit-gate checks your package covers, plus the checks in
   `docs/conventions/verification.md` for the changed area. At minimum:
   `pnpm --dir apps/desktop exec tsc --noEmit`, the focused tests, and
   `pnpm format:check`, `pnpm lint:check` and `pnpm spellcheck` (or their
   desktop-scoped equivalents). If `tsc` or a test fails in a file you didn't
   touch, run `pnpm install` and rebuild the workspace packages before calling
   it unrelated.
2. Squash or tidy `wip:` commits. Confirm `git log <remote>/3d-async..HEAD --format=%B`
   has no AI attribution or co-author lines (root `AGENTS.md`).
3. Push, and open the PR on the fork:
   `gh pr create --repo AlexDumo/OpenMarch-timeline --base 3d-async`.
   The body names the package IDs and every check you ran, with results, and
   links or attaches the visual evidence. Workers share a scratchpad, so name
   temporary files after your package (`pr-P2.3.md`, not `pr.md`).
4. Through `coord.sh`: set `- Status: in-review` and `- PR: <url>`. Edit only
   your package's section. Before `coord.sh commit`, run `git diff` in the
   coordination checkout and confirm only your lines and your log entry changed.
   Tick only gate items you ran whose outcome is already true on `3d-async`.
5. If you're blocked instead: set `- Status: blocked`, and log exactly what is
   needed and from whom.

## 7. Report

End your final message with exactly one line, which scripts can match:

```text
VIEW3D-STATUS: <P-id> <in-review|done|blocked|in-progress>
```

Use `done` only for a package that produces no pull request and is complete.
Use `VIEW3D-STATUS: none` when nothing was available.
