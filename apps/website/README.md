# Website

Here is our public facing website and documentation for the app.

```bash
pnpm site dev
```

## Building with Payload CMS

When Payload CMS is enabled (via `PAYLOAD_CMS_URL`), the site fetches blog posts and images from the CMS. Astro optimizes remote Payload images at **build time** (resize, WebP/AVIF conversion, lazy loading). Ensure:

- `PAYLOAD_CMS_URL` is set during `astro build` (e.g. production CMS URL in CI)
- The CMS is reachable from the build environment (no firewall blocking)

If the CMS is unreachable during build, image optimization will fail for Payload-sourced images.

## Docs

We use Starlight for the docs.
To edit our docs/guides, go to `src/content/docs/guides`, and learn more about the Starlight components [here](https://starlight.astro.build/components/using-components/).
