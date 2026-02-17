'use client'

import React from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

const DEFAULT_SITE_URL = 'https://openmarch.com'

export default function PostPreviewLink() {
  const { id } = useDocumentInfo()
  const siteUrl =
    typeof process !== 'undefined' && process.env?.WEBSITE_URL
      ? process.env.WEBSITE_URL
      : DEFAULT_SITE_URL
  const previewPath = `${siteUrl.replace(/\/$/, '')}/blog/preview?id=${id}`

  if (id == null) return null

  return (
    <div style={{ marginTop: 8 }}>
      <a href={previewPath} rel="noopener noreferrer" target="_blank" style={{ fontSize: 13 }}>
        Preview on site
      </a>
      <p
        style={{
          marginTop: 4,
          fontSize: 11,
          color: 'var(--theme-elevation-500)',
        }}
      >
        {"Add '&token={YOUR_PREVIEW_SECRET}' to the URL to view drafts."}
      </p>
    </div>
  )
}
