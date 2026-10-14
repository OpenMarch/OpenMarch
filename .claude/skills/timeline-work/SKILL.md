---
name: timeline-work
description: Pick up, resume or finish a timeline work package (P<phase>.<n>) from docs/timeline. Use when asked to work on the timeline project, continue timeline work, or run a timeline work package.
argument-hint: "[P<phase>.<n>]"
---

Follow `docs/timeline/WORKER.md` exactly, for work package `$ARGUMENTS`. If no
ID was given, choose one as that file's step 2 describes.

That file is the source of truth; this skill only points to it, so every tool
and person runs the same procedure. Checkpoint as it says, and end with its
`TIMELINE-STATUS:` line.

Don't run the full test suite yourself (`pnpm test`, `pnpm check:full`, all of
`test:history` or e2e): the PR checks run it. Run the type check and focused
tests for the files you change, push, then read the PR checks.
