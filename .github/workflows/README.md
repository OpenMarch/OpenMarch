# Workflow notes

## Releasing OpenMarch

All of the other release requirements for each platform and GitHub are defined in the `build_and_release.yaml` workflow.

### Snapcraft

Using [these instructions](https://snapcraft.io/docs/snapcraft-authentication) to create credentials, set the `SNAPCRAFT_STORE_CREDENTIALS` environment variable to the contents of this file.

```bash
snapcraft login

snapcraft export-login <credentials-filename>

# Add the contents of this new file to the github secret `SNAPCRAFT_STORE_CREDENTIALS`
```

> NOTE - These credentials expire after one year

## Nightly builds

`nightly.yaml` builds installers for every push to `main` into one rolling prerelease. Nightlies use `apps/desktop/electron-builder-nightly.json5`, so they install as "OpenMarch Nightly" next to the released app.

- In OpenMarch/OpenMarch they're signed and notarized like releases (the same Apple and Azure secrets as `desktop-release.yaml`) and update themselves from the release `v0.0.0-nightly`: its `nightly-*.yml` files are their update feed. The tag has to stay a semver prerelease, because beta builds read the same release list and skip only custom prerelease channels ([ADR 0014](../../docs/adr/0014-desktop-updates.md)).
- Anywhere else (a fork, without the secrets) they're unsigned (`electron-builder-nightly-unsigned.json5`), go to a release tagged `nightly`, and never auto-update.

Each run uploads the new files, then the feed, then deletes the previous build's files, so a nightly that is mid-download keeps finding its file.

## Public betas

Betas are built by `desktop-release.yaml` from `v*-beta.N` tags on `prerelease/<major>.<minor>`, which only ever receives fork `main`. `pr-checks.yaml` and `codeql.yaml` also run for pull requests into `prerelease/**`, because the "Branch Protections" ruleset requires their results there.

The whole process (version numbers, the sync pull request, landing, tagging, publishing as a pre-release, and what to do when something goes wrong) is in [docs/releases/beta.md](../../docs/releases/beta.md). `scripts/release-beta.sh` lands and tags a beta.

## User guide media refresh

`docs-media.yaml` records the user guide's pictures and clips again every Monday, on pushes to `prerelease/**` that touch the app, and by hand (Actions → User guide media refresh → Run workflow, optionally with "all" or a list of shots). It runs only on the fork. It records the shots whose files changed since each was last recorded and the ones the last refresh couldn't finish, except on the first Monday of the month, when it records all of them. Runs on `main` open one pull request (`docs/media-refresh/main`) with the pictures that visibly changed, and issues for the shots that no longer record. Pushes to `prerelease/**`, other branches and runs of chosen shots only report, in the run summary and artifacts. How it decides is in `apps/desktop/scripts/docs-media/refresh.mjs` and `apps/website/AGENTS.md`.

It needs the repository setting "Allow GitHub Actions to create and approve pull requests". Pull requests opened with the workflow's own token don't start the PR checks; add a `DOCS_MEDIA_TOKEN` secret (a fine-grained token with contents, pull requests and issues write) to have them run without a manual push.
