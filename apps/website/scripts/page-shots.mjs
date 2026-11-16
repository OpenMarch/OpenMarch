/* eslint-disable no-console -- a command-line tool: it reports where the screenshots are */
// cspell:words networkidle
// Screenshots built guide pages, in light and dark, so a person or an agent can read the
// pages as published before pushing. Build first (pnpm --dir apps/website run build).
//
//   node apps/website/scripts/page-shots.mjs /guides/timeline/moves/ [/guides/... ...] [--out dir]
//
// Writes <out>/<page>.<theme>.png (full page, 1280 px wide); default out is a new folder in
// the system temp folder. Pass page paths as they appear in the site's URLs.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
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
const outIndex = args.indexOf("--out");
const out =
    outIndex >= 0
        ? path.resolve(args[outIndex + 1])
        : fs.mkdtempSync(path.join(os.tmpdir(), "guide-pages-"));
const pages = args.filter((a, i) => a.startsWith("/") && i !== outIndex + 1);
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

const port = 4400 + Math.floor(Math.random() * 400);
const server = spawn("npx", ["astro", "preview", "--port", String(port)], {
    cwd: WEBSITE,
    stdio: "ignore",
});
const base = `http://localhost:${port}`;
try {
    for (let i = 0; i < 60; i++) {
        const ok = await fetch(base).then(
            () => true,
            () => false,
        );
        if (ok) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch();
    for (const theme of ["light", "dark"]) {
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
            const file = path.join(out, `${name}.${theme}.png`);
            await page.screenshot({ path: file, fullPage: true });
            console.log(`${response?.status()} ${file}`);
        }
        await context.close();
    }
    await browser.close();
} finally {
    server.kill();
}
