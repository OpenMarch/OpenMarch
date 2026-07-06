import type { ImageMetadata } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import placeholderImage from "@/content/blog/placeholder.jpg";
import {
    getPayloadPosts,
    isPayloadCmsEnabled,
    parsePayloadPostToListItem,
    type PayloadBlogListItem,
} from "@/lib/payload";

type Blog = CollectionEntry<"blog">;

export type BlogListItem =
    | {
          source: "content";
          id: string;
          title: string;
          author: string;
          authorProfileImageUrl?: never;
          date: Date;
          imageMetadata: ImageMetadata;
      }
    | PayloadBlogListItem;

export interface BlogPreviewFeedItem {
    id: string;
    title: string;
    author: string;
    date: string;
    imageUrl: string;
    imageAlt: string;
    url: string;
}

export async function getBlogListItems(): Promise<BlogListItem[]> {
    const contentBlogs = await getCollection("blog");
    const payloadPosts = isPayloadCmsEnabled() ? await getPayloadPosts() : [];

    return [
        ...contentBlogs.map((b: Blog) => ({
            source: "content" as const,
            id: b.id,
            title: b.data.title,
            author: b.data.author,
            date: b.data.date,
            imageMetadata: b.data.image as ImageMetadata,
        })),
        ...payloadPosts.map((p) =>
            parsePayloadPostToListItem(p, placeholderImage.src),
        ),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function toBlogPreviewFeedItem(
    blog: BlogListItem,
    baseUrl = "https://openmarch.com",
): BlogPreviewFeedItem {
    const imageUrl =
        blog.source === "content" ? blog.imageMetadata.src : blog.imageUrl;

    return {
        id: blog.id,
        title: blog.title,
        author: blog.author,
        date: blog.date.toISOString(),
        imageUrl: new URL(imageUrl, baseUrl).toString(),
        imageAlt: blog.source === "content" ? "" : blog.imageAlt,
        url: new URL(`/blog/${blog.id}`, baseUrl).toString(),
    };
}
