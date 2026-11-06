// Puts the preview site together (see README.md): the website's build in
// apps/website/dist, plus the web editor's build (apps/desktop/dist-web) in
// dist/editor/, with headers that keep search engines out and a small
// "Preview" badge on every website page.
//
//   node apps/website/preview/assemble.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "../dist");
const editor = path.resolve(here, "../../desktop/dist-web");
const editorTarget = path.join(site, "editor");

for (const dir of [site, editor])
    if (!fs.existsSync(path.join(dir, "index.html")))
        throw new Error(
            `No build in ${dir}. Run the build steps in README.md.`,
        );

const { version } = JSON.parse(
    fs.readFileSync(path.resolve(here, "../../desktop/package.json"), "utf8"),
);

// The editor, without its own _headers (Cloudflare reads only the root one)
// and without the example shows, which every web build copies from
// web/public/demos/ but only the examples and lab channels offer.
fs.rmSync(editorTarget, { recursive: true, force: true });
fs.cpSync(editor, editorTarget, {
    recursive: true,
    filter: (src) =>
        path.basename(src) !== "_headers" &&
        path.relative(editor, src) !== "demos",
});

// The editor's headers (already written for /editor/), then the site's.
const editorHeaders = fs.readFileSync(path.join(editor, "_headers"), "utf8");
fs.writeFileSync(
    path.join(site, "_headers"),
    [
        editorHeaders.trimEnd(),
        "/*",
        "  X-Robots-Tag: noindex, nofollow",
        "",
    ].join("\n"),
);
fs.writeFileSync(path.join(site, "robots.txt"), "User-agent: *\nDisallow: /\n");

// The badge, on every website page (not the editor, which shows its own
// channel next to the version).
const badge = `<a href="https://openmarch.com" title="This is a preview of the next OpenMarch release. The released version is at openmarch.com." style="position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:6px;background:#6c47ff;color:#fff;font:500 13px/1.2 system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.25)">Preview · ${version}</a>`;
let pages = 0;
const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (file !== editorTarget) walk(file);
        } else if (entry.name.endsWith(".html")) {
            const html = fs.readFileSync(file, "utf8");
            if (!html.includes("</body>")) continue;
            fs.writeFileSync(file, html.replace("</body>", `${badge}</body>`));
            pages++;
        }
    }
};
walk(site);
console.log(
    `Preview site ready in ${site}: ${pages} website pages, editor in /editor/ (${version}).`,
);
