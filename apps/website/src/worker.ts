/* eslint-disable import/no-anonymous-default-export */
export default {
    async fetch(request: Request, env, ctx) {
        const url = new URL(request.url);

        // -------------------------
        // /latest.json → Serve from R2
        // -------------------------
        if (url.pathname === "/latest.json") {
            const object = await env.DOWNLOADS_BUCKET.get("latest.json");
            if (!object) {
                return new Response("Not found", { status: 404 });
            }

            return new Response(object.body, {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=300", // 5 min cache
                },
            });
        }

        // -------------------------
        // /download/* → Stream from R2
        // -------------------------
        if (url.pathname.startsWith("/download/")) {
            const filename = url.pathname.replace("/download/", "");

            // Get latest.json to find the version
            const latestObj = await env.DOWNLOADS_BUCKET.get("latest.json");
            if (!latestObj) {
                return new Response("Latest version info not found", {
                    status: 404,
                });
            }

            const latest = await latestObj.json();
            const version = latest.version;

            // Construct the full path: {version}/{filename}
            const key = `${version}/${filename}`;

            const object = await env.DOWNLOADS_BUCKET.get(key);
            if (!object) {
                return new Response("Not found", { status: 404 });
            }

            // Stream the file directly from R2
            return new Response(object.body, {
                headers: {
                    "Content-Type":
                        object.httpMetadata?.contentType ||
                        "application/octet-stream",
                    "Content-Disposition": `attachment; filename="${filename}"`,
                    "Cache-Control": "public, max-age=3600", // 1 hour cache
                    ETag: object.httpEtag,
                },
            });
        }

        // -------------------------
        // /img/* → your image handler
        // -------------------------
        if (url.pathname.startsWith("/img/")) {
            return handleImageRoute(url, env);
        }

        // -------------------------
        // Everything else = Static
        // -------------------------
        return env.ASSETS.fetch(request);
    },
};

async function handleImageRoute(url: URL, env) {
    return new Response("later!", { status: 200 });
}
