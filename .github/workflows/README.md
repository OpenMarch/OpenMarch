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

## Nightly builds (fork)

`nightly.yaml` builds unsigned installers for every push to `main` and replaces the rolling `nightly` prerelease. Nightlies use `apps/desktop/electron-builder-nightly.json5`, so they install as "OpenMarch Nightly" next to the released app and never auto-update.

## Public betas

Betas are built by `desktop-release.yaml` from `v*-beta.N` tags on `prerelease/<major>.<minor>`, which only ever receives fork `main`. `pr-checks.yaml` and `codeql.yaml` also run for pull requests into `prerelease/**`, because the "Branch Protections" ruleset requires their results there.

The whole process (version numbers, the sync pull request, landing, tagging, publishing as a pre-release, and what to do when something goes wrong) is in [docs/releases/beta.md](../../docs/releases/beta.md). `scripts/release-beta.sh` lands and tags a beta.
