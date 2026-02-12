import type { CollectionAfterChangeHook } from 'payload'
import type { Post } from '../payload-types'

/**
 * Triggers a Cloudflare Pages deploy hook when a post's status changes,
 * so the website rebuilds and reflects published/draft changes.
 * Set WEBSITE_DEPLOY_HOOK_URL in env (or .dev.vars) for local; for Cloudflare
 * production set it as a secret: `wrangler secret put WEBSITE_DEPLOY_HOOK_URL`.
 * Omit to skip. The fetch is awaited so the Worker keeps the request alive until
 * the sub-request completes (required on Cloudflare Workers).
 *
 * Validate logs (production): From apps/cms run `pnpm exec wrangler tail --env=$CLOUDFLARE_ENV`,
 * then change a post status in the admin; look for "[triggerWebsiteRebuild]" in the stream.
 */
const LOG_PREFIX = '[triggerWebsiteRebuild]'

export const triggerWebsiteRebuild: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  console.log(LOG_PREFIX, 'hook ran', {
    docId: doc?.id,
    currentStatus: (doc as Post)?.status,
    hasPreviousDoc: previousDoc != null,
    previousStatus: previousDoc != null ? (previousDoc as Post).status : undefined,
  })
  if (context?.skipDeployHook) {
    console.log(LOG_PREFIX, 'skipped (context.skipDeployHook)')
    return doc
  }

  const currentStatus = (doc as Post).status
  const previousStatus = previousDoc != null ? (previousDoc as Post).status : undefined
  const statusChanged = previousStatus !== currentStatus
  const affectsPublishedList = currentStatus === 'published' || previousStatus === 'published'
  if (!statusChanged || !affectsPublishedList) {
    console.log(LOG_PREFIX, 'skipped (no status change affecting published)', {
      previousStatus,
      currentStatus,
    })
    return doc
  }

  const url =
    typeof process.env.WEBSITE_DEPLOY_HOOK_URL === 'string'
      ? process.env.WEBSITE_DEPLOY_HOOK_URL.trim()
      : ''
  if (!url) {
    console.error(LOG_PREFIX, 'WEBSITE_DEPLOY_HOOK_URL is not set')
    throw new Error('WEBSITE_DEPLOY_HOOK_URL is not set')
  }

  const logger = req.payload?.logger
  console.log(LOG_PREFIX, 'calling deploy hook', url.replace(/\/[^/]+$/, '/…'))
  try {
    const res = await fetch(url, { method: 'POST' })
    const msg = `deploy hook ${res.ok ? 'ok' : 'failed'}: ${res.status} ${res.statusText}`
    console.log(LOG_PREFIX, msg)
    if (!res.ok) {
      logger?.error?.(`Website deploy hook failed: ${res.status} ${res.statusText}`)
    } else {
      logger?.info?.('Website deploy hook succeeded')
    }
  } catch (err) {
    console.error(LOG_PREFIX, 'deploy hook request failed', err)
    logger?.error?.(`Website deploy hook request failed: ${err}`)
  }

  return doc
}
