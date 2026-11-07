import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { parse as parseYaml } from "yaml";
import { version } from "./package.json";
import { DEMOS } from "./web/demos";

/**
 * Builds the web editor (editor.openmarch.com): the app in a browser tab,
 * with no Electron. See `web/README.md`.
 *
 *   pnpm run web:dev     # local server
 *   pnpm run web:build   # static site in dist-web/
 *
 * Environment:
 * `WEB_CHANNEL` ("stable", "nightly" or "preview"; "dev" if unset) names the
 * release channel; the nightly build says so next to the version. "preview"
 * is the editor on preview.openmarch.com, built from a `prerelease/*` branch
 * and served from `WEB_BASE` (`/editor/` there; see
 * `apps/website/preview/README.md`). The fork's "examples" channel also
 * offers the example shows in `web/public/demos/` on the start page.
 *
 * The fork's "lab" channel is a test build for lab.openmarch.com (see
 * `web/LAB.md`): it offers the example shows too, loads everything relative
 * to its folder (the lab serves each test at `/x/<test id>/`), and keeps what
 * it stores apart from every other test on that origin, by `LAB_TEST_ID`.
 * It opens straight into an example show, which `LAB_MANIFEST`, the test's
 * `lab/<id>/experiment.md`, may name.
 */

const channel = process.env.WEB_CHANNEL ?? "dev";
const isLab = channel === "lab";
/**
 * Where the site serves the editor: "/" on its own domain, "/editor/" on
 * preview.openmarch.com, next to the website. Lab builds ignore it and load
 * everything relative to their folder.
 */
const webBase = process.env.WEB_BASE ?? "/";
if (!webBase.startsWith("/") || !webBase.endsWith("/"))
    throw new Error(`WEB_BASE must start and end with "/", not "${webBase}"`);
const labTestId = process.env.LAB_TEST_ID ?? "";
if (isLab && !/^[a-z0-9-]+$/.test(labTestId))
    throw new Error(
        "WEB_CHANNEL=lab needs LAB_TEST_ID, the lab test's id (a-z, 0-9 and -)",
    );
const examples = channel === "examples" || isLab ? DEMOS : [];

/**
 * A field from the front matter of the lab test's manifest, the path in
 * `LAB_MANIFEST` (from the repository root; CI sets it to the test being
 * published). Only plain one-word values (`show: part1`), so no YAML parser.
 */
function labManifestField(name: string): string | undefined {
    const manifest = process.env.LAB_MANIFEST;
    if (!isLab || !manifest) return undefined;
    const text = fs.readFileSync(
        path.resolve(__dirname, "..", "..", manifest),
        "utf8",
    );
    const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    return new RegExp(`^${name}:[ \\t]*["']?([\\w-]+)`, "m").exec(
        frontMatter,
    )?.[1];
}

/**
 * What a lab build opens straight away (`web/renderer/lab.ts`): the example
 * show the manifest's `show` names (an id in `web/demos.ts`), or the first,
 * in the editor mode its `mode` names ("basic" or "expert", the default).
 */
const labShow = isLab ? (labManifestField("show") ?? DEMOS[0].id) : "";
const labMode = isLab ? (labManifestField("mode") ?? "expert") : "";
if (isLab && !DEMOS.some((demo) => demo.id === labShow))
    throw new Error(
        `The lab manifest's show "${labShow}" isn't one of web/demos.ts: ${DEMOS.map((demo) => demo.id).join(", ")}`,
    );
if (isLab && labMode !== "basic" && labMode !== "expert")
    throw new Error(
        `The lab manifest's mode "${labMode}" isn't "basic" or "expert"`,
    );

/**
 * What names this build's browser storage (see `web/renderer/channel.ts`).
 * Lab tests all share one origin, so each test gets its own.
 */
const storageNamespace = isLab
    ? `lab-${labTestId}`
    : // The examples channel was called "preview"; keep its stored shows.
      channel === "examples"
      ? "preview"
      : channel;
/**
 * Sign-in (web/renderer/auth.ts): ClerkJS with a Clerk publishable key,
 * `VITE_CLERK_PUBLISHABLE_KEY` from the environment or the mode's `.env`
 * files (`.env.production` has the production instance's).
 *
 * - The sites (stable, nightly, preview, lab) sign in with the production
 *   instance, which only runs on openmarch.com. The build refuses anything
 *   else (a dev server for one starts with sign-in off): no key would leave real users unable to sign in, and a development
 *   key would send them to the test accounts.
 * - A dev build (`web:dev`) signs in only with a development key
 *   (`pk_test_…`, say in `.env.development.local`), whose instance accepts
 *   localhost. Point `VITE_EDITOR_API_URL` at an API that trusts it.
 * - The examples build leaves sign-in out.
 */
const siteChannels = ["stable", "nightly", "preview", "lab"];
function webClerkPublishableKey(mode: string, command: string): string {
    if (!siteChannels.includes(channel) && channel !== "dev") return "";
    // An empty variable counts as unset, so the .env files decide (loadEnv
    // would otherwise prefer the empty environment value).
    if (process.env.VITE_CLERK_PUBLISHABLE_KEY === "")
        delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
    const key =
        process.env.VITE_CLERK_PUBLISHABLE_KEY ||
        loadEnv(mode, __dirname, "VITE_CLERK_").VITE_CLERK_PUBLISHABLE_KEY ||
        "";
    const isDevelopmentKey = key.startsWith("pk_test_");
    if (siteChannels.includes(channel) && !key.startsWith("pk_live_")) {
        // A dev server for a site channel (LAB.md's local lab run) runs on
        // localhost, where the production instance can't sign in anyway:
        // it starts with sign-in off. Only a build for the site must have it.
        if (command !== "build") return "";
        throw new Error(
            isDevelopmentKey
                ? `WEB_CHANNEL=${channel} is a site real users sign in to: it needs the production Clerk key (pk_live_…), not a development key (pk_test_…)`
                : `WEB_CHANNEL=${channel} is a site real users sign in to: it needs the production Clerk key (pk_live_…) in VITE_CLERK_PUBLISHABLE_KEY (.env.production has it)`,
        );
    }
    // Only a development instance runs on localhost.
    if (channel === "dev" && !isDevelopmentKey) return "";
    return key;
}

/** The Clerk Frontend API host a publishable key names (pk_live_<base64 host$>). */
function clerkHost(publishableKey: string): string {
    const encoded = publishableKey.split("_")[2] ?? "";
    return Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
}

/**
 * Scripts from elsewhere the page's content security policy must allow:
 * ClerkJS, from the Clerk instance, for sign-in. (A lab build's feedback
 * widget loads it too, to sign its requests to the lab's API in.)
 */
function scriptHosts(publishableKey: string): string[] {
    const hosts = new Set<string>();
    if (publishableKey) hosts.add(`https://${clerkHost(publishableKey)}`);
    if (isLab) hosts.add("https://clerk.openmarch.com");
    return [...hosts];
}

/**
 * The versions a lab test compares (web/LAB.md, "Comparing versions"): the
 * `variants` in the front matter of the manifest `LAB_MANIFEST` names, a path
 * from the repository root. CI sets it to the test being published. Without
 * it, outside the lab channel, or with fewer than two versions, the build has
 * no version switch.
 */
function labVariants(): { id: string; label: string; description: string }[] {
    const manifest = process.env.LAB_MANIFEST;
    if (!isLab || !manifest) return [];
    const text = fs.readFileSync(
        path.resolve(__dirname, "..", "..", manifest),
        "utf8",
    );
    const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    const variants = (parseYaml(frontMatter)?.variants ?? []).map(
        (v: { id: unknown; label?: unknown; description?: unknown }) => ({
            id: String(v.id),
            label: String(v.label ?? v.id),
            description: String(v.description ?? ""),
        }),
    );
    return variants.length >= 2 ? variants : [];
}

const web = (file: string) => path.join(__dirname, "web", file);
const outDir = path.join(__dirname, "dist-web");

/**
 * Cloudflare's static asset headers: hashed assets never change, so browsers
 * keep them; everything else (index.html) is checked on each visit, so a
 * deploy reaches people on their next load.
 */
const writeHeaders = (): Plugin => ({
    name: "openmarch-web-headers",
    // The lab serves its builds itself and ignores the file.
    apply: (_config, { command }) => command === "build" && !isLab,
    closeBundle() {
        fs.writeFileSync(
            path.join(outDir, "_headers"),
            [
                `${webBase}assets/*`,
                "  Cache-Control: public, max-age=31536000, immutable",
                `${webBase}*`,
                "  X-Content-Type-Options: nosniff",
                "  Referrer-Policy: strict-origin-when-cross-origin",
                "",
            ].join("\n"),
        );
        // The home-screen manifest's paths are written for "/".
        if (webBase !== "/") {
            const file = path.join(outDir, "manifest.webmanifest");
            const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
            manifest.start_url = webBase;
            manifest.scope = webBase;
            for (const icon of manifest.icons)
                icon.src = webBase + icon.src.replace(/^\//, "");
            fs.writeFileSync(file, JSON.stringify(manifest, null, 4) + "\n");
        }
    },
});

/**
 * Copies the example shows into the examples and lab builds, and serves them
 * from the dev server; other builds leave them out.
 */
const copyExamples = (): Plugin => {
    let building = false;
    return {
        name: "openmarch-web-examples",
        configResolved(config) {
            building = config.command === "build";
        },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const pathname = (req.url ?? "").split("?")[0];
                const example = examples.find((e) => pathname === `/${e.file}`);
                if (!example) return next();
                res.setHeader("Content-Type", "application/octet-stream");
                fs.createReadStream(
                    web(path.join("public", example.file)),
                ).pipe(res);
            });
        },
        closeBundle() {
            if (!building) return;
            for (const example of examples) {
                const target = path.join(outDir, example.file);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.copyFileSync(web(path.join("public", example.file)), target);
            }
        },
    };
};

/**
 * `electron` is two different modules here. Main-process code, which runs in
 * the worker, gets `ipcMain`; the preload, in the page, gets `ipcRenderer`.
 */
const resolveElectron = (): Plugin => ({
    name: "openmarch-web-electron",
    enforce: "pre",
    resolveId: {
        filter: { id: /^electron$/ },
        handler(_source, importer) {
            if (!importer) return;
            const file = importer.replace(/\\/g, "/");
            const inWorker =
                file.includes("/web/worker/") ||
                (file.includes("/electron/") &&
                    !file.includes("/electron/preload/"));
            return inWorker
                ? web("worker/electron.ts")
                : web("renderer/electron.ts");
        },
    },
});

/**
 * Starts the page with `web/renderer/index.ts`, which loads the preload and
 * the app once the worker is ready, and lets the page compile SQLite's
 * WebAssembly under the app's content security policy.
 */
const webEntry = (extraScriptHosts: string[]): Plugin => ({
    name: "openmarch-web-entry",
    transformIndexHtml: {
        order: "pre",
        handler: (html) =>
            html
                .replace(
                    '<script type="module" src="/src/main.tsx"></script>',
                    '<script type="module" src="/web/renderer/index.ts"></script>',
                )
                .replace(
                    "script-src 'self'",
                    [
                        "script-src 'self' 'wasm-unsafe-eval'",
                        ...extraScriptHosts,
                    ].join(" "),
                )
                .replace(/<title>[^<]*<\/title>/, "<title>OpenMarch</title>")
                .replace(
                    /<meta\s+name="viewport"\s+content="[^"]*"\s*\/>/,
                    `<meta name="viewport" content="${WEB_VIEWPORT}" />`,
                )
                .replace("</head>", `    ${HOME_SCREEN_TAGS}\n    </head>`),
    },
});

/**
 * `maximum-scale=1` stops iOS Safari zooming the page into a text field
 * whose font is under 16px (iOS ignores it for pinch-zoom, for
 * accessibility; `web/renderer/touchGestures.ts` stops that instead) and
 * stops Android Chrome's page pinch-zoom. `viewport-fit=cover` lets the app
 * reach under the notch and home indicator in home-screen mode, where
 * `env(safe-area-inset-*)` pads it back (src/styles/index.css).
 */
const WEB_VIEWPORT =
    "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";

/**
 * "Add to Home Screen" (iPadOS Safari, Android Chrome): opens full screen
 * like an app, with the app icon. The files are in `web/public/`. Electron
 * shares index.html, so these are added only here.
 *
 * The status bar style is "default", not "black-translucent": on iPadOS 17,
 * black-translucent moves the page up under the status bar but still takes
 * the bar's height off the page, leaving a strip at the bottom of the screen
 * that isn't part of the page (measured on an iPad 7: a 790 px page on an
 * 810 px screen). iPadOS reads this when the app is added to the Home
 * Screen, so a change needs the app removed and added again.
 */
const HOME_SCREEN_TAGS = [
    `<link rel="manifest" href="${webBase}manifest.webmanifest" />`,
    `<link rel="apple-touch-icon" href="${webBase}apple-touch-icon.png" />`,
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-title" content="OpenMarch" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="theme-color" content="#ecebf0" media="(prefers-color-scheme: light)" />',
    '<meta name="theme-color" content="#0f0e13" media="(prefers-color-scheme: dark)" />',
].join("\n        ");

// eslint-disable-next-line max-lines-per-function
export default defineConfig(({ mode, command }) => {
    const clerkPublishableKey = webClerkPublishableKey(mode, command);
    return {
        // A lab build is served from a folder, so its URLs are relative.
        base: isLab ? "./" : webBase,
        resolve: {
            alias: [
                {
                    find: /^@\//,
                    replacement: path.join(__dirname, "src") + "/",
                },
                {
                    find: /^@om-electron\//,
                    replacement: path.join(__dirname, "electron") + "/",
                },
                // Only the worker's main-process code imports these.
                { find: /^(node:)?fs$/, replacement: web("worker/fs.ts") },
                { find: /^(node:)?path$/, replacement: web("worker/path.ts") },
                {
                    find: /^(node:)?sqlite$/,
                    replacement: web("worker/sqlite.ts"),
                },
                {
                    find: /^(node:)?crypto$/,
                    replacement: web("worker/crypto.ts"),
                },
                // @mediabunny/aac-encoder imports it only under Node. Left to Vite's shared
                // browser-external stub, it ties the main chunk and the app chunk into a
                // cycle and the app fails to start.
                {
                    find: /^(node:)?worker_threads$/,
                    replacement: web("renderer/workerThreads.ts"),
                },
                {
                    find: "@sentry/electron/renderer",
                    replacement: web("renderer/sentry.ts"),
                },
            ],
            extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
        },
        plugins: [
            resolveElectron(),
            tailwindcss(),
            react(),
            webEntry(scriptHosts(clerkPublishableKey)),
            writeHeaders(),
            copyExamples(),
        ],
        worker: {
            format: "es",
            plugins: () => [resolveElectron()],
        },
        define: {
            // The preload reads these from Node's `process` under Electron.
            "process.platform": "globalThis.__openmarchPlatform",
            "process.env.PLAYWRIGHT_CODEGEN": JSON.stringify(""),
            "process.env.PLAYWRIGHT_SESSION": JSON.stringify(""),
            "import.meta.env.VITE_PUBLIC_WEB_BUILD": JSON.stringify("true"),
            "import.meta.env.VITE_PUBLIC_WEB_CHANNEL": JSON.stringify(channel),
            "import.meta.env.VITE_PUBLIC_WEB_STORAGE_NAMESPACE":
                JSON.stringify(storageNamespace),
            "import.meta.env.VITE_PUBLIC_APP_VERSION": JSON.stringify(version),
            "import.meta.env.VITE_PUBLIC_WEB_CLERK_PUBLISHABLE_KEY":
                JSON.stringify(clerkPublishableKey),
            __LAB_VARIANTS__: JSON.stringify(labVariants()),
            "import.meta.env.VITE_PUBLIC_WEB_EXAMPLES": JSON.stringify(
                JSON.stringify(examples),
            ),
            "import.meta.env.VITE_PUBLIC_LAB_SHOW": JSON.stringify(labShow),
            "import.meta.env.VITE_PUBLIC_LAB_MODE": JSON.stringify(labMode),
            // No analytics on the web (PostHog stays uninitialized; Sentry is
            // stubbed in renderer/sentry.ts).
            "import.meta.env.VITE_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
        },
        optimizeDeps: {
            // Loads its .wasm next to itself, which pre-bundling breaks.
            // The migrator reads files with `fs`, which must reach worker/fs.ts.
            exclude: ["@sqlite.org/sqlite-wasm", "drizzle-orm/migrator"],
        },
        // Home-screen icons and manifest (see HOME_SCREEN_TAGS), and the favicon.
        publicDir: web("public"),
        build: {
            outDir,
            emptyOutDir: true,
            sourcemap: true,
            target: "es2022",
            chunkSizeWarningLimit: 8000,
        },
        server: { port: 7780 },
        clearScreen: false,
    };
});
