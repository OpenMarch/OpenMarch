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

## Public betas (0.2)

Development happens on the fork (`AlexDumo/OpenMarch-timeline`): issues, pull requests, lab tests and nightlies. Public betas are built by upstream's signed release workflow (`desktop-release.yaml`) from the upstream branch `prerelease/0.2`. That branch only receives fork `main`. Nothing is committed to it directly.

Upstream's "Branch Protections" ruleset covers `prerelease/*`. It blocks deletion and force-pushes, and needs a pull request with `all-checks-passed` and CodeQL results. That's why `pr-checks.yaml` and `codeql.yaml` also run for pull requests into `prerelease/**`.

### Cutting a beta

1. On the fork, bump `apps/desktop/package.json` to the next beta (`0.2.0-beta.2`, …) through a normal pull request into `main`.
2. Open a pull request on `OpenMarch/OpenMarch` from `AlexDumo:main` (or a fork branch at the commit you want) into `prerelease/0.2`. Wait for every check. This is a public build, so there are no exceptions.
3. Land it as a fast-forward. Upstream allows only squash merges, and squashing would make every later sync conflict with the previous one. An org admin (who bypasses the ruleset) pushes the pull request's head commit: `git push origin <sha>:refs/heads/prerelease/0.2`. GitHub then marks the pull request as merged.
4. Tag that commit and push the tag: `git tag v0.2.0-beta.N <sha> && git push origin v0.2.0-beta.N`. `desktop-release.yaml` builds, signs and notarizes the app, and uploads a draft release.
5. On the draft release, check **Set as a pre-release** (not "Set as the latest release") and publish. Then post the changes in the Discord tester channel.

### Why 0.1.7 users don't get the beta

- **Auto-update:** the app's version has a pre-release part (`-beta.N`). The auto-updater only offers pre-releases to apps that are already on a pre-release version, so 0.1.7 installs stay on 0.1.7 and beta installs move to newer betas. Both depend on the version and the pre-release flag.
- **Web editor:** `web-editor.yaml` skips pre-releases, so editor.openmarch.com stays on the latest full release.
- **Snap:** the Linux snap goes to the Snap Store's `edge` channel, which is where electron-builder publishes by default. `stable` changes only when someone promotes a build by hand.

A beta installs over a released copy on the same machine, because it uses the same app ID. Nightlies are the exception: they install as "OpenMarch Nightly".

### After the beta

0.2 goes into upstream `main` through its own pull request, fully gated.
