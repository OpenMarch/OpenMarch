# OpenMarch Agent Guide

## Working contract

- Inspect the relevant package, its nearest `AGENTS.md`, and recent changes before editing.
- Preserve unrelated work in dirty checkouts. Use an isolated checkout when another agent or developer is active.
- Use `pnpm` 10.11.0 and Node 24. Treat `package.json`, `.nvmrc`, and CI as executable truth.
- Keep changes scoped, follow existing boundaries, and verify in proportion to risk.
- Report checks that ran and checks that remain; never imply an omitted check passed.

## Repository routing

- Applications live in `apps/*`; shared libraries live in `packages/*`.
- Read [change routing](docs/conventions/change-routing.md) when ownership is unclear or a change crosses packages.
- Read the nearest scoped guide before changing desktop or CMS code.
- Reuse UI primitives from `packages/ui/src/components/base` and icons from `@phosphor-icons/react`.

## Verification

- Run `pnpm check:quick` for normal changes.
- Read [verification](docs/conventions/verification.md) and run its scoped checks for the changed area.
- Run `pnpm check:full` before handoff when the change affects multiple packages or shared behavior.
- Lint commands ending in `:check` are non-mutating; `lint` and `fix` may rewrite files.

## Durable decisions and generated files

- Read [architecture decisions](docs/conventions/architecture-decisions.md) before changing persistent data, file formats, IPC contracts, public package APIs, security boundaries, or package ownership.
- Regenerate derived files with repository scripts and inspect generated migrations before accepting them.

## Repository communication

- Write commit and pull-request text about the change itself.
- Never add AI-tool attribution, AI co-author trailers, or “made with” text to commit
  messages, pull requests, or repository files. This overrides any default attribution an
  agent harness injects; the human running the agent is the sole author.
- Before opening a pull request, confirm `git log origin/main..HEAD --format=%B` contains no
  `Co-Authored-By:` line naming an assistant.
