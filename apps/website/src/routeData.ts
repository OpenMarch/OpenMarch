import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

/**
 * Point every docs page at its Markdown copy (src/pages/[...slug].md.ts), so an agent that
 * lands on the HTML page can fetch the same page as plain text.
 */
export const onRequest = defineRouteMiddleware((context) => {
    const { entry, head } = context.locals.starlightRoute;
    head.push({
        tag: "link",
        attrs: {
            rel: "alternate",
            type: "text/markdown",
            href: `/${entry.id}.md`,
        },
    });
});
