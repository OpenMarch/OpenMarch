import type { CollectionAfterChangeHook } from 'payload'
import type { Post } from '../payload-types'

/**
 * Triggers a Cloudflare Pages deploy hook when a post's status changes,
 * so the website rebuilds and reflects published/draft changes.
 * Set WEBSITE_DEPLOY_HOOK_URL in env (or .dev.vars) to enable; omit to skip.
 */
export const triggerWebsiteRebuild: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  if (context?.skipDeployHook) return doc

  const currentStatus = (doc as Post).status
  const previousStatus = previousDoc != null ? (previousDoc as Post).status : undefined
  const statusChanged = previousStatus !== currentStatus
  const affectsPublishedList = currentStatus === 'published' || previousStatus === 'published'
  if (!statusChanged || !affectsPublishedList) return doc

  const url =
    typeof process.env.WEBSITE_DEPLOY_HOOK_URL === 'string'
      ? process.env.WEBSITE_DEPLOY_HOOK_URL.trim()
      : ''
  if (!url) return doc

  const logger = req.payload?.logger
  fetch(url, { method: 'POST' })
    .then((res) => {
      if (!res.ok) {
        logger?.error?.(`Website deploy hook failed: ${res.status} ${res.statusText}`)
      }
    })
    .catch((err) => {
      logger?.error?.(`Website deploy hook request failed: ${err}`)
    })

  return doc
}
