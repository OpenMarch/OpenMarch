import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'

import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => {
  const p = realpath(value)
  return Boolean(p && p.endsWith(path.join('payload', 'bin.js')))
})
const isProduction = process.env.NODE_ENV === 'production'
const payloadSecret = process.env.PAYLOAD_SECRET ?? ''
if (isProduction && !payloadSecret) {
  throw new Error('PAYLOAD_SECRET is required in production')
}
// Use local bindings (no Cloudflare login) for dev and when CLOUDFLARE_LOCAL=1 (e.g. local build or CI without remote).
const useLocalBindings = !isProduction || process.env.CLOUDFLARE_LOCAL === '1'
const useWranglerProxy = isCLI || !isProduction || process.env.CLOUDFLARE_LOCAL === '1'

const cloudflare = useWranglerProxy
  ? await getCloudflareContextFromWrangler(!useLocalBindings)
  : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Posts],
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  plugins: [
    r2Storage({
      // Cloudflare's R2Bucket (wrangler) and @payloadcms/storage-r2 types disagree on
      // R2GetOptions/R2Range; runtime is compatible. Cast to satisfy typecheck.
      bucket: cloudflare.env.R2 as never,
      collections: { media: true },
    }),
  ],
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(remoteBindings: boolean): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings,
        persist: { path: '.wrangler/state' },
      } satisfies GetPlatformProxyOptions),
  )
}
