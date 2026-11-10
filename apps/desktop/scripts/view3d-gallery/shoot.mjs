// Renders venue kits to PNGs in headless Chromium: on the GPU where the machine has an NVIDIA one,
// else SwiftShader. See README.md.
// usage (from apps/desktop):
//   node scripts/view3d-gallery/shoot.mjs --kits hs,gym --out /mnt/data/om-capture/venues/run1
//     [--lighting all|day,night] [--cameras all|pressBox,frontRow] [--quality high|low]
//     [--size 1280x720] [--no-crowd] [--poses poses.json] [--gpu|--software] [--bench 60]
//
// --gpu draws on the machine's GPU (ANGLE over EGL) instead of SwiftShader, the default where
// `nvidia-smi` works; --software forces SwiftShader;
// --bench N then also times N frames of each shot (ms per frame, in report.json).
//     [--field football|footballNoEndZones|college|collegeNoEndZones|pro|indoor]
// poses.json: [{ "name": "x", "position": [x,y,z], "target": [x,y,z], "fov": 45, "near": 0.5 }]
// Writes <out>/<kit>/<lighting>--<camera>.png, <out>/<kit>/sheet.png and <out>/report.json.
import { execSync } from "node:child_process";
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
const kits = opt("kits", "hs,bighs,college,pro,gym").split(",");
const out = path.resolve(opt("out", "/mnt/data/om-capture/venues/latest"));
const lightingArg = opt("lighting", "all");
const camerasArg = opt("cameras", "all");
const quality = opt("quality", "high");
const [W, H] = opt("size", "1280x720").split("x").map(Number);
const crowd = !args.includes("--no-crowd");
const hasNvidiaGpu = () => {
    try {
        execSync("nvidia-smi -L", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};
const gpu =
    args.includes("--gpu") || (!args.includes("--software") && hasNvidiaGpu());
const benchFrames = Number(opt("bench", "0"));
const field = opt("field");
const poses = opt("poses")
    ? JSON.parse(fs.readFileSync(opt("poses"), "utf8"))
    : [];
fs.mkdirSync(out, { recursive: true });

const server = await createServer({
    configFile: path.join(here, "vite.config.mts"),
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
    args: [
        "--no-sandbox",
        "--use-gl=angle",
        ...(gpu
            ? ["--use-angle=gl-egl"]
            : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
        "--ignore-gpu-blocklist",
    ],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
    window.addEventListener("error", () => (window.__galleryError = true));
    window.addEventListener(
        "unhandledrejection",
        () => (window.__galleryError = true),
    );
});
const report = {
    url,
    gpu: "",
    kits: {},
    errors,
};
try {
    await page.goto(url, { timeout: 180000 });
    await page
        .waitForFunction(
            () => document.title === "gallery-ready" || window.__galleryError,
            null,
            { timeout: 180000 },
        )
        .catch((e) => {
            throw new Error(
                `gallery did not start: ${errors.join(" | ") || e.message}`,
            );
        });
    if (errors.length && !(await page.title()).includes("ready"))
        throw new Error(`gallery did not start: ${errors.join(" | ")}`);
    report.gpu = await page.evaluate(() => window.gallery.gpu());
    console.log(`drawing on ${report.gpu}`);
    for (const kitId of kits) {
        const dir = path.join(out, kitId);
        fs.mkdirSync(dir, { recursive: true });
        const t0 = Date.now();
        const info = await page.evaluate((o) => window.gallery.load(o), {
            kit: kitId,
            quality,
            crowd,
            field,
        });
        const lightings =
            lightingArg === "all"
                ? info.lightingPresets
                : lightingArg
                      .split(",")
                      .filter((l) => info.lightingPresets.includes(l));
        const cams =
            camerasArg === "all"
                ? info.cameras.map((c) => c.id)
                : camerasArg.split(",");
        const views = [
            ...cams.map((id) => ({ name: id, view: id })),
            ...poses.map((p) => ({ name: p.name, view: p })),
        ];
        const shots = [];
        for (const lighting of lightings) {
            await page.evaluate((l) => window.gallery.setLighting(l), lighting);
            for (const { name, view } of views) {
                const ok = await page.evaluate((v) => {
                    try {
                        window.gallery.shot(v);
                        return true;
                    } catch (e) {
                        return String(e);
                    }
                }, view);
                if (ok !== true) {
                    errors.push(`${kitId} ${name}: ${ok}`);
                    continue;
                }
                const shotStats = await page.evaluate(
                    (n) => ({
                        ...window.gallery.info(),
                        ...(n ? { msPerFrame: window.gallery.bench(n) } : {}),
                    }),
                    benchFrames,
                );
                const file = path.join(dir, `${lighting}--${name}.png`);
                await page.locator("canvas").screenshot({ path: file });
                shots.push({ lighting, camera: name, file, ...shotStats });
            }
        }
        const stats = await page.evaluate(() => window.gallery.info());
        report.kits[kitId] = {
            ...info,
            shots: shots.length,
            stats,
            perShot: shots.map(({ file: _f, ...rest }) => rest),
            seconds: (Date.now() - t0) / 1000,
        };
        // Contact sheet: every shot in a grid with labels.
        const sheet = await browser.newPage({
            viewport: { width: 1920, height: 400 },
        });
        const cols = Math.min(4, shots.length || 1);
        const html = `<body style="margin:0;background:#111;color:#ddd;font:14px sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">${shots
            .map(
                (s) =>
                    `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString("base64")}"><figcaption>${kitId} · ${s.lighting} · ${s.camera}</figcaption></figure>`,
            )
            .join("")}</div></body>`;
        await sheet.setContent(html);
        await sheet.screenshot({
            path: path.join(dir, "sheet.png"),
            fullPage: true,
        });
        await sheet.close();
        console.log(
            `${kitId}: ${shots.length} shots, ${report.kits[kitId].seconds}s, ${JSON.stringify(stats)}`,
        );
    }
} finally {
    fs.writeFileSync(
        path.join(out, "report.json"),
        JSON.stringify(report, null, 2),
    );
    if (errors.length) console.log(`errors:\n${errors.join("\n")}`);
    await browser.close();
    await server.close();
}
