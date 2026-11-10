// Renders the front ensemble GLBs in a venue with the 3D View's own lighting and
// measures what they cost. See README.md.
// usage (from apps/desktop):
//   node scripts/view3d-gallery/shoot-pit.mjs <out dir> [--dir <glb dir>] [--gpu] [--bench]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const req = createRequire(path.join(desktop, "package.json"));
const { chromium } = req("playwright");
const { createServer } = req("vite");
const argv = process.argv.slice(2);
const out = path.resolve(argv[0]);
const dirAt = argv.indexOf("--dir");
const dir =
    dirAt < 0
        ? path.join(desktop, "src/view3d/assets/pit")
        : path.resolve(argv[dirAt + 1]);
const gpu = process.argv.includes("--gpu");
const doBench = process.argv.includes("--bench");
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
);
const W = (id) => manifest[id].high.sizeM.width;
const row = (ids, front, gap) => {
    const total = ids.reduce((a, id) => a + W(id), 0) + gap * (ids.length - 1);
    let x = -total / 2;
    return ids.map((id) => {
        const p = { id, x: x + W(id) / 2, front };
        x += W(id) + gap;
        return p;
    });
};
const layout = [
    ...row(
        [
            "speaker-tall",
            "synth-88-double",
            "vibraphone-3.0",
            "marimba-4.3",
            "glockenspiel-2.5",
            "xylophone-3.5",
            "marimba-4.6",
            "vibraphone-3.5",
            "marimba-5.0",
            "speaker-tall",
        ],
        5.2,
        0.5,
    ),
    ...row(
        [
            "speaker-square",
            "bongos",
            "congas",
            "trap-table",
            "chimes",
            "aux-rack-accessories",
            "aux-rack-mixed",
            "aux-rack-toms",
            "drum-set",
            "gong-36",
            "concert-bass-36",
            "timpani-23",
            "timpani-26",
            "timpani-29",
            "timpani-32",
            "speaker-wide",
        ],
        2.4,
        0.4,
    ),
    { id: "mixer-cart", x: 8, front: 8.2 },
    { id: "conductor-podium-tall", x: -4, front: 9.0 },
    { id: "conductor-podium", x: 4, front: 9.0 },
];
const server = await createServer({
    configFile: path.join(desktop, "scripts/view3d-gallery/vite.config.mts"),
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls.local[0];
const args = gpu
    ? [
          "--no-sandbox",
          "--ignore-gpu-blocklist",
          "--enable-gpu",
          "--use-angle=vulkan",
          "--enable-features=Vulkan",
          "--disable-vulkan-surface",
      ]
    : [
          "--no-sandbox",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--ignore-gpu-blocklist",
      ];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/__pit/*", (route) =>
    route.fulfill({
        path: path.join(
            dir,
            path.basename(new URL(route.request().url()).pathname),
        ),
    }),
);
await page.goto(url);
await page.waitForFunction(() => document.title === "gallery-ready", null, {
    timeout: 120000,
});
const loaded = await page.evaluate(
    (kit) => window.gallery.load({ kit, quality: "high", crowd: true }),
    "hs",
);
const report = {
    gpu: await page.evaluate(() => window.gallery.gpu()),
    cameras: loaded.cameras.map((c) => c.id),
};
const f = await page.evaluate(() => window.gallery.front());
const place = (suffix) =>
    layout.map((p) => ({
        url: `/__pit/${p.id}${suffix}.glb`,
        x: p.x,
        front: p.front,
    }));
const views = {
    "press-box":
        loaded.cameras.find((c) => /press/i.test(c.id))?.id ??
        loaded.cameras[0].id,
    "seat-30": {
        position: [f.x + 16, 7, f.z + 30],
        target: [f.x, 0.8, f.z + 4],
        fov: 28,
    },
    "pit-front": {
        position: [f.x + 5, 2.6, f.z + 13],
        target: [f.x + 1, 0.8, f.z + 4],
        fov: 40,
    },
    "pit-left": {
        position: [f.x - 12, 2.2, f.z + 11],
        target: [f.x - 6, 0.8, f.z + 4],
        fov: 36,
    },
    "drums-close": {
        position: [f.x + 4.5, 1.9, f.z + 5.6],
        target: [f.x + 4.5, 0.9, f.z + 2.4],
        fov: 50,
    },
    "racks-close": {
        position: [f.x - 1.5, 1.9, f.z + 5.4],
        target: [f.x - 1.5, 1.0, f.z + 2.4],
        fov: 50,
    },
    "left-close": {
        position: [f.x - 7.5, 1.9, f.z + 5.6],
        target: [f.x - 7.5, 0.9, f.z + 2.4],
        fov: 50,
    },
    "mallets-close": {
        position: [f.x + 6, 2.3, f.z + 8.6],
        target: [f.x + 6, 0.8, f.z + 5.2],
        fov: 45,
    },
    "from-field": {
        position: [f.x + 2, 1.7, f.z - 4],
        target: [f.x + 3.5, 0.9, f.z + 4],
        fov: 50,
    },
    "under-cymbals": {
        position: [f.x + 1.2, 0.7, f.z + 4.4],
        target: [f.x + 2.6, 1.5, f.z + 2.4],
        fov: 55,
    },
};
for (const lighting of ["day", "night"]) {
    if (!loaded.lightingPresets.includes(lighting)) continue;
    await page.evaluate((l) => window.gallery.setLighting(l), lighting);
    await page.evaluate((list) => window.gallery.addModels(list), place(""));
    for (const [name, view] of Object.entries(views)) {
        if (lighting === "night" && !["pit-front", "press-box"].includes(name))
            continue;
        await page.evaluate((v) => window.gallery.shot(v), view);
        await page.screenshot({
            path: path.join(out, `${lighting}--${name}.png`),
        });
    }
}
if (doBench) {
    await page.evaluate((l) => window.gallery.setLighting(l), "day");
    const cases = {
        "no pit": null,
        "detailed, per-part draws, shadows": [place(""), { shadows: true }],
        "detailed, per-part draws, no shadows": [place(""), { shadows: false }],
        "distant, per-part draws, shadows": [place("-low"), { shadows: true }],
        "detailed, one draw per model, shadows": [
            place(""),
            { shadows: true, merge: true },
        ],
        "distant, one draw per model, shadows": [
            place("-low"),
            { shadows: true, merge: true },
        ],
    };
    report.bench = {};
    for (const view of ["press-box", "pit-front"]) {
        report.bench[view] = {};
        for (const [name, c] of Object.entries(cases)) {
            if (c)
                await page.evaluate(
                    ([list, o]) => window.gallery.addModels(list, o),
                    c,
                );
            else await page.evaluate(() => window.gallery.clearModels());
            await page.evaluate((v) => window.gallery.shot(v), views[view]);
            const info = await page.evaluate(() => window.gallery.info());
            let ms = Infinity;
            for (let k = 0; k < 5; k++)
                ms = Math.min(
                    ms,
                    await page.evaluate(
                        (n) => window.gallery.bench(n),
                        gpu ? 300 : 20,
                    ),
                );
            report.bench[view][name] = {
                ...info,
                ms: Math.round(ms * 100) / 100,
            };
        }
    }
}
report.errors = errors.slice(0, 10);
fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 1));
await browser.close();
await server.close();
