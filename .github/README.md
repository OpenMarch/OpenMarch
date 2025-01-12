# Workflow notes

## Releasing OpenMarch

### Snapcraft

Using [these instructions](https://snapcraft.io/docs/snapcraft-authentication) to create credentials, set the `SNAPCRAFT_STORE_CREDENTIALS` environment variable to the contents of this file.

```bash
snapcraft login

snapcraft export-login <credentials-filename>

# Add the contents of this new file to the github secret `SNAPCRAFT_STORE_CREDENTIALS`
```

> NOTE - These credentials expire after one year
