# Repository Conventions

`AGENTS.md` is the canonical shared repository guidance. A tracked `CLAUDE.md`
imports the sibling guide instead of copying it. The nearest scoped guidance
supplements the root guide for files below it.

Treat package scripts and their configuration as the command source of truth.
Keep personal preferences in ignored local configuration rather than shared
instructions.

Update shared instructions when a repeated correction or review failure reveals
missing repository knowledge. Add new tooling only when repeated evidence shows
the existing guidance is insufficient.

Use these references when their condition applies:

- Read [change routing](change-routing.md) when ownership is unclear or a change
  crosses boundaries.
- Read the [verification matrix](verification.md) before selecting checks for a
  changed area.
- Read the [architecture decision policy](architecture-decisions.md) before a
  persistent or cross-boundary change.
