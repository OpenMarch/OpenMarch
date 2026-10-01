# Timeline Worker Procedure

The procedure an agent (or a person) follows to take one timeline work package
from `open` to `in-review`. It is tool-agnostic. The Claude Code skill
`/timeline-work` and the `timeline-worker` agent both just run this file.

The design goal is that **any session can stop at any moment**, whether from a
usage limit, a crash or a closed laptop, and a later session can continue from
what's on the remote. Checkpoint often, and keep nothing important only in your
head.

Input: an optional work package ID such as `P1.2`. Without one, pick the next
available package (step 2).

## Current policy (temporary)

Set by the project owner on 2026-09-30, until they lift it here:

- **Don't run the full `test:history` suite or the Playwright e2e suite.** They
  take the longest. Run focused tests instead, including focused history tests
  (`pnpm --dir apps/desktop run test:history <file>`) for the files you change.
  Say in the PR and log which suites you skipped.
- **CI doesn't run on PRs into `timeline-try-2`**, so a reviewer re-runs your
  checks by hand. List every command you ran, with its result.

- **Reviews and merges:** workers never merge their own PRs. The lead session
  has a reviewer sub-agent review each PR against the spec, ADR 0001, `ui.md`
  and the phase file, re-runs the PR's checks itself, and then merges it on the
  fork. The lead stops for the project owner only when a question can't be
  answered from the spec, the ADR, `ui.md` or the plan; otherwise it decides,
  and records the decision in the phase log.

## 1. Orient

1. Fetch: `git fetch <remote>`. All timeline branches and PRs live on the fork
   `AlexDumo/OpenMarch-timeline`, never on `OpenMarch/OpenMarch`. `<remote>` is
   the git remote that points at the fork; the scripts find it. If it's
   missing, add it:
   `git remote add timeline https://github.com/AlexDumo/OpenMarch-timeline.git`.
   The coordination branch is named in [README.md](README.md) and defaults to
   `timeline-try-2` in `scripts/timeline/coord.sh`.
2. Read [README.md](README.md) (the protocol), then, if you haven't in this
   session, [implementation-plan.md](implementation-plan.md).
3. Read the **coordination branch's** copy of the phase file, not a possibly
   stale local one:
   `git show <remote>/<coord-branch>:docs/timeline/phases/<file>.md`.
4. Read that phase's **Handoff notes** and its last three **Progress log**
   entries. If the last entry for your package has a `Resume from:` line, you
   are resuming, and that line is where you start.

## 2. Choose

- **With an ID:** use it. Stop if it's owned by someone else and isn't stale
  (see the README), or if its `Owner` is `human`. For a `human` package you may
  prepare material, but don't close it.
- **Without an ID:** list packages from the coordination branch, and take the
  first one that is `open` or stale, isn't `human`, and whose `Depends on`
  packages (and phase dependencies) are `done` or, for code that builds on
  them, at least merged. Prefer lower phases, then lower IDs.
- **Resuming your own package** (status `claimed` or `in-progress` and the log
  names you or a session running this procedure): continue it without
  re-claiming.
- If nothing is available, finish with `TIMELINE-STATUS: none` (step 7).

## 3. Claim

Edit coordination files only through the helper, which works in a separate
checkout of the coordination branch and retries on push races:

```sh
dir=$(scripts/timeline/coord.sh start)   # prints the coordination checkout path
# edit "$dir/docs/timeline/phases/<file>.md": Owner, Status: claimed
scripts/timeline/coord.sh commit "docs(timeline): claim P1.2"
```

Owner format: `<agent-or-person> (<code-branch>)`. If the phase front matter is
`not-started`, set it to `in-progress` and set its `owner` to you in the same
commit. If the push loses a race to another claim on the same package, re-read
the file; if they got it first, go back to step 2.

## 4. Set up the code branch

- Branch name: `timeline/p<phase>-<short-name>`, such as
  `timeline/p1-geometry`. Several packages in one phase may share a branch when
  one owner does them in sequence.
- Base it on `<remote>/<coord-branch>` until Phase 0 merges, then on
  `<remote>/main`.
- If the branch already exists on the remote (you're resuming), check it out
  instead of creating it.
- Work in a separate git work tree unless your session already runs in one
  (for example `claude --worktree`, or an agent with worktree isolation).
- In a fresh work tree, run `pnpm install` before building or testing.

## 5. Work in small steps, with checkpoints

Break the package into steps that each end in a passing state, such as "port
`geom.ts` and its golden tests". After **every** step, and before starting
anything long:

1. Commit to the code branch and push it. Use `wip:` commits if the step isn't
   reviewable yet; they get squashed at merge.
2. Append a log entry through `coord.sh`, in the README's format, and add one
   more line:
   `- **Resume from:** <the exact next step, the files involved, and any command to re-run first>`.
3. Keep your package's `- Status:` at `in-progress`.

Long, quiet commands (the full `test:history` suite, e2e runs, fuzzers) can
look like a stalled session and get the worker stopped. Run anything expected
to take more than about five minutes in the background with its output
redirected to a file, and check the file's tail every few minutes instead of
waiting on one silent command. Checkpoint before starting it.

If you sense the session ending (context is being compacted, a usage warning,
or you're about to wait on something slow), checkpoint first.

Throughout:

- Follow the root `AGENTS.md`, the nearest package `AGENTS.md`, and
  `docs/conventions/` for the area you're changing.
- The spec (`docs/timeline/spec.md`) wins on the model. The reference code is in
  `docs/timeline/ref/`.
- Don't edit other packages' lines or other phases' work packages. Use a
  `Cross-phase note from P<n>` log entry in the other phase's file instead.
- A decision that changes a `C-n` conflict, the schema, a file format, IPC or a
  public API stops the work: log it as a blocker for a person.

## 6. Finish

1. Run every exit-gate check that your package covers, plus the checks in
   `docs/conventions/verification.md` for the changed area. If `tsc` or a test fails in a file you didn't touch, run `pnpm install` and rebuild the workspace packages before calling it unrelated: a stale install in a new work tree is the usual cause, and the base is kept clean.
2. Squash or tidy `wip:` commits. Confirm
   `git log <base>..HEAD --format=%B` has no AI attribution or co-author lines
   (root `AGENTS.md`).
3. Push to the fork's remote, and open the PR on the fork:
   `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.
   Always pass `--repo AlexDumo/OpenMarch-timeline` to `gh`; without it, `gh`
   can pick the public repo. The PR body names the work package IDs and the
   checks you ran, with results. Workers can share one scratchpad, so name
   temporary files after your package (`pr-P8.3.md`, not `pr.md`), and read a
   body file back before passing it to `--body-file`.
4. Through `coord.sh`: set `- Status: in-review` and `- PR: <url>`. Edit only your package's section: a regex over the whole file can hit the first `- PR:` line instead of yours. Before `coord.sh commit`, run `git diff` in the coordination checkout and confirm only your package's lines and your log entry changed. Tick only
   the exit-gate items you actually ran and whose outcome is already true on
   the base branch. An item that only becomes true when your PR merges (such
   as "the root copies are gone") waits for the merge; say so in the log, and append a final log entry.
5. If you're blocked instead: set `- Status: blocked`, and log exactly what is
   needed and from whom.

## 7. Report

End your final message with exactly one line, which scripts can match:

```text
TIMELINE-STATUS: <P-id> <in-review|done|blocked|in-progress>
```

Use `done` only for a package that produces no pull request (for example a
baseline run or a human decision) and is complete. Use `TIMELINE-STATUS: none`
when nothing was available.
