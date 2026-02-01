import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getAuthorDisplayName,
    getAuthorProfilePictureUrl,
    getPayloadCmsUrl,
    getPayloadPosts,
    isPayloadCmsEnabled,
    parsePayloadPostToListItem,
    type PayloadFindResponse,
    type PayloadPost,
    type PayloadUser,
} from "../payload";

describe("getAuthorDisplayName", () => {
    it("returns Unknown for null", () => {
        expect(getAuthorDisplayName(null)).toBe("Unknown");
    });

    it("returns Unknown for undefined", () => {
        expect(getAuthorDisplayName(undefined)).toBe("Unknown");
    });

    it("returns stringified ID for numeric author", () => {
        expect(getAuthorDisplayName(42)).toBe("42");
    });

    it("returns name when present", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            name: "Alice",
        };
        expect(getAuthorDisplayName(user)).toBe("Alice");
    });

    it("trims whitespace from name", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            name: "  Bob  ",
        };
        expect(getAuthorDisplayName(user)).toBe("Bob");
    });

    it("falls back to email when name is empty", () => {
        const user: PayloadUser = {
            id: 1,
            email: "test@example.com",
            name: "",
        };
        expect(getAuthorDisplayName(user)).toBe("test@example.com");
    });

    it("falls back to email when name is null", () => {
        const user: PayloadUser = {
            id: 1,
            email: "test@example.com",
            name: null,
        };
        expect(getAuthorDisplayName(user)).toBe("test@example.com");
    });

    it("returns Unknown when name and email are missing", () => {
        const user: PayloadUser = {
            id: 1,
            email: "",
        };
        expect(getAuthorDisplayName(user)).toBe("Unknown");
    });
});

describe("getAuthorProfilePictureUrl", () => {
    it("returns null for null author", () => {
        expect(getAuthorProfilePictureUrl(null)).toBeNull();
    });

    it("returns null for undefined author", () => {
        expect(getAuthorProfilePictureUrl(undefined)).toBeNull();
    });

    it("returns null for numeric author (unpopulated)", () => {
        expect(getAuthorProfilePictureUrl(1)).toBeNull();
    });

    it("returns null when profilePicture is null", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            profilePicture: null,
        };
        expect(getAuthorProfilePictureUrl(user)).toBeNull();
    });

    it("returns null when profilePicture is a number (unpopulated)", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            profilePicture: 5,
        };
        expect(getAuthorProfilePictureUrl(user)).toBeNull();
    });

    it("returns url when profilePicture is populated object", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            profilePicture: {
                id: "1",
                url: "https://example.com/avatar.jpg",
                alt: "Avatar",
            },
        };
        expect(getAuthorProfilePictureUrl(user)).toBe(
            "https://example.com/avatar.jpg",
        );
    });
});

describe("isPayloadCmsEnabled / getPayloadCmsUrl", () => {
    it("isPayloadCmsEnabled returns true when PAYLOAD_CMS_URL is set", () => {
        expect(isPayloadCmsEnabled()).toBe(true);
    });

    it("getPayloadCmsUrl returns the CMS URL", () => {
        expect(getPayloadCmsUrl()).toBe("http://localhost:3000");
    });
});

describe("getPayloadPosts", () => {
    const mockPosts: PayloadPost[] = [
        {
            id: 1,
            title: "Test Post",
            author: null,
            content: {},
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
        },
    ];

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches from correct URL", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(
                JSON.stringify({
                    docs: [],
                    totalDocs: 0,
                    limit: 500,
                    totalPages: 0,
                    page: 1,
                    pagingCounter: 0,
                    hasPrevPage: false,
                    hasNextPage: false,
                    prevPage: null,
                    nextPage: null,
                } satisfies PayloadFindResponse<PayloadPost>),
                { status: 200 },
            ),
        );

        await getPayloadPosts();

        expect(mockFetch).toHaveBeenCalledWith(
            "http://localhost:3000/api/posts?limit=500&depth=3&sort=-createdAt&where[status][equals]=published",
        );
    });

    it("returns docs from successful response", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(
                JSON.stringify({
                    docs: mockPosts,
                    totalDocs: 1,
                    limit: 500,
                    totalPages: 1,
                    page: 1,
                    pagingCounter: 0,
                    hasPrevPage: false,
                    hasNextPage: false,
                    prevPage: null,
                    nextPage: null,
                } satisfies PayloadFindResponse<PayloadPost>),
                { status: 200 },
            ),
        );

        const result = await getPayloadPosts();

        expect(result).toEqual(mockPosts);
    });

    it("returns empty array when response is not ok", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({}), { status: 500 }),
        );

        const result = await getPayloadPosts();

        expect(result).toEqual([]);
    });
});

describe("parsePayloadPostToListItem", () => {
    const placeholder = "https://example.com/placeholder.jpg";

    it("returns list item with cover image and author", () => {
        const post: PayloadPost = {
            id: 42,
            title: "Test Post",
            author: {
                id: 1,
                email: "a@b.com",
                name: "Alice",
            },
            coverImage: {
                id: "img-1",
                url: "https://example.com/cover.jpg",
                alt: "Cover alt",
            },
            content: {},
            createdAt: "2025-01-15T12:00:00.000Z",
            updatedAt: "2025-01-15T12:00:00.000Z",
        };

        const result = parsePayloadPostToListItem(post, placeholder);

        expect(result).toEqual({
            source: "payload",
            id: "payload-42",
            title: "Test Post",
            author: "Alice",
            authorProfileImageUrl: null,
            date: new Date("2025-01-15T12:00:00.000Z"),
            imageUrl: "https://example.com/cover.jpg",
            imageAlt: "Cover alt",
        });
    });

    it("uses placeholder when post has no cover image", () => {
        const post: PayloadPost = {
            id: "abc",
            title: "No Image",
            author: null,
            content: {},
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
        };

        const result = parsePayloadPostToListItem(post, placeholder);

        expect(result.imageUrl).toBe(placeholder);
        expect(result.imageAlt).toBe("No Image");
        expect(result.author).toBe("Unknown");
    });
});
