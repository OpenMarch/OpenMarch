---
name: 3d-work
description: Pick up, resume or finish a 3D View work package (P<phase>.<n>) from docs/3d. Use when asked to work on 3D View, continue 3D work, or run a 3D View work package.
argument-hint: "[P<phase>.<n>]"
---

Follow `docs/3d/WORKER.md` exactly, for work package `$ARGUMENTS`. If no ID
was given, choose one as that file's step 2 describes.

That file is the source of truth; this skill only points to it, so every tool
and person runs the same procedure. Checkpoint as it says, and end with its
`VIEW3D-STATUS:` line.
