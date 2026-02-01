/**
 * Payload CMS client for the Astro website.
 * Set PAYLOAD_CMS_URL (e.g. https://cms.openmarch.com or http://localhost:3001) to enable.
 */

const PAYLOAD_CMS_URL = import.meta.env.PAYLOAD_CMS_URL as string | undefined;

/** Populated author from API when depth >= 1 */
export interface PayloadUser {
    id: number;
    email: string;
    name?: string | null;
    profilePicture?: number | PayloadMedia | null;
}

export interface PayloadPost {
    id: string | number;
    title: string;
    /** Author ID or populated User object (when depth >= 1) */
    author: number | PayloadUser | null;
    /** Cover image (CMS field: coverImage). */
    coverImage?: PayloadMedia | number | null;
    /** Lexical rich text (stored in CMS). */
    content: unknown;
    /** Markdown output of content (computed on read; use this for rendering). */
    contentMarkdown?: string;
    updatedAt: string;
    createdAt: string;
    /** @deprecated Use createdAt instead */
    date?: string;
}

export interface PayloadMedia {
    id: string;
    url: string;
    alt: string;
    width?: number;
    height?: number;
    mimeType?: string;
}

export interface PayloadFindResponse<T> {
    docs: T[];
    totalDocs: number;
    limit: number;
    totalPages: number;
    page: number;
    pagingCounter: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
    prevPage: number | null;
    nextPage: number | null;
}

export function getPayloadCmsUrl(): string | undefined {
    return PAYLOAD_CMS_URL;
}
const buildPayloadUrlFromRelativePath = (relativePath: string) => {
    let url = getPayloadCmsUrl();
    if (!url) throw new Error("PAYLOAD_API_URL is not set");
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (relativePath.startsWith("/")) relativePath = "/" + relativePath;
    return `${url}${relativePath}`;
};

export function isPayloadCmsEnabled(): boolean {
    return Boolean(PAYLOAD_CMS_URL);
}

/**
 * Get the display name for a post author (name, email, or fallback).
 */
export function getAuthorDisplayName(
    author: number | PayloadUser | null | undefined,
): string {
    if (author == null) return "Unknown";
    if (typeof author === "number") return String(author);
    return author.name?.trim() || author.email || "Unknown";
}

/**
 * Get the profile picture URL for a post author, or null if none.
 */
export function getAuthorProfilePictureUrl(
    author: number | PayloadUser | null | undefined,
): string | null {
    if (author == null || typeof author === "number") return null;
    const pic = author.profilePicture;
    if (pic == null) return null;
    if (typeof pic === "object" && pic.url)
        return buildPayloadUrlFromRelativePath(pic.url);
    return null;
}

/** List-item shape for a blog post from Payload (used in unified blog lists). */
export interface PayloadBlogListItem {
    source: "payload";
    id: string;
    title: string;
    author: string;
    authorProfileImageUrl: string | null;
    date: Date;
    imageUrl: string;
    imageAlt: string;
}

/**
 * Parse a Payload CMS post into the shared blog list item shape.
 * Pass the placeholder image URL for fallback when the post has no cover image.
 */
export function parsePayloadPostToListItem(
    p: PayloadPost,
    placeholderImageUrl: string,
): PayloadBlogListItem {
    const img =
        typeof p.coverImage === "object"
            ? (p.coverImage as PayloadMedia | null)
            : null;
    const createdAt = p.createdAt;
    const date =
        typeof createdAt === "string"
            ? new Date(createdAt)
            : new Date(createdAt);
    return {
        source: "payload",
        id: `payload-${p.id}`,
        title: p.title,
        author: getAuthorDisplayName(p.author),
        authorProfileImageUrl: getAuthorProfilePictureUrl(p.author),
        date,
        imageUrl: img?.url
            ? buildPayloadUrlFromRelativePath(img.url)
            : placeholderImageUrl,
        imageAlt: img?.alt ?? p.title,
    };
}

/**
 * Fetch all published posts from Payload CMS.
 */
export async function getPayloadPosts(): Promise<PayloadPost[]> {
    if (!PAYLOAD_CMS_URL) return [];
    const base = PAYLOAD_CMS_URL.replace(/\/$/, "");
    const res = await fetch(
        `${base}/api/posts?limit=500&depth=3&sort=-createdAt&where[status][equals]=published`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as PayloadFindResponse<PayloadPost>;
    return data.docs ?? [];
}

/**
 * Fetch a single post by ID from Payload CMS.
 */
export async function getPayloadPost(id: string): Promise<PayloadPost | null> {
    if (!PAYLOAD_CMS_URL) return null;
    const base = PAYLOAD_CMS_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/posts/${id}?depth=3`);
    if (!res.ok) return null;
    const data = (await res.json()) as { doc: PayloadPost };
    return data.doc ?? null;
}
