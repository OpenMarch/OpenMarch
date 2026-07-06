import { getBlogListItems, toBlogPreviewFeedItem } from "@/lib/blogs";

export async function GET() {
    const posts = (await getBlogListItems())
        .slice(0, 4)
        .map((post) => toBlogPreviewFeedItem(post));

    return new Response(JSON.stringify({ posts }), {
        headers: {
            "Content-Type": "application/json",
        },
    });
}
