import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getAuthorDisplayName,
    getAuthorProfilePictureDimensions,
    getAuthorProfilePictureUrl,
    getPayloadCmsUrl,
    getPayloadPostPreview,
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
            slug: "test-post",
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

describe("getPayloadPostPreview", () => {
    const mockPost: PayloadPost = {
        id: 1,
        title: "Draft Post",
        slug: "draft-post",
        author: null,
        content: {},
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
    };

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches from preview URL with id and token", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ doc: mockPost }), { status: 200 }),
        );

        await getPayloadPostPreview("1", "secret-token");

        expect(mockFetch).toHaveBeenCalledWith(
            "http://localhost:3000/api/posts/preview/1?token=secret-token",
        );
    });

    it("uses baseUrl when provided", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ doc: mockPost }), { status: 200 }),
        );

        await getPayloadPostPreview(
            "42",
            "my-token",
            "https://cms.example.com",
        );

        expect(mockFetch).toHaveBeenCalledWith(
            "https://cms.example.com/api/posts/preview/42?token=my-token",
        );
    });

    it("returns doc from successful response", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ doc: mockPost }), { status: 200 }),
        );

        const result = await getPayloadPostPreview("1", "token");

        expect(result).toEqual(mockPost);
    });

    it("returns null when response is 403", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({}), { status: 403 }),
        );

        const result = await getPayloadPostPreview("1", "bad-token");

        expect(result).toBeNull();
    });

    it("returns null when response is 404", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({}), { status: 404 }),
        );

        const result = await getPayloadPostPreview("999", "token");

        expect(result).toBeNull();
    });

    it("returns null when token is empty and no baseUrl", async () => {
        const result = await getPayloadPostPreview("1", "");

        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("parsePayloadPostToListItem", () => {
    const placeholder = "https://example.com/placeholder.jpg";

    it("returns list item with cover image and author", () => {
        const post: PayloadPost = {
            id: 42,
            title: "Test Post",
            slug: "test-post",
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

        expect(result).toMatchObject({
            source: "payload",
            id: "2025-1-15_test-post",
            title: "Test Post",
            author: "Alice",
            authorProfileImageUrl: null,
            date: new Date("2025-01-15T12:00:00.000Z"),
            imageUrl: "https://example.com/cover.jpg",
            imageAlt: "Cover alt",
        });
        expect(result.imageWidth).toBeUndefined();
        expect(result.imageHeight).toBeUndefined();
    });

    it("uses placeholder when post has no cover image", () => {
        const post: PayloadPost = {
            id: "abc",
            title: "No Image",
            slug: "no-image",
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

    it("passes image and profile dimensions when available from API", () => {
        const post: PayloadPost = {
            id: 1,
            title: "With Dimensions",
            slug: "with-dimensions",
            author: {
                id: 2,
                email: "b@b.com",
                name: "Bob",
                profilePicture: {
                    id: "pic-1",
                    url: "/media/avatar.png",
                    alt: "Bob",
                    width: 400,
                    height: 400,
                },
            },
            coverImage: {
                id: "img-1",
                url: "/media/cover.jpg",
                alt: "Cover",
                width: 1920,
                height: 1080,
            },
            content: {},
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
        };

        const result = parsePayloadPostToListItem(post, placeholder);

        expect(result.imageWidth).toBe(1920);
        expect(result.imageHeight).toBe(1080);
        expect(result.authorProfileImageWidth).toBe(400);
        expect(result.authorProfileImageHeight).toBe(400);
    });
});

describe("getAuthorProfilePictureDimensions", () => {
    it("returns undefined for null author", () => {
        expect(getAuthorProfilePictureDimensions(null)).toBeUndefined();
    });

    it("returns undefined when profilePicture has no dimensions", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            profilePicture: { id: "1", url: "/x.jpg", alt: "" },
        };
        expect(getAuthorProfilePictureDimensions(user)).toBeUndefined();
    });

    it("returns dimensions when profilePicture has width and height", () => {
        const user: PayloadUser = {
            id: 1,
            email: "a@b.com",
            profilePicture: {
                id: "1",
                url: "/x.jpg",
                alt: "",
                width: 200,
                height: 200,
            },
        };
        expect(getAuthorProfilePictureDimensions(user)).toEqual({
            width: 200,
            height: 200,
        });
    });
});
