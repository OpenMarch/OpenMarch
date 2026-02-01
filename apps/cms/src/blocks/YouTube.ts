import type { Block } from 'payload'

export const YouTubeBlock: Block = {
  slug: 'youtube',
  labels: { singular: 'YouTube Embed', plural: 'YouTube Embeds' },
  fields: [
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: {
        description:
          'Paste a YouTube URL (e.g. https://www.youtube.com/watch?v=..., https://youtu.be/...)',
      },
    },
  ],
}
