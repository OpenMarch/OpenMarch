'use client'

import React from 'react'

const PLACEHOLDER_SRC = '/placeholder.jpg'

type MediaValue = { url?: string | null; alt?: string | null } | number | null

export function CoverImageCell({ cellData }: { cellData: MediaValue }) {
  const url =
    cellData != null && typeof cellData === 'object' && typeof cellData.url === 'string'
      ? cellData.url
      : PLACEHOLDER_SRC
  const alt =
    cellData != null && typeof cellData === 'object' && typeof cellData.alt === 'string'
      ? cellData.alt
      : 'No cover image'

  return (
    <div style={{ width: 48, height: 32, overflow: 'hidden', borderRadius: 4 }}>
      <img
        src={url}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  )
}

export default CoverImageCell
