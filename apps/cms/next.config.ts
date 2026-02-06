import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { withPayload } from '@payloadcms/next/withPayload'

// Local dev: use Wrangler platform proxy with local D1/R2 (no Cloudflare login required)
void initOpenNextCloudflareForDev({
  persist: { path: '.wrangler/state' },
  remoteBindings: false,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: ['jose', 'pg-cloudflare'],

  // Silence SASS deprecation warnings from @payloadcms/ui and custom SCSS
  // (Future import deprecation, legacy @import → @use migration)
  sassOptions: {
    silenceDeprecations: ['import', 'global-builtin'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: 'raw.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },

  // Your Next.js config here
  webpack: (webpackConfig: any) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
