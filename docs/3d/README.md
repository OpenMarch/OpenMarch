# 3D View Project: Start Here

This folder coordinates the work to add **3D View** to OpenMarch: a separate
window that shows the show in a real venue (stadium, gym) and follows the 2D
editor's playback. Many agents and people work on it at once, each owning
separate pieces. Read this file before you start, and follow the protocol so
others can see what you own and how far you've got.

## Current focus: the MVP

The MVP is the 3D View window, five venue kits plus a blank one, named
cameras, block performers that follow playback, and the venue choice saved in
the show. Everything is decided in [ADR 0002](../adr/0002-3d-view.md). The
in-editor preview, imports, video export and analysis tools come after the
MVP; don't build them yet.

| File                                     | Purpose                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| [plan.md](plan.md)                       | Shared context: repo facts, decisions (`D-n`), phase order, risks. Read it once.           |
| [design.md](design.md)                   | Technical design: coordinates, venue settings, kit contracts, sync protocol, budgets.      |
| [ui.md](ui.md)                           | The window's overlay UI and camera behavior.                                               |
| [WORKER.md](WORKER.md)                   | The step-by-step procedure every worker follows: claim, checkpoint, finish.                |
| [phases/](phases/)                       | One file per phase: status, owners, work packages, exit gate, handoff notes, progress log. |
| [validation-plan.md](validation-plan.md) | MVP acceptance checks V1–V6 and their log.                                                 |
| [findings.md](findings.md)               | Measurements and human verdicts. Append-only.                                              |
| [ref/](ref/)                             | The approved visual reference: a standalone three.js demo of every kit. Port from it.      |

## Status board

Each phase file's front matter is the **only** source of truth for status.
There is no central table to keep in sync.

```sh
grep -E '^(phase|title|status|owner):' docs/3d/phases/*.md
grep -E '^### P[0-9]+\.[0-9]+|^- (Owner|Status):' docs/3d/phases/*.md
```

## Running agents

Every option below runs the same procedure, [WORKER.md](WORKER.md). Workers
checkpoint to the remote (pushed commits plus `Resume from:` log lines), so any
session can stop at any time and a later one picks up where it left off.

- **Interactive:** `claude --worktree p1-world`, then `/3d-work P1.1`, or
  `/3d-work` to take the next available package.
- **Parallel, from one lead session:** ask for "run P1.1 and P1.2 with 3d
  workers". Each worker runs in its own work tree and ends with a
  `VIEW3D-STATUS:` line.
- **Unattended:** `scripts/3d/run-worker.sh P1.1`, or with no ID to keep taking
  packages. It retries after usage limits and crashes. Logs go to
  `.git/view3d-logs/`.
- **Usage:** limits are per account, so three or four concurrent workers is the
  ceiling. Use `sonnet` for well-specified ports (most of Phase 2) and the
  default model for cross-cutting packages (P1.3, P1.4, P3.1).

`scripts/3d/coord.sh` edits `docs/3d/` on the coordination branch from a
separate checkout and retries on push races. [WORKER.md](WORKER.md) step 3 shows
its use.

## Branches and pull requests

- **Repository:** everything lives on the fork
  [`AlexDumo/OpenMarch-timeline`](https://github.com/AlexDumo/OpenMarch-timeline),
  never on `OpenMarch/OpenMarch`. Always pass
  `--repo AlexDumo/OpenMarch-timeline` to `gh`.
- **Coordination and integration branch:** `3d-async`, cut from `main` on
  2026-10-03. Docs commits go straight to it through `coord.sh`. Code goes
  through PRs into it.
- **Code branches:** `3d/p<phase>-<short-name>`, based on `<remote>/3d-async`.
- **Going upstream:** merge `OpenMarch/OpenMarch` `main` into `3d-async` after
  each phase. At the MVP, open one PR from `3d-async` to upstream `main`, and
  rewrite fork `(#n)` suffixes in commit titles.

## Vocabulary

- **Phase status:** `not-started`, `in-progress`, `blocked`, `in-review`,
  `done`.
- **Work package status:** `open`, `claimed`, `in-progress`, `blocked`,
  `in-review`, `done`.
- **Work package ID:** `P<phase>.<n>`, such as `P2.3`. Cite IDs in branch
  names, commits, PRs and log entries.
- **Parallel:** `yes` means the package doesn't depend on unfinished packages
  in the same phase.

## Protocol

### 1. Pick up work

1. Run the status board. Choose a package that is `open` and whose
   `Depends on` packages are `done` (merged into `3d-async`).
2. Read the phase file in full, including **Handoff notes** and the last few
   **Progress log** entries.
3. **Claim it** with `scripts/3d/coord.sh` ([WORKER.md](WORKER.md) step 3). Set
   `- Owner:` to `<your-name> (<branch>)` and `- Status:` to `claimed`. If the
   phase was `not-started`, set its front matter to `in-progress` with you as
   `owner`. Commit as `docs(3d): claim P1.2` and push **before** you write
   code.

### 2. Report progress

- Append to the phase's **Progress log** whenever you finish a package, get
  blocked, stop, or open a PR. Never edit or delete earlier entries.
- Keep your package's `- Status:` and `- PR:` lines current.
- The phase lead keeps **Handoff notes** current: where things stand, what's
  surprising, and what not to redo.

Log entry format:

```markdown
### 2026-10-04 · <owner> · P1.2

- **Done:** what changed, with paths and PR or commit links.
- **Checks:** each command run and its result (pass, fail with a summary, or not run and why).
- **Next:** the next concrete step.
- **Blockers:** none, or what is needed and from whom.
- **Resume from:** the exact next step, the files involved, and any command to re-run first.
```

### 3. Finish

1. Tick exit-gate items **only** after running their checks, and paste the
   command and result into the log.
2. Open the PR into `3d-async` and set the package to `in-review` with the PR
   link.
3. The lead reviews and merges, then sets the package to `done`. When every
   package and gate item is done, the lead sets the phase to `done`.

### Blocked, stale or abandoned work

- **Blocked:** set the package to `blocked` and say exactly what is needed and
  from whom.
- **Stale claims:** a claim with no log entry and no branch activity for 2 days
  may be taken over. Log the previous owner's name, then re-claim.
- **Stopping:** set the package back to `open`, and leave handoff notes and a
  pushed branch.

### Rules

- **Edit only what you own:** your packages' Owner, Status and PR lines, your
  log entries, and the handoff notes of a phase you lead. To tell another phase
  something, append a log entry in its file headed `Cross-phase note from P<n>`.
- **Decisions don't hide in code.** Anything that changes ADR 0002, the
  schema, the file format, IPC or the shared contracts in
  `apps/desktop/src/view3d/core/types.ts` goes into the ADR and
  [plan.md](plan.md) first. Log a blocker instead of improvising.
- **The reference wins on looks.** Port geometry and proportions from
  [ref/venue-demo.html](ref/venue-demo.html). The ADR and design win on
  architecture: the demo's feet, globals and single file are not the design.
- **Verification** follows `docs/conventions/verification.md`, plus each
  phase's exit gate.
- **Commits and PRs** follow the root `AGENTS.md`, including its ban on AI
  attribution lines.
- **No Markdown tables for anything agents update.** Keep mutable state to one
  field per line.
- **Human-only items** have `- Owner: human`. Agents prepare them but don't
  close them: ADR acceptance, design sign-off and acceptance verdicts.
