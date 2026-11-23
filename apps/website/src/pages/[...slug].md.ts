import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
// The same HTML-to-Markdown conversion that writes llms-full.txt, so a page's Markdown copy
// matches its part of that file: labels and shortcuts as text, one copy of each picture. The
// plugin doesn't export it, so import the file itself; check this still resolves after
// upgrading starlight-llms-txt.
import { entryToSimpleMarkdown } from "../../node_modules/starlight-llms-txt/entryToSimpleMarkdown.ts";

/**
 * Every docs page as Markdown at its address plus `.md` (`/guides/timeline/moves/` is
 * `/guides/timeline/moves.md`), for agents. llms.txt lists them, and each HTML page links its
 * copy (src/routeData.ts).
 */
export const prerender = true;

export const getStaticPaths = (async () => {
    const docs = await getCollection("docs", (doc) => !doc.data.draft);
    return docs.map((entry) => ({
        params: { slug: entry.id },
        props: { entry },
    }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<"docs"> }> = async (
    context,
) => {
    const { entry } = context.props;
    const parts = [`# ${entry.data.title}`];
    if (entry.data.description) parts.push(`> ${entry.data.description}`);
    // Root-relative links and pictures become full addresses, so a picture, clip or page link
    // an agent passes on to someone still opens (`/docs/media/…` alone means nothing in a chat)
    const origin = new URL(context.site ?? "https://openmarch.com").origin;
    const body = await entryToSimpleMarkdown(entry, context, false);
    parts.push(body.replace(/\]\(\/(?!\/)/g, `](${origin}/`));
    parts.push(`Source: ${new URL(`/${entry.id}/`, context.site).href}`);
    return new Response(`${parts.join("\n\n")}\n`, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
};
