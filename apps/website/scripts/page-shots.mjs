/* eslint-disable no-console -- a command-line tool: it reports where the screenshots are */
// cspell:words networkidle
// Screenshots built guide pages, in light and dark, so a person or an agent can read the
// pages as published before pushing. Build first (pnpm --dir apps/website run build).
//
//   node apps/website/scripts/page-shots.mjs /guides/timeline/moves/ [/guides/... ...] [--out dir]
//       [--all] [--theme light|dark] [--tiles]
//
// Writes <out>/<page>.<theme>.png (full page, 1280 px wide); default out is a new folder in
// the system temp folder. Pass page paths as they appear in the site's URLs, or --all for every
// guide and troubleshooting page. --theme takes one theme instead of both. --tiles writes the
// page as 1280 × 1400 JPEGs, <page>.<theme>.<n>.jpg, instead of one tall PNG: a whole page is
// often too tall to read once an image viewer or a model shrinks it to fit.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const require = createRequire(path.resolve(WEBSITE, "../desktop/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const valueOf = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
};
const out = valueOf("--out")
    ? path.resolve(valueOf("--out"))
    : fs.mkdtempSync(path.join(os.tmpdir(), "guide-pages-"));
const themes = valueOf("--theme") ? [valueOf("--theme")] : ["light", "dark"];
const tiles = args.includes("--tiles");
const TILE_HEIGHT = 1400;

/** Every guide and troubleshooting page's address, from its source file. */
function allGuidePages() {
    const docs = path.join(WEBSITE, "src/content/docs");
    return ["guides", "troubleshooting"]
        .flatMap((dir) =>
            fs
                .readdirSync(path.join(docs, dir), { recursive: true })
                .filter((file) => /\.mdx?$/.test(file))
                .map((file) =>
                    `${dir}/${file}`
                        .replace(/\.mdx?$/, "")
                        .replace(/(^|\/)index$/, ""),
                ),
        )
        .sort()
        .map((id) => `/${id}/`);
}

const pages = args.includes("--all")
    ? allGuidePages()
    : args.filter((a, i) => a.startsWith("/") && args[i - 1] !== "--out");
if (!pages.length) {
    console.error(
        "Name at least one page, for example /guides/timeline/moves/",
    );
    process.exit(2);
}
if (!fs.existsSync(path.join(WEBSITE, "dist"))) {
    console.error("Build the site first: pnpm --dir apps/website run build");
    process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

// A port nothing listens on. Astro moves to the next port when the one asked for is taken, and
// another checkout's preview server may hold it, so take the port Astro reports, then check
// that it serves this checkout's build before taking any screenshot.
const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "localhost", () => {
        const { port: free } = probe.address();
        probe.close(() => resolve(free));
    });
});
const server = spawn(
    process.execPath,
    [
        path.join(WEBSITE, "node_modules/astro/bin/astro.mjs"),
        "preview",
        "--port",
        String(port),
    ],
    { cwd: WEBSITE, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
const announced = new Promise((resolve) => {
    const read = (chunk) => {
        serverLog += chunk;
        const match = /localhost:(\d+)/.exec(serverLog);
        if (match) resolve(Number(match[1]));
    };
    server.stdout.on("data", read);
    server.stderr.on("data", read);
});
let base;
try {
    const actual = await Promise.race([
        announced,
        new Promise((r) => setTimeout(() => r(null), 30000)),
    ]);
    if (!actual) throw new Error(`astro preview didn't start:\n${serverLog}`);
    base = `http://localhost:${actual}`;
    const expected = fs.readFileSync(
        path.join(WEBSITE, "dist/llms.txt"),
        "utf8",
    );
    const served = await fetch(`${base}/llms.txt`).then((r) => r.text());
    if (served !== expected) {
        throw new Error(
            `${base} isn't serving this checkout's dist; stop the other preview server and try again`,
        );
    }
    const browser = await chromium.launch();
    let failed = 0;
    for (const theme of themes) {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            colorScheme: theme,
            reducedMotion: "reduce",
        });
        await context.addInitScript(
            (t) => localStorage.setItem("starlight-theme", t),
            theme,
        );
        const page = await context.newPage();
        for (const p of pages) {
            const response = await page.goto(base + p, {
                waitUntil: "networkidle",
            });
            // Lazy pictures load only near the screen: scroll through, then wait for them
            await page.evaluate(async () => {
                for (let y = 0; y < document.body.scrollHeight; y += 600) {
                    window.scrollTo(0, y);
                    await new Promise((r) => setTimeout(r, 60));
                }
                window.scrollTo(0, 0);
                await Promise.all(
                    [...document.images]
                        .filter((i) => i.checkVisibility())
                        .map((i) =>
                            i.complete
                                ? null
                                : new Promise(
                                      (r) => (i.onload = i.onerror = r),
                                  ),
                        ),
                );
            });
            const name =
                p.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "index";
            const status = response?.status();
            if (status !== 200) failed++;
            if (tiles) {
                const height = await page.evaluate(
                    () => document.documentElement.scrollHeight,
                );
                for (let y = 0, n = 1; y < height; y += TILE_HEIGHT, n++) {
                    const file = path.join(out, `${name}.${theme}.${n}.jpg`);
                    await page.screenshot({
                        path: file,
                        fullPage: true,
                        quality: 80,
                        clip: {
                            x: 0,
                            y,
                            width: 1280,
                            height: Math.min(TILE_HEIGHT, height - y),
                        },
                    });
                    console.log(`${status} ${file}`);
                }
            } else {
                const file = path.join(out, `${name}.${theme}.png`);
                await page.screenshot({ path: file, fullPage: true });
                console.log(`${status} ${file}`);
            }
        }
        await context.close();
    }
    await browser.close();
    if (failed) {
        console.error(`${failed} page(s) didn't load (status other than 200)`);
        process.exitCode = 1;
    }
} finally {
    server.kill();
}
