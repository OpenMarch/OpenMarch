# Verification Matrix

Run commands from the repository root. Start normal work with `pnpm check:quick`
and add every check required by the changed area. Use `pnpm check:full` before
handoff when a change affects multiple packages or shared behavior.

| Changed area                  | Required verification                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructions or documentation | `pnpm check:agent-guidance`; `pnpm exec prettier --check <changed-Markdown-paths>`; `pnpm exec cspell --no-must-find-files <changed-Markdown-paths>`                                                                                      |
| Website                       | `pnpm --dir apps/website run build`; `pnpm --dir apps/website run test`                                                                                                                                                                   |
| Shared package                | `pnpm --dir packages/<package> run build`; `pnpm --dir packages/<package> run test` when that package defines tests; build and test affected consumers                                                                                    |
| Desktop renderer              | `pnpm --dir apps/desktop exec tsc --noEmit`; `pnpm --dir apps/desktop run test:focused <relative-test-file>`                                                                                                                              |
| Database or history           | `pnpm --dir apps/desktop run test:focused <relative-test-file>` for database behavior; `pnpm --dir apps/desktop run test:history <relative-test-file> --silent` for undo/redo behavior                                                    |
| Schema migration              | `pnpm --dir apps/desktop run migrate`; inspect the generated SQL for incorrect column copies; launch the desktop app and open an older `.dots` file                                                                                       |
| Electron user workflow        | `pnpm --dir apps/desktop run build:electron`; `pnpm --dir apps/desktop run e2e <relative-spec-file>`                                                                                                                                      |
| CMS                           | Run `pnpm --dir apps/cms run generate:types` after Payload schema changes and `pnpm --dir apps/cms run generate:importmap` after admin component changes; then `pnpm --dir apps/cms exec tsc --noEmit` and `pnpm --dir apps/cms run test` |

Playwright exercises a production Electron build, so `build:electron` must
complete before an Electron end-to-end test. Report manual checks and any
command omitted because it needs credentials, external services, or an
unsupported environment.
