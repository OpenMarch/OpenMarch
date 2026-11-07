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
- The stack is Electron and React for the desktop app, Zustand for UI state, TanStack Query for server state, Radix and Tailwind for styling, and Vitest and Playwright for testing.
- `apps/desktop` is the main Electron + React app; `@/*` maps to `apps/desktop/src/*` and `@om-electron/*` maps to `apps/desktop/electron/*`. Read `apps/desktop/AGENTS.md` before desktop changes.
- `apps/website` is Astro/Starlight docs and site content.
- `apps/cms` is a Next/Payload/Cloudflare app with its own `apps/cms/AGENTS.md`; read that before CMS changes.
- `packages/core`, `packages/musicxml-parser`, and `packages/ui` are publishable/shared packages built with `tsup`; `packages/ui/src/tailwind.css` is the shared style source.
- Prefer existing UI primitives in `packages/ui/src/components/base`; icons should come from `@phosphor-icons/react`.
- Match the app's visual scale instead of inventing one: theme radii (`rounded-6` surfaces, `rounded-full` buttons), theme font sizes (`text-body`, `text-sub`), and the shared popover and menu classes. Read [UI styling](docs/conventions/ui-styling.md) before building or restyling any UI.
- Read [change routing](docs/conventions/change-routing.md) when ownership is unclear or a change crosses packages.
- `docs/conventions/` holds the long-form patterns: [database interactions](docs/conventions/database-interactions.md), [transactions across tables](docs/conventions/database-transactions.md), [multi-query hooks](docs/conventions/multi-query-hooks.md), [localization](docs/conventions/localization.md), [testing](docs/conventions/testing.md), [UI styling](docs/conventions/ui-styling.md), and [troubleshooting](docs/conventions/troubleshooting.md). Read the relevant one before non-trivial work in that area.

## Verification

- Read [verification](docs/conventions/verification.md) and run its scoped checks for the changed area.
- Lint commands ending in `:check` are non-mutating; `lint` and `fix` may rewrite files.

## User guide

- The user guide (openmarch.com/guides, `apps/website/src/content/docs/guides`) describes how
  the app behaves. Read it to learn how a feature is meant to work for users.
- To read it as plain text, with labels and shortcuts filled in, build the site
  (`pnpm turbo run build --filter=@openmarch/website`) and read `apps/website/dist/llms.txt`: it lists
  one file per chapter in `dist/_llms-txt/`, and `dist/llms-full.txt` holds the whole guide.
- A change to what users see or do isn't finished until the guide says so. Before pushing it,
  update the guide's pages and recorded pictures and read the result as it renders, following
  "When the app changes" in [apps/website/AGENTS.md](apps/website/AGENTS.md); agents use the
  `user-docs` skill (`.claude/skills/user-docs`). Fill in the pull request's User guide section.
- Start with `pnpm --dir apps/website docs:impact`, which lists the pages a change may affect.

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

## Agent skills

### Issue tracker

Issues live in GitHub Issues on the fork `AlexDumo/OpenMarch-timeline`, so pass `-R AlexDumo/OpenMarch-timeline` to `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

The layout is single-context: a root `CONTEXT.md` (created lazily) plus the existing `docs/adr/`. See `docs/agents/domain.md`.
