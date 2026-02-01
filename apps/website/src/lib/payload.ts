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
    /** Lexical rich text (stored in CMS). Use LexicalContent component for rendering. */
    content: unknown;
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
    return import.meta.env.PAYLOAD_CMS_URL as string | undefined;
}
/**
 * @param baseUrl - Optional CMS base URL (e.g. from getPayloadCmsUrl()). Pass when building URLs on the client where env may be unset.
 */
export function buildPayloadUrlFromRelativePath(
    pathOrUrl: string,
    baseUrl?: string,
): string {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://"))
        return pathOrUrl;
    const url = (baseUrl ?? getPayloadCmsUrl())?.replace(/\/$/, "");
    if (!url) throw new Error("PAYLOAD_CMS_URL is not set");
    const relativePath = pathOrUrl.startsWith("/")
        ? pathOrUrl
        : `/${pathOrUrl}`;
    return `${url}${relativePath}`;
}

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
 * @param baseUrl - Optional CMS base URL when building URLs on the client (e.g. preview page).
 */
export function getAuthorProfilePictureUrl(
    author: number | PayloadUser | null | undefined,
    baseUrl?: string,
): string | null {
    if (author == null || typeof author === "number") return null;
    const pic = author.profilePicture;
    if (pic == null) return null;
    if (typeof pic === "object" && pic.url)
        return buildPayloadUrlFromRelativePath(pic.url, baseUrl);
    return null;
}

/**
 * Get the profile picture dimensions for a post author, or undefined if none.
 */
export function getAuthorProfilePictureDimensions(
    author: number | PayloadUser | null | undefined,
): { width: number; height: number } | undefined {
    if (author == null || typeof author === "number") return undefined;
    const pic = author.profilePicture;
    if (pic == null || typeof pic !== "object") return undefined;
    if (
        typeof pic.width === "number" &&
        typeof pic.height === "number" &&
        pic.width > 0 &&
        pic.height > 0
    )
        return { width: pic.width, height: pic.height };
    return undefined;
}

/** List-item shape for a blog post from Payload (used in unified blog lists). */
export interface PayloadBlogListItem {
    source: "payload";
    id: string;
    title: string;
    author: string;
    authorProfileImageUrl: string | null;
    /** Profile picture dimensions from API, when available */
    authorProfileImageWidth?: number;
    authorProfileImageHeight?: number;
    date: Date;
    imageUrl: string;
    imageAlt: string;
    /** Cover image dimensions from API, when available */
    imageWidth?: number;
    imageHeight?: number;
}

/**
 * Parse a Payload CMS post into the shared blog list item shape.
 * Pass the placeholder image URL for fallback when the post has no cover image.
 * @param payloadCmsBaseUrl - Optional CMS base URL when building URLs on the client (e.g. preview page) where env may be unset.
 */
export function parsePayloadPostToListItem(
    p: PayloadPost,
    placeholderImageUrl: string,
    payloadCmsBaseUrl?: string,
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
    const profilePic = getAuthorProfilePictureUrl(p.author, payloadCmsBaseUrl);
    const profileDims = getAuthorProfilePictureDimensions(p.author);
    return {
        source: "payload",
        id: `payload-${p.id}`,
        title: p.title,
        author: getAuthorDisplayName(p.author),
        authorProfileImageUrl: profilePic,
        authorProfileImageWidth: profileDims?.width,
        authorProfileImageHeight: profileDims?.height,
        date,
        imageUrl: img?.url
            ? buildPayloadUrlFromRelativePath(img.url, payloadCmsBaseUrl)
            : placeholderImageUrl,
        imageAlt: img?.alt ?? p.title,
        imageWidth:
            img?.width && img?.height && img.width > 0 && img.height > 0
                ? img.width
                : undefined,
        imageHeight:
            img?.width && img?.height && img.width > 0 && img.height > 0
                ? img.height
                : undefined,
    };
}

/**
 * Fetch all published posts from Payload CMS.
 * Returns [] when CMS is unavailable (e.g. during build when CMS is not running).
 */
export async function getPayloadPosts(): Promise<PayloadPost[]> {
    if (!PAYLOAD_CMS_URL) return [];
    const base = PAYLOAD_CMS_URL.replace(/\/$/, "");
    try {
        const res = await fetch(
            `${base}/api/posts?limit=500&depth=3&sort=-createdAt&where[status][equals]=published`,
        );
        if (!res.ok) return [];
        const data = (await res.json()) as PayloadFindResponse<PayloadPost>;
        return data.docs ?? [];
    } catch {
        return [];
    }
}

/**
 * Fetch a single post by ID from Payload CMS.
 */
export async function getPayloadPost(id: string): Promise<PayloadPost | null> {
    if (!PAYLOAD_CMS_URL) return null;
    const base = PAYLOAD_CMS_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/posts/${id}?depth=3`);
    if (!res.ok) return null;
    const data = (await res.json()) as PayloadPost | null;
    return data ?? null;
}

/**
 * Fetch a single post by ID from Payload CMS via the preview endpoint.
 * Returns the post (including drafts) when the token matches PREVIEW_SECRET; null on 403/404 or other errors.
 * @param baseUrl - Optional CMS base URL (e.g. from getPayloadCmsUrl()); used when calling from client where env may be unset.
 */
export async function getPayloadPostPreview(
    id: string,
    token: string,
    baseUrl?: string,
): Promise<PayloadPost | null> {
    const base = (baseUrl ?? PAYLOAD_CMS_URL)?.replace(/\/$/, "");
    if (!base || !token) return null;
    const url = `${base}/api/posts/preview/${id}?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { doc: PayloadPost };
    return data.doc ?? null;
}
