// Renders every section's hold to PNGs in headless Chromium (SwiftShader). See README.md.
// usage (from apps/desktop):
//   node scripts/view3d-holds/shoot.mjs --out /mnt/data/om-capture/holds/run1 [--states up,carry,trail] [--only Trumpet,Flute]
// Writes <out>/<state>/<nn>-<section>.png (five views side by side) and <out>/<state>-sheet.png.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "../..");
const req = createRequire(path.join(desktop, "package.json"));
const { chromium } = req("playwright");
const { createServer } = req("vite");

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i < 0 ? def : args[i + 1];
};
const out = path.resolve(opt("out", "/mnt/data/om-capture/holds/latest"));
const states = opt("states", "up").split(",");
const only = opt("only")
    ?.split(",")
    .map((s) => s.trim().toLowerCase());
fs.mkdirSync(out, { recursive: true });

const server = await createServer({
    configFile: path.join(here, "vite.config.mts"),
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
});
await server.listen();
// Render on the GPU (ANGLE over Vulkan); GPU=0 forces SwiftShader, for debugging only.
const gpu = process.env.GPU !== "0";
const browser = await chromium.launch({
    args: gpu
        ? [
              "--no-sandbox",
              "--ignore-gpu-blocklist",
              "--use-gl=angle",
              "--use-angle=vulkan",
              "--enable-features=Vulkan",
          ]
        : [
              "--no-sandbox",
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
          ],
});
const errors = [];
try {
    const page = await browser.newPage({
        viewport: { width: 3080, height: 440 },
    });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.resolvedUrls.local[0], { timeout: 180000 });
    await page
        .waitForFunction(() => document.title === "holds-ready", null, {
            timeout: 180000,
        })
        .catch(() => {
            throw new Error(`gallery did not start: ${errors.join(" | ")}`);
        });
    const renderer = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    console.log(`note: rendering: ${renderer}`);
    if (gpu && !/nvidia/i.test(renderer))
        throw new Error(
            `expected the NVIDIA GPU, got "${renderer}" (GPU=0 forces software rendering)`,
        );
    const { entries, views } = await page.evaluate(() => ({
        entries: window.holds.entries,
        views: window.holds.views,
    }));
    for (const state of states) {
        const dir = path.join(out, state);
        fs.mkdirSync(dir, { recursive: true });
        const shots = [];
        for (let i = 0; i < entries.length; i++) {
            const name = entries[i];
            if (only && !only.some((o) => name.toLowerCase().includes(o)))
                continue;
            await page.evaluate(
                ([i, s]) => window.holds.show(i, s),
                [i, state],
            );
            const file = path.join(
                dir,
                `${String(i).padStart(2, "0")}-${name.replace(/[^A-Za-z]+/g, "-").toLowerCase()}.png`,
            );
            await page.locator("canvas").screenshot({ path: file });
            shots.push({ name, file });
            console.log(`${state} ${name}`);
        }
        const sheet = await browser.newPage({
            viewport: { width: 3080, height: 400 },
        });
        const head = views
            .map((v) => `<div style="flex:1;text-align:center">${v}</div>`)
            .join("");
        const html = `<body style="margin:0;background:#111;color:#eee;font:20px sans-serif"><div style="display:flex;padding:6px 0">${head}</div>${shots
            .map(
                (s) =>
                    `<figure style="margin:0 0 6px"><figcaption style="padding:4px 8px;font-weight:bold">${s.name} · ${state}</figcaption><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString("base64")}"></figure>`,
            )
            .join("")}</body>`;
        await sheet.setContent(html);
        await sheet.screenshot({
            path: path.join(out, `${state}-sheet.png`),
            fullPage: true,
        });
        await sheet.close();
    }
} finally {
    if (errors.length) console.log(`errors:\n${errors.join("\n")}`);
    await browser.close();
    await server.close();
}
