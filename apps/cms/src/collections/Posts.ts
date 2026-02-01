import type { CollectionConfig } from 'payload'
import {
  BlocksFeature,
  HeadingFeature,
  LinkFeature,
  lexicalEditor,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import { slugField } from 'payload'
import { YouTubeBlock } from '../blocks/YouTube'
import { triggerWebsiteRebuild } from '../hooks/triggerWebsiteRebuild'

/** Origins allowed for CORS on the blog preview endpoint (openmarch.com + localhost). */
const PREVIEW_CORS_ORIGINS = new Set([
  'https://openmarch.com',
  'https://www.openmarch.com',
  'http://localhost:4321',
  'http://localhost:3000',
])

function getPreviewCorsHeaders(req: {
  headers?: { get?: (name: string) => string | null }
}): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Preview-Token')
  const origin = typeof req.headers?.get === 'function' ? (req.headers.get('origin') ?? null) : null
  if (origin && PREVIEW_CORS_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  return headers
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'status', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (user) return true
      return { status: { equals: 'published' } }
    },
  },
  hooks: {
    afterChange: [triggerWebsiteRebuild],
  },
  endpoints: [
    {
      path: '/preview/:id',
      method: 'options',
      handler: async (req) => {
        const headers = getPreviewCorsHeaders(req)
        headers.set('Access-Control-Max-Age', '86400')
        return new Response(null, { status: 204, headers })
      },
    },
    {
      path: '/preview/:id',
      method: 'get',
      handler: async (req) => {
        const corsHeaders = getPreviewCorsHeaders(req)
        const id = req.routeParams?.id
        let token: string | undefined
        if (typeof req.headers?.get === 'function') {
          token = req.headers.get('x-preview-token') ?? undefined
        }
        if (!token && req.url) {
          const queryIndex = req.url.indexOf('?')
          const search = queryIndex >= 0 ? req.url.slice(queryIndex) : ''
          token = new URLSearchParams(search).get('token') ?? undefined
        }
        const secret = process.env.PREVIEW_SECRET
        const normalizedSecret =
          typeof secret === 'string' ? secret.trim().replace(/^"|"$/g, '') : ''
        if (!token || !normalizedSecret || token.trim() !== normalizedSecret) {
          return Response.json(
            { error: 'Invalid or missing preview token' },
            { status: 403, headers: corsHeaders },
          )
        }
        if (!id) {
          return Response.json({ error: 'Missing post id' }, { status: 400, headers: corsHeaders })
        }
        const doc = await req.payload.findByID({
          collection: 'posts',
          id: id as string,
          depth: 3,
          overrideAccess: true,
        })
        if (!doc) {
          return Response.json({ error: 'Post not found' }, { status: 404, headers: corsHeaders })
        }
        return Response.json({ doc }, { headers: corsHeaders })
      },
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      ...slugField({ fieldToUse: 'title' }),
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          HeadingFeature({
            enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'],
          }),
          LinkFeature({
            enabledCollections: ['posts'],
          }),
          UploadFeature({
            collections: {
              media: {
                fields: [],
              },
            },
          }),
          BlocksFeature({
            blocks: [YouTubeBlock],
          }),
        ],
        admin: {
          placeholder: 'Write your content here... Use "/" for slash commands.',
        },
      }),
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      defaultValue: 'draft',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'previewLink',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: '/components/PostPreviewLink',
        },
      },
    },
  ],
  timestamps: true,
}
