/**
 * Payload CMS client for the Astro website.
 * Set PAYLOAD_CMS_URL (e.g. https://cms.openmarch.com or http://localhost:3001) to enable.
 */

const PAYLOAD_CMS_URL = import.meta.env.PAYLOAD_CMS_URL as string | undefined;

export interface PayloadPost {
    id: string;
    title: string;
    author: string;
    date: string;
    featuredImage: PayloadMedia | number;
    /** Lexical rich text (stored in CMS). */
    content: unknown;
    /** Markdown output of content (computed on read; use this for rendering). */
    contentMarkdown?: string;
    updatedAt: string;
    createdAt: string;
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

export function isPayloadCmsEnabled(): boolean {
    return Boolean(PAYLOAD_CMS_URL);
}

/**
 * Fetch all published posts from Payload CMS.
 */
export async function getPayloadPosts(): Promise<PayloadPost[]> {
    if (!PAYLOAD_CMS_URL) return [];
    const base = PAYLOAD_CMS_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/posts?limit=500&depth=2&sort=-date`);
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
    const res = await fetch(`${base}/api/posts/${id}?depth=2`);
    if (!res.ok) return null;
    const data = (await res.json()) as { doc: PayloadPost };
    return data.doc ?? null;
}
