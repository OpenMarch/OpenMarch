# OpenMarch Agent Guide

## Working contract

- Inspect the relevant package, its nearest `AGENTS.md`, and recent changes before editing.
- Preserve unrelated work in dirty checkouts. Use an isolated checkout when another agent or developer is active.
- Keep changes scoped, follow existing boundaries, and verify in proportion to risk.
- Report checks that ran and checks that remain; never imply an omitted check passed.

## Runtime And Commands

- Use `pnpm`; the root `package.json` pins `pnpm@10.11.0` and CI/package engines use Node 24. Root `engines`, `.nvmrc`, and GitHub Actions are the executable source of truth.
- Install with `pnpm install`. CI uses `pnpm install --no-frozen-lockfile` in PR checks.
- Root shortcuts are Turbo filters: `pnpm desktop dev`, `pnpm site dev`, and `pnpm ui dev`.
- Run `pnpm check:quick` for normal changes, and `pnpm check:full` before handoff when a change affects multiple packages or shared behavior.
- Root PR checks run `pnpm format:check`, `pnpm lint`, and `pnpm spellcheck`; desktop/package changes also run `pnpm build`, `pnpm test`, desktop history tests, e2e, and Electron builds.
- Many lint scripts run with `--fix`; use `pnpm format:check` when you need a non-mutating format check, and lint commands ending in `:check` for a non-mutating lint.

## Repo Shape

- This is a pnpm/Turbo monorepo: `apps/*` and `packages/*` are workspace packages.
- `apps/desktop` is the main Electron + React app; `@/*` maps to `apps/desktop/src/*` and `@om-electron/*` maps to `apps/desktop/electron/*`. Read `apps/desktop/AGENTS.md` before desktop changes.
- `apps/website` is Astro/Starlight docs and site content.
- `apps/cms` is a Next/Payload/Cloudflare app with its own `apps/cms/AGENTS.md`; read that before CMS changes.
- `packages/core`, `packages/musicxml-parser`, and `packages/ui` are publishable/shared packages built with `tsup`; `packages/ui/src/tailwind.css` is the shared style source.
- Prefer existing UI primitives in `packages/ui/src/components/base`; icons should come from `@phosphor-icons/react`.
- Read [change routing](docs/conventions/change-routing.md) when ownership is unclear or a change crosses packages.

## Verification

- Read [verification](docs/conventions/verification.md) and run its scoped checks for the changed area.
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
