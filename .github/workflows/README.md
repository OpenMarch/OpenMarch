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
