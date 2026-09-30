# Timeline Project: Start Here

This folder coordinates the work to replace page-based motion with the timeline
model. Many agents and people work on it at once, each owning separate pieces.
Read this file before you start, and follow the protocol so that others can see
what you own and how far you've got.

| File                                             | Purpose                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [implementation-plan.md](implementation-plan.md) | Shared context: repo facts, spec/app conflicts (`C-n`), phase order, risks. Read it once.      |
| [WORKER.md](WORKER.md)                           | The step-by-step procedure every worker follows: claim, checkpoint, finish.                    |
| [phases/](phases/)                               | One file per phase: status, owners, work packages, exit gate, handoff notes, progress log.     |
| [ui.md](ui.md)                                   | The timeline UI design (adopted from the `0.2` branch) and how it maps onto the spec.          |
| [findings.md](findings.md)                       | Measurements (QA-PF) and human verdicts (QA-SC-07, -14, -15). Append-only.                     |
| `spec.md`, `ref/`                                | The spec and its reference suite, added in Phase 0. The spec wins over this plan on the model. |

## Status board

Each phase file's front matter is the **only** source of truth for status.
There is no central table to keep in sync. To see the board:

```sh
grep -E '^(phase|title|status|owner):' docs/timeline/phases/*.md
```

To see every work package with its owner and status:

```sh
grep -E '^### P[0-9]+\.[0-9]+|^- (Owner|Status):' docs/timeline/phases/*.md
```

## Running agents

Every option below runs the same procedure, [WORKER.md](WORKER.md). Because
workers checkpoint to the remote (pushed commits plus `Resume from:` log
lines), any session can be stopped at any time, including by a usage limit, and
a later session picks up where it left off.

**Prerequisite:** this folder must be pushed to the coordination branch. Work
trees, headless runs and cloud sessions only see the remote.

### Interactive, one package at a time

```sh
claude --worktree p1-geometry     # a fresh work tree for this session
```

Then type `/timeline-work P1.2`, or `/timeline-work` to take the next available
package. The skill lives in `.claude/skills/timeline-work/` and only points to
`WORKER.md`.

### Parallel, from one lead session

Ask the lead session something like "run P1.4 and P3.2 with timeline-worker
agents". Each `timeline-worker` (`.claude/agents/timeline-worker.md`) runs in
its own work tree. The lead gets each worker's `TIMELINE-STATUS:` line when it
finishes.

### Unattended, surviving usage limits

```sh
scripts/timeline/run-worker.sh P1.2      # one package, until it's in review or blocked
scripts/timeline/run-worker.sh           # keep taking packages until none is left
TIMELINE_MODEL=sonnet scripts/timeline/run-worker.sh P1.5
```

Each attempt is a fresh `claude -p` run in `.claude/worktrees/<name>`. When a
run ends without a `TIMELINE-STATUS:` line (a usage limit, a crash or a network
failure), the script waits (`TIMELINE_RETRY_WAIT`, default 15 minutes) and
starts again, and the new run resumes from the phase file's last checkpoint.
Logs go to `.git/timeline-logs/`. Leave it running in a `tmux` or `screen`
session. It defaults to `--permission-mode auto`; a worker that is refused a
permission it needs logs a blocker instead of stalling.

### After a usage limit in an interactive session

- Same terminal: `claude --continue` resumes the conversation.
- Anywhere else: `/timeline-work P1.2` rebuilds context from the phase file.

### Using usage well

- **Limits are per account.** Every concurrent worker draws on the same usage,
  so one or two at a time is the sustainable rate.
- **Match the model to the work.** Well-specified ports and tests (most of
  Phases 1 and 2, and P3.6) suit `sonnet`. Keep the default model for
  decisions and cross-cutting work (Phase 0, C-1 and C-2 in Phase 4, the Phase 7
  inventory).
- **Stop cleanly.** To pause a worker, stop its script with Ctrl-C; the last
  checkpoint on the remote is its state.

### Coordination helper

`scripts/timeline/coord.sh` edits `docs/timeline/` on the coordination branch
from a separate checkout, runs the pre-commit hook, and rebases and retries if
another worker pushed first. `WORKER.md` step 3 shows its use. When Phase 0
merges, change its default branch (and `run-worker.sh`'s) to `main`.

## Vocabulary

- **Phase status:** `not-started`, `in-progress`, `blocked`, `in-review`,
  `done`.
- **Work package status:** `open`, `claimed`, `in-progress`, `blocked`,
  `in-review`, `done`.
- **Work package ID:** `P<phase>.<n>`, such as `P1.2`. Cite IDs in branch
  names, commits, PRs and log entries.
- **Parallel:** a work package marked `yes` doesn't depend on unfinished work
  packages in the same phase, so it can have its own owner.

## Protocol

### Coordination branch

All edits to `docs/timeline/` go to the **coordination branch** as small,
docs-only commits, separate from code branches. That way every agent sees
claims and progress as soon as they're pushed.

- Coordination branch: `timeline-try-2` until Phase 0 merges, then `main`.
- Before editing, pull and rebase. If a push is rejected, rebase and retry.
  Edits touch different lines, so conflicts should be rare and trivial.

### 1. Pick up work

1. Run the status board. Choose a work package that is `open`, whose phase
   dependencies are `done` (or whose own `Depends on` column is satisfied).
2. Read the phase file in full, including **Handoff notes** and the last few
   **Progress log** entries.
3. **Claim it** with `scripts/timeline/coord.sh` ([WORKER.md](WORKER.md) step 3). In the work package's section, set `- Owner:` to
   `<your-name> (<branch>)` and `- Status:` to `claimed`. If the phase was
   `not-started`, set the front matter to `in-progress`, with you as `owner`
   (the phase lead). Commit as `docs(timeline): claim P1.2`, and push **before**
   you write code.
4. Create the code branch `timeline/p<phase>-<short-name>`, such as
   `timeline/p1-geometry`. Use a separate git work tree if another agent shares
   your checkout.

### 2. Report progress

- Append an entry to the phase's **Progress log** at least whenever you finish
  a work package, get blocked, stop for the day, or open a PR. Never edit or
  delete earlier entries.
- Update your work package's `- Status:` and `- PR:` lines as they change.
- Keep **Handoff notes** current. They're what the next agent reads first:
  where things stand, what's surprising, and what not to redo.

Log entry format:

```markdown
### 2026-10-01 · <owner> · P1.2, P1.3

- **Done:** what changed, with paths and PR or commit links.
- **Checks:** each command run, and its result (pass, fail with a summary, or not run and why).
- **Next:** the next concrete step.
- **Blockers:** none, or what is needed and from whom.
```

### 3. Finish

1. Tick exit-gate items **only** after running their checks. Paste the command
   and result into the log entry. Never tick an item you didn't run.
2. Open the PR, and set the work package to `in-review` with the PR link.
3. After it merges, set it to `done`. When every work package and exit-gate
   item is done, set the phase front matter to `done`.

### Blocked, stale or abandoned work

- **Blocked:** set the work package (and the phase, if nothing else can
  proceed) to `blocked`. Say in the log exactly what is needed and from whom,
  for example "a human decision on C-8".
- **Stale claims:** a claim with no log entry and no branch activity for 3 days
  may be taken over. Append a log entry that names the previous owner, then
  re-claim it.
- **Stopping:** if you won't finish, set the work package back to `open`, and
  leave handoff notes and a pushed branch.

### Rules

- **Edit only what you own:** your work packages' Owner, Status and PR lines, your log entries, and
  the handoff notes of a phase you lead. To tell another phase something,
  append a log entry in its file headed `Cross-phase note from P<n>`.
- **Decisions don't hide in code.** Anything that changes a `C-n` decision, the
  schema, a file format, IPC or a public package API goes into the ADR and
  `implementation-plan.md` first (see `docs/conventions/architecture-decisions.md`).
- **The spec wins on the model.** If the spec seems wrong, log it as a blocker
  or open question. Don't diverge silently.
- **Verification follows** `docs/conventions/verification.md`, plus each
  phase's exit gate.
- **Commits and PRs** follow the root `AGENTS.md`, including its ban on AI
  attribution lines.
- **Don't use Markdown tables for anything agents update.** Prettier re-pads a
  whole table when one cell grows, so concurrent edits conflict. Keep mutable
  state to one field per line.
- **Human-only items** have `- Owner: human`. Agents prepare
  them but don't close them: ADR acceptance, design sign-off, QA-SC verdicts,
  and manual app checks.
