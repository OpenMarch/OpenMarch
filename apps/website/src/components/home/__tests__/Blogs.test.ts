import { getContainerRenderer as reactContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Blogs from "../Blogs.astro";

vi.mock("@/lib/payload", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/payload")>();
    return {
        ...actual,
        getPayloadPosts: vi.fn(),
        isPayloadCmsEnabled: vi.fn(),
    };
});

vi.mock("astro:content", () => ({
    getCollection: vi.fn().mockResolvedValue([]),
}));

const { getPayloadPosts, isPayloadCmsEnabled } = await import("@/lib/payload");

describe("Blogs (integration)", () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>;

    beforeEach(async () => {
        const renderers = await loadRenderers([reactContainerRenderer()]);
        container = await AstroContainer.create({ renderers });
        vi.mocked(isPayloadCmsEnabled).mockReturnValue(true);
        vi.mocked(getPayloadPosts).mockResolvedValue([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders blogs section when payload posts are present with correct title, author, and image", async () => {
        vi.mocked(getPayloadPosts).mockResolvedValue([
            {
                id: 1,
                title: "CMS Test Post",
                slug: "cms-test-post",
                author: { id: 1, email: "a@b.com", name: "Alice Author" },
                coverImage: {
                    id: "1",
                    url: "https://example.com/cover.jpg",
                    alt: "Cover",
                },
                content: {},
                createdAt: "2025-01-15T00:00:00.000Z",
                updatedAt: "2025-01-15T00:00:00.000Z",
            },
        ]);

        const result = await container.renderToString(Blogs);

        expect(result).toContain("CMS Test Post");
        expect(result).toContain("Alice Author");
        expect(result).toContain("https://example.com/cover.jpg");
        expect(result).toContain("2025-1-15_cms-test-post");
    });

    it("shows nothing from CMS when no payload posts are present", async () => {
        vi.mocked(getPayloadPosts).mockResolvedValue([]);

        const result = await container.renderToString(Blogs);

        expect(result).not.toMatch(/href="[^"]*payload-\d+[^"]*"/);
    });
});
