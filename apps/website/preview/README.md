# preview.openmarch.com

The website and the web editor for the version being tested, on one domain:

| Site                         | Built from                         | What                                                    |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------- |
| openmarch.com                | upstream `main` (Cloudflare Pages) | The released version's website and docs                 |
| preview.openmarch.com        | the current `prerelease/*` branch  | This: website and docs at `/`, web editor at `/editor/` |
| editor-nightly.openmarch.com | `main`                             | The web editor as merged                                |

Desktop pre-release builds (`0.2.0-beta.1`, nightlies) link here for Help, guides
and file-error pages (`apps/desktop/src/global/siteUrl.ts`). Released builds link
to openmarch.com.

## What's different from openmarch.com

- `SITE_CHANNEL=preview` (`astro.config.mjs`): `site` is preview.openmarch.com,
  there's no analytics, the download buttons point at the release
  `v<apps/desktop version>` instead of the latest one, and the release list
  includes pre-releases.
- The editor is built with `WEB_CHANNEL=preview` and `WEB_BASE=/editor/`. Its
  browser storage is separate from editor.openmarch.com's, because it's a
  different domain.
- `assemble.mjs` copies the editor into `dist/editor/` and writes the root
  `_headers` (`X-Robots-Tag: noindex`) and a `robots.txt` that blocks
  everything. It also adds a small "Preview · <version>" badge, linking to
  openmarch.com, to every website page.

Links in the docs should be relative (`/guides/...`), so they stay on whichever
site you're reading.

## Build

```bash
apps/website/preview/build.sh   # from anywhere; output in apps/website/dist
```

## Cloudflare setup (once)

In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a
repository** and pick `OpenMarch/OpenMarch`. Then:

- **Worker name:** `openmarch-preview` (must match `wrangler.jsonc`).
- **Production branch:** `prerelease/0.2`. Change it when the next
  `prerelease/*` branch starts.
- **Builds for non-production branches:** off.
- **Root directory:** the repository root.
- **Build command:** `apps/website/preview/build.sh`
- **Deploy command:** `pnpm --filter @openmarch/desktop exec wrangler deploy -c ../website/preview/wrangler.jsonc`
- **Build variables:** `NODE_VERSION=24`, plus `PAYLOAD_CMS_URL` with the same
  value as the openmarch.com build, so the blog and other CMS pages build.

The custom domain `preview.openmarch.com` comes from `routes` in
`wrangler.jsonc` on the first deploy.

## Between releases

When the pre-release ships, either point the Worker at the next `prerelease/*`
branch or have `/` say that there's no preview right now. Don't move it to
another domain: testers' web editor shows are stored in the browser for this
domain.
