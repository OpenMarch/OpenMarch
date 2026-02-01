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

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'status', 'createdAt'],
  },
  access: {
    read: () => true,
  },
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
  ],
  timestamps: true,
}
