/* eslint-disable no-console -- a command-line script: it reports what it found */
// cspell:words ftyp rawvideo rgba sseof
// The scheduled refresh of the user guide's pictures and clips (.github/workflows/docs-media.yaml).
// Each step is a command, so each can be run and checked on its own machine:
//
//   node scripts/docs-media/refresh.mjs plan [--all | --only "<ids or chapters>"] [--since <commit>]
//       [--state <file>] [--keep <ref>] [--shards <n>] [--github-output]
//       Which shots to record again, split into shards for parallel jobs. Prints JSON. --state is
//       what the last refresh left behind (its commit, and the shots to try again).
//   node scripts/docs-media/refresh.mjs pages <shot-id ...>
//       The guide pages that show each shot.
//   node scripts/docs-media/refresh.mjs compare --work <capture work folder> --out <dir>
//       After capture.mjs: compares each new recording with the committed one, puts back the
//       ones that didn't visibly change, and copies the changed ones (with before | after | diff
//       pictures and a contact sheet) to <dir>. Needs ffmpeg (run it with in-docker.sh).
//   node scripts/docs-media/refresh.mjs changed --out <dir>
//       The shots compare found changed, to record them again.
//   node scripts/docs-media/refresh.mjs confirm --work <second capture work folder> --out <dir>
//       After recording those again: keeps a change only if the second recording agrees with
//       the first, so recordings that differ run to run aren't committed (reported as unstable).
//   node scripts/docs-media/refresh.mjs publish --artifacts <dir> --base <branch> --plan <json>
//       [--run-url <url>] [--repo <owner/name>] [--state <file>] [--report-only] [--dry-run]
//       Applies every shard's changed media to the checkout, opens or updates one pull request
//       with them, and opens issues for the shots that failed to record. --report-only just
//       writes the run summary. --dry-run prints what it would do instead. --state writes what
//       the next refresh should know. Artifacts are untrusted: see `loadShard`.
//
// Run from apps/desktop. See apps/website/AGENTS.md (Screenshots and clips).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DESKTOP, loadShots, showPath } from "./shot-list.mjs";

const REPO = path.resolve(DESKTOP, "../..");
const WEBSITE = path.join(REPO, "apps/website");
const DOCS = path.join(WEBSITE, "src/content/docs");
const MEDIA = "apps/website/public/docs/media";
const MANIFEST = "apps/website/src/data/docs-media.json";
const SHOTS_DIR = "apps/desktop/scripts/docs-media/shots";

/**
 * A change to any of these can change every picture, so every shot is recorded again: the
 * recorder itself, the shared components and styles, and the app's dependencies.
 * Labels (en.json) count per key instead: see `plan`.
 */
const EVERY_SHOT = [
    /^apps\/desktop\/scripts\/docs-media\/(capture|shot-list)\.mjs$/,
    /^apps\/desktop\/scripts\/media-kit\//,
    /^apps\/desktop\/src\/styles\//,
    /^apps\/desktop\/src\/.*\.css$/,
    /^apps\/desktop\/package\.json$/,
    /^apps\/desktop\/(vite|tailwind)\.config\./,
    /^packages\/ui\/src\//,
    /^packages\/ui\/package\.json$/,
    /^pnpm-lock\.yaml$/,
];
/** Tests and stories never change a picture. */
const NOT_APP = /(__test__|__mocks__|\.test\.|\.spec\.|\.stories\.)/;
const LABELS = "apps/desktop/i18n/en.json";

/** Leaf keys of a nested object, as dotted paths. */
function leaves(obj, prefix = "", out = new Map()) {
    for (const [k, v] of Object.entries(obj ?? {})) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") leaves(v, p, out);
        else out.set(p, v);
    }
    return out;
}

/** How long a shot takes to record, relative to a still in one theme (for balancing shards). */
const COST = { still: 1, clip: 3 };
/**
 * About this many still-equivalents per shard. At up to 2 minutes each on a GitHub runner, and
 * recorded twice when everything changed, that fits the time limits in docs-media.yaml.
 */
const SHARD_COST = 20;
/** At most this many parallel jobs: a full run of 256 still-equivalents takes 13. */
const MAX_SHARDS = 14;

/**
 * When a recording counts as changed. Two recordings of the same state are never quite the
 * same pixels (software drawing and lossy WebP), so pixels are compared as the render
 * comparison does (e2e/browser/render/compare.mts): a pixel differs only when nothing within
 * one pixel of it in the other image is within 24 in every channel. A real change (a label, a
 * moved control, a new color) leaves a dense patch of differing pixels; noise leaves scattered
 * ones. So a recording changed when its size changed, or when any 32 × 32 block has more than
 * BLOCK of its pixels differing, or more than SPREAD of all its pixels differ.
 *
 * Blocks sit on a fixed grid, so a small solid change across their edges slips under BLOCK, and
 * a shift of 24 or less passes the pixel rule. Two more checks catch those:
 * - PATCH: more than this share of any patchSize × patchSize square differs, wherever it sits
 *   (a new icon, a reworded label). On repeat recordings the densest square was 0.29, and the
 *   confirm pass drops whatever two new recordings disagree on.
 * - TONE: the average color of a toneSize × toneSize square moved by more than this in any
 *   channel (a recolored panel). On repeat recordings the most was 1.6, of 255.
 * Icons under about 12 pixels and tone changes under 6 are still missed: see apps/website/AGENTS.md.
 */
export const THRESHOLD = {
    block: 0.15,
    spread: 0.002,
    blockSize: 32,
    patch: 0.35,
    patchSize: 12,
    tone: 6,
    toneSize: 64,
};

const git = (...args) =>
    execFileSync("git", args, {
        cwd: REPO,
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"],
    });
const gitBuffer = (...args) =>
    execFileSync("git", args, {
        cwd: REPO,
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"],
    });
const tryGit = (...args) => {
    try {
        return git(...args).trim();
    } catch {
        return "";
    }
};
/** Whether a git command succeeds (`cat-file -e`, `merge-base --is-ancestor`). */
const gitOk = (...args) => {
    try {
        execFileSync("git", args, { cwd: REPO, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};
/** A path relative to the repo (capture.mjs reports absolute paths; shard.json keeps relative). */
const rel = (file) =>
    path.isAbsolute(file) ? path.relative(REPO, file) : file;

function parseArgs(argv) {
    const options = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // in-docker.sh adds --software-gl or --gpu-gl for the recorder; nothing here draws
        if (arg === "--software-gl" || arg === "--gpu-gl") continue;
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith("--"))
                options[key] = true;
            else options[key] = argv[++i];
        } else options._.push(arg);
    }
    return options;
}

/** The media files a shot writes, repo-relative. */
function mediaFiles(shot, theme) {
    const themes = theme ? [theme] : (shot.themes ?? ["light", "dark"]);
    return themes.flatMap((t) => {
        const base = `${MEDIA}/${shot.chapter}/${shot.id}.${t}`;
        return shot.kind === "clip"
            ? [`${base}.mp4`, `${base}.webp`]
            : [`${base}.webp`];
    });
}

// ── Pages ────────────────────────────────────────────────────────────────────────────────

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.mdx?$/.test(e.name) ? [p] : [];
    });
}

/** Every guide page: its file, URL, `covers`, and the shot ids it shows. */
export function guidePages() {
    return walk(DOCS).map((file) => {
        const text = fs.readFileSync(file, "utf8");
        const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
        const coversBlock = fm.match(/^covers:\n((?:\s+-.*\n?)*)/m)?.[1] ?? "";
        const covers = [...coversBlock.matchAll(/^\s*-\s*(.+)$/gm)].map((m) =>
            m[1].trim().replace(/^["']|["']$/g, ""),
        );
        const shots = [
            ...text.matchAll(/<Media\b[^>]*?\bid=["']([^"']+)["']/gs),
        ].map((m) => m[1]);
        const labels = [...text.matchAll(/<Ui\s+k=["']([^"']+)["']/g)].map(
            (m) => m[1],
        );
        const slug = path
            .relative(DOCS, file)
            .replace(/\.mdx?$/, "")
            .replace(/(^|\/)index$/, "");
        return { file: rel(file), url: `/${slug}/`, covers, shots, labels };
    });
}

/** The pages that show `id`. */
export const pagesFor = (id, pages = guidePages()) =>
    pages.filter((p) => p.shots.includes(id));

// ── Plan ─────────────────────────────────────────────────────────────────────────────────

/** Whether `file` is `cover` or inside it (a cover can be a folder). */
const covered = (file, cover) =>
    file === cover || file.startsWith(`${cover.replace(/\/$/, "")}/`);

/** The chapter files each chapter imports (shots/x.mjs importing ./y.mjs), repo-relative. */
function chapterSources(chapter) {
    const own = `${SHOTS_DIR}/${chapter}.mjs`;
    const text = fs.readFileSync(path.join(REPO, own), "utf8");
    const imported = [...text.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map(
        (m) => `${SHOTS_DIR}/${m[1]}`,
    );
    return [own, ...imported];
}

/**
 * Which shots to record again, and why. A shot is recorded again when something it depends
 * on changed since it was last recorded (the last commit that changed its media) or since
 * `since` (the last refresh), whichever is later:
 * - anything in EVERY_SHOT (tests and stories never count),
 * - a label (en.json key) that the page showing it uses, with <Ui k> or an `i18n:` cover,
 * - its chapter file (or one it imports), or the show it opens,
 * - a file in its own `covers`, or in the `covers` of a guide page that shows it.
 * A shot with no media yet is always recorded. `all` records every shot; `keep` (a branch,
 * e.g. the open refresh pull request) adds the shots whose media it changes, so a refresh that
 * hasn't been merged yet isn't lost when the next one replaces it; `retry` adds the shots the
 * last refresh couldn't finish (failed, unstable or never recorded). `only` (shot ids or
 * chapters) records just those, and an id that matches nothing is an error.
 */
// eslint-disable-next-line max-lines-per-function -- one pass, read top to bottom
export async function plan({
    all = false,
    only,
    since,
    keep,
    retry = [],
    shards: maxShards = MAX_SHARDS,
} = {}) {
    const shots = await loadShots();
    const unknown = (only ?? []).filter(
        (name) => !shots.some((s) => s.id === name || s.chapter === name),
    );
    if (unknown.length)
        throw new Error(`no shot or chapter called ${unknown.join(", ")}`);
    const pages = guidePages();
    const head = git("rev-parse", "HEAD").trim();
    const sinceOk = since
        ? tryGit("rev-parse", "--verify", "--quiet", `${since}^{commit}`)
        : "";
    const diffs = new Map();
    const changedSince = (base) => {
        if (!diffs.has(base))
            diffs.set(
                base,
                git("diff", "--name-only", base, head)
                    .split("\n")
                    .filter(Boolean),
            );
        return diffs.get(base);
    };
    const labelDiffs = new Map();
    /** The en.json keys whose text changed or went away since `base`. */
    const changedLabels = (base) => {
        if (!labelDiffs.has(base)) {
            let before = {};
            try {
                before = JSON.parse(git("show", `${base}:${LABELS}`));
            } catch {
                /* no labels file then */
            }
            const now = leaves(
                JSON.parse(fs.readFileSync(path.join(REPO, LABELS), "utf8")),
            );
            labelDiffs.set(
                base,
                [...leaves(before)]
                    .filter(([k, v]) => now.get(k) !== v)
                    .map(([k]) => k),
            );
        }
        return labelDiffs.get(base);
    };
    const kept = new Set();
    if (keep && gitOk("rev-parse", "--verify", "--quiet", `${keep}^{commit}`)) {
        const files = git(
            "diff",
            "--name-only",
            `${head}...${keep}`,
            "--",
            MEDIA,
        )
            .split("\n")
            .filter(Boolean);
        for (const f of files) kept.add(path.basename(f).split(".")[0]);
    }

    const chosen = [];
    for (const shot of shots) {
        const why = [];
        if (only) {
            if (!only.includes(shot.id) && !only.includes(shot.chapter))
                continue;
            why.push("asked for");
        }
        if (all) why.push("every shot");
        if (kept.has(shot.id)) why.push(`changed in ${keep}`);
        if (retry.includes(shot.id)) why.push("not finished last time");
        const files = mediaFiles(shot).filter((f) =>
            fs.existsSync(path.join(REPO, f)),
        );
        let base = files.length
            ? tryGit("log", "-1", "--format=%H", "--", ...files)
            : "";
        if (!base && !only) why.push("no recording yet");
        else if (!why.length) {
            // The later of the last recording and the last refresh
            if (sinceOk && gitOk("merge-base", "--is-ancestor", base, sinceOk))
                base = sinceOk;
            const changed = changedSince(base);
            const sources = new Set([
                ...chapterSources(shot.chapter),
                rel(showPath(shot)),
            ]);
            const covers = [
                ...(shot.covers ?? []),
                ...pagesFor(shot.id, pages).flatMap((p) =>
                    p.covers.filter((c) => !/^(i18n|action):/.test(c)),
                ),
            ];
            for (const f of changed) {
                if (NOT_APP.test(f)) continue;
                if (EVERY_SHOT.some((r) => r.test(f))) why.push(f);
                else if (sources.has(f)) why.push(f);
                else if (covers.some((c) => covered(f, c))) why.push(f);
            }
            // A changed label: the shots on pages that use it (<Ui k> or an i18n: cover)
            if (changed.includes(LABELS))
                for (const key of changedLabels(base)) {
                    const page = pagesFor(shot.id, pages).find(
                        (p) =>
                            p.labels.includes(key) ||
                            p.covers.some(
                                (c) =>
                                    c.startsWith("i18n:") &&
                                    (key === c.slice(5) ||
                                        key.startsWith(`${c.slice(5)}.`)),
                            ),
                    );
                    if (page) why.push(`label ${key}`);
                }
        }
        if (why.length)
            chosen.push({
                id: shot.id,
                chapter: shot.chapter,
                kind: shot.kind,
                themes: shot.themes ?? ["light", "dark"],
                why: [...new Set(why)].slice(0, 5),
            });
    }

    // Shards balanced by cost, chapters kept in order inside each
    const cost = (s) => COST[s.kind] * s.themes.length;
    const total = chosen.reduce((sum, s) => sum + cost(s), 0);
    const count = Math.max(
        1,
        Math.min(Number(maxShards), Math.ceil(total / SHARD_COST)),
    );
    const bins = Array.from({ length: chosen.length ? count : 0 }, () => ({
        cost: 0,
        shots: [],
    }));
    for (const s of [...chosen].sort((a, b) => cost(b) - cost(a))) {
        const bin = bins.reduce((a, b) => (b.cost < a.cost ? b : a));
        bin.cost += cost(s);
        bin.shots.push(s.id);
    }
    const order = new Map(shots.map((s, i) => [s.id, i]));
    for (const b of bins) b.shots.sort((a, c) => order.get(a) - order.get(c));
    return {
        head,
        since: sinceOk || null,
        shots: chosen,
        cost: total,
        shards: bins.map((b, i) => ({
            name: `shard-${i + 1}`,
            cost: b.cost,
            shots: b.shots.join(" "),
        })),
    };
}

// ── Compare ──────────────────────────────────────────────────────────────────────────────

const ffmpeg = (args, input) =>
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], {
        input,
        maxBuffer: 1 << 30,
        stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });

function probe(file) {
    const out = execFileSync(
        "ffprobe",
        [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            file,
        ],
        { encoding: "utf8" },
    );
    const json = JSON.parse(out);
    return {
        width: json.streams[0].width,
        height: json.streams[0].height,
        seconds: Number(json.format?.duration) || 0,
    };
}

/** One frame of an image or clip as RGBA pixels: `at` is "first", "last" or seconds. */
export function decode(file, at = "first") {
    const { width, height, seconds } = probe(file);
    const seek =
        at === "last"
            ? ["-sseof", "-0.25"]
            : typeof at === "number"
              ? ["-ss", String(at)]
              : [];
    // One frame: a whole clip doesn't fit in memory. "last" takes all of its quarter second
    const limit = at === "last" ? [] : ["-frames:v", "1"];
    const raw = ffmpeg([
        ...seek,
        "-i",
        file,
        ...limit,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
    ]);
    const frame = width * height * 4;
    if (raw.length < frame) throw new Error(`${file}: no frame at ${at}`);
    // "last" decodes the final quarter second: keep its last frame
    const start = at === "last" ? raw.length - frame : 0;
    return { width, height, seconds, data: raw.subarray(start, start + frame) };
}

/**
 * How much two frames differ, as the render comparison counts it, and a before | after | diff
 * picture (RGBA) when asked. Frames of different sizes differ completely.
 */
// eslint-disable-next-line max-lines-per-function -- one pass, read top to bottom
export function diffFrames(
    a,
    b,
    { picture = false, threshold = THRESHOLD } = {},
) {
    if (a.width !== b.width || a.height !== b.height)
        return {
            sizeChanged: true,
            changed: true,
            differing: 1,
            ratio: 1,
            block: 1,
            patch: 1,
            tone: 255,
        };
    const { width: w, height: h } = a;
    const p = a.data;
    const q = b.data;
    const near = (src, dst, x, y) => {
        const i = (y * w + x) * 4;
        for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const j = (ny * w + nx) * 4;
                if (
                    Math.abs(src[i] - dst[j]) <= 24 &&
                    Math.abs(src[i + 1] - dst[j + 1]) <= 24 &&
                    Math.abs(src[i + 2] - dst[j + 2]) <= 24
                )
                    return true;
            }
        }
        return false;
    };
    const size = threshold.blockSize;
    const bw = Math.ceil(w / size);
    const blocks = new Uint32Array(bw * Math.ceil(h / size));
    // Differing pixels above and left of each point, so any square can be counted at once
    const counts = new Uint32Array((w + 1) * (h + 1));
    // Summed color differences over tiles half the size of the squares `tone` looks at
    const tile = Math.floor(threshold.toneSize / 2);
    const tw = Math.floor(w / tile);
    const tones = new Int32Array(tw * Math.floor(h / tile) * 3);
    const diff = picture ? Buffer.alloc(w * h * 4) : null;
    let differing = 0;
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const same = near(p, q, x, y) && near(q, p, x, y);
            if (!same) {
                differing++;
                row++;
                blocks[Math.floor(y / size) * bw + Math.floor(x / size)]++;
            }
            counts[(y + 1) * (w + 1) + x + 1] =
                counts[y * (w + 1) + x + 1] + row;
            const tx = Math.floor(x / tile);
            const ty = Math.floor(y / tile);
            if (tx < tw && (ty + 1) * tile <= h)
                for (let c = 0; c < 3; c++)
                    tones[(ty * tw + tx) * 3 + c] += p[i + c] - q[i + c];
            if (diff) {
                const la = (p[i] + p[i + 1] + p[i + 2]) / 3;
                if (same) {
                    const v = 255 - (255 - la) * 0.25;
                    diff[i] = diff[i + 1] = diff[i + 2] = v;
                } else if ((q[i] + q[i + 1] + q[i + 2]) / 3 < la) {
                    diff[i] = 220;
                } else {
                    diff[i + 1] = 90;
                    diff[i + 2] = 255;
                }
                diff[i + 3] = 255;
            }
        }
    }
    const patchSize = threshold.patchSize;
    let densest = 0;
    for (let y = 0; y + patchSize <= h; y++)
        for (let x = 0; x + patchSize <= w; x++) {
            const inside =
                counts[(y + patchSize) * (w + 1) + x + patchSize] -
                counts[y * (w + 1) + x + patchSize] -
                counts[(y + patchSize) * (w + 1) + x] +
                counts[y * (w + 1) + x];
            if (inside > densest) densest = inside;
        }
    const patch = densest / (patchSize * patchSize);
    let tone = 0;
    const th = tw ? tones.length / 3 / tw : 0;
    for (let ty = 0; ty + 1 < th; ty++)
        for (let tx = 0; tx + 1 < tw; tx++)
            for (let c = 0; c < 3; c++) {
                const at = (ax, ay) => tones[(ay * tw + ax) * 3 + c];
                const sum =
                    at(tx, ty) +
                    at(tx + 1, ty) +
                    at(tx, ty + 1) +
                    at(tx + 1, ty + 1);
                tone = Math.max(tone, Math.abs(sum) / (4 * tile * tile));
            }
    const block = Math.max(...blocks) / (size * size);
    const ratio = differing / (w * h);
    const result = {
        sizeChanged: false,
        changed:
            block > threshold.block ||
            ratio > threshold.spread ||
            patch > threshold.patch ||
            tone > threshold.tone,
        differing,
        ratio,
        block,
        patch,
        tone,
    };
    if (diff) {
        // Before, after and diff side by side
        const row = w * 4;
        const out = Buffer.alloc(row * 3 * h);
        for (let y = 0; y < h; y++) {
            p.copy(out, y * row * 3, y * row, (y + 1) * row);
            q.copy(out, y * row * 3 + row, y * row, (y + 1) * row);
            diff.copy(out, y * row * 3 + row * 2, y * row, (y + 1) * row);
        }
        result.picture = { width: w * 3, height: h, data: out };
    }
    return result;
}

/** Writes RGBA pixels as a PNG, at most `maxWidth` wide. */
function writePng({ width, height, data }, file, maxWidth = 2400) {
    ffmpeg(
        [
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            `${width}x${height}`,
            "-i",
            "pipe:0",
            "-vf",
            `scale='min(${maxWidth},iw)':-2:flags=area`,
            "-frames:v",
            "1",
            file,
        ],
        data,
    );
}

/** The committed version of a repo file at HEAD, written to a temporary file (or null). */
function committed(file, tmp) {
    try {
        const out = path.join(tmp, file.replaceAll("/", "__"));
        fs.writeFileSync(out, gitBuffer("show", `HEAD:${file}`));
        return out;
    } catch {
        return null;
    }
}

/**
 * How much two recordings of a shot differ. Stills: the image. Clips: the first, middle and
 * last frames, and the length. With `diffPng`, writes a before | after | diff picture there
 * when they differ.
 */
function compareFiles(before, after, kind, diffPng) {
    const points = kind === "clip" ? ["first", "middle", "last"] : ["first"];
    const beforeInfo = probe(before);
    const afterInfo = probe(after);
    const lengthChanged =
        kind === "clip" &&
        Math.abs(beforeInfo.seconds - afterInfo.seconds) > 0.1;
    let worst = null;
    for (const point of points) {
        const at = (info) => (point === "middle" ? info.seconds / 2 : point);
        const d = diffFrames(
            decode(before, at(beforeInfo)),
            decode(after, at(afterInfo)),
            {
                picture: Boolean(diffPng),
            },
        );
        if (!worst || d.block > worst.block || d.changed)
            worst = { ...d, point };
        if (d.changed) break;
    }
    const changed = worst.changed || lengthChanged;
    const metrics = {
        changed,
        reason: worst.sizeChanged
            ? `size ${beforeInfo.width}×${beforeInfo.height} → ${afterInfo.width}×${afterInfo.height}`
            : lengthChanged
              ? `length ${beforeInfo.seconds.toFixed(1)} s → ${afterInfo.seconds.toFixed(1)} s`
              : `${(worst.ratio * 100).toFixed(2)}% of pixels, ${(worst.block * 100).toFixed(0)}% of the worst block, color moved by ${worst.tone.toFixed(0)}${kind === "clip" ? ` (${worst.point} frame)` : ""}`,
        ratio: worst.ratio,
        block: worst.block,
    };
    if (changed && worst.picture) {
        writePng(worst.picture, diffPng);
        metrics.diff = diffPng;
    }
    return metrics;
}

/** The file that's compared for a recording: the clip itself, or the still. */
const mainFile = (result) =>
    result.files
        .map(rel)
        .find((f) => f.endsWith(result.kind === "clip" ? ".mp4" : ".webp"));

/** Compares one recording (a shot in one theme) in the checkout with HEAD. */
function compareRecording(result, tmp, diffsDir) {
    const main = mainFile(result);
    const before = committed(main, tmp);
    if (!before) return { changed: true, reason: "new" };
    return compareFiles(
        before,
        path.join(REPO, main),
        result.kind,
        path.join(diffsDir, `${result.id}.${result.theme}.png`),
    );
}

/** A contact sheet of the changed clips in `out`, or none. */
async function clipSheet(report, out) {
    const sheet = path.join(out, "diffs", "clips-contact-sheet.png");
    fs.rmSync(sheet, { force: true });
    const clips = report.filter((r) => r.changed && r.kind === "clip");
    if (!clips.length) return;
    const { contactSheet } = await import("../media-kit/encode.mjs");
    contactSheet(
        clips.map((r) => {
            const mp4 = path.join(out, "media", mainFile(r));
            return { mp4, seconds: probe(mp4).seconds };
        }),
        sheet,
    );
}

/**
 * Compares every recording in a capture run with HEAD. Recordings that didn't visibly change
 * are put back (so the checkout keeps the committed bytes); changed ones are copied to `out`
 * with their diff pictures, the manifest entries and a contact sheet of changed clips.
 */
// eslint-disable-next-line max-lines-per-function -- one pass, read top to bottom
export async function compare({ work, out }) {
    const results = JSON.parse(
        fs.readFileSync(path.join(work, "results.json"), "utf8"),
    );
    fs.mkdirSync(path.join(out, "diffs"), { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-media-compare-"));
    const report = [];
    for (const result of results) {
        if (!result.ok) {
            report.push({
                ...result,
                screenshot: undefined,
                hasScreenshot: Boolean(result.screenshot),
            });
            if (result.screenshot)
                fs.copyFileSync(
                    result.screenshot,
                    path.join(
                        out,
                        "diffs",
                        `${result.id}.${result.theme}.failed.png`,
                    ),
                );
            continue;
        }
        const metrics = compareRecording(result, tmp, path.join(out, "diffs"));
        const files = result.files.map(rel);
        console.log(
            `${metrics.changed ? "changed  " : "unchanged"} ${result.id} (${result.theme}): ${metrics.reason}`,
        );
        if (metrics.changed)
            for (const f of files) {
                const to = path.join(out, "media", f);
                fs.mkdirSync(path.dirname(to), { recursive: true });
                fs.copyFileSync(path.join(REPO, f), to);
            }
        else
            for (const f of files)
                // The committed bytes back (without touching the index: in-docker.sh mounts
                // a worktree's git folder read-only)
                if (gitOk("cat-file", "-e", `HEAD:${f}`))
                    fs.writeFileSync(
                        path.join(REPO, f),
                        gitBuffer("show", `HEAD:${f}`),
                    );
        report.push({
            id: result.id,
            chapter: result.chapter,
            theme: result.theme,
            kind: result.kind,
            ok: true,
            files,
            ...metrics,
            diff: metrics.diff ? path.basename(metrics.diff) : undefined,
        });
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    // Manifest entries: the new one for a shot that changed in any theme, else the committed one
    const changedIds = new Set(
        report.filter((r) => r.changed).map((r) => r.id),
    );
    const current = JSON.parse(
        fs.readFileSync(path.join(REPO, MANIFEST), "utf8"),
    );
    let atHead = {};
    try {
        atHead = JSON.parse(git("show", `HEAD:${MANIFEST}`));
    } catch {
        /* a manifest that's new in this checkout */
    }
    const manifest = {};
    for (const id of new Set(report.map((r) => r.id))) {
        if (changedIds.has(id)) manifest[id] = current[id];
        else if (atHead[id]) current[id] = atHead[id];
        else delete current[id];
    }
    fs.writeFileSync(
        path.join(REPO, MANIFEST),
        `${JSON.stringify(current, null, 4)}\n`,
    );

    await clipSheet(report, out);
    fs.writeFileSync(
        path.join(out, "shard.json"),
        `${JSON.stringify({ results: report, manifest }, null, 2)}\n`,
    );
    const changed = report.filter((r) => r.changed).length;
    const failed = report.filter((r) => !r.ok).length;
    console.log(
        `${report.length} recording(s): ${changed} changed, ${failed} failed. Output: ${out}`,
    );
    return { report, manifest };
}

/**
 * The second recording of the shots `compare` found changed (capture.mjs run again on just
 * those, into `work`). A change counts only if the second recording agrees with the first:
 * one that differs run to run (an animation caught at another moment, a layout that settles
 * at different times) is marked unstable and dropped from `out`, so it's reported, not committed.
 *
 * `confirmed: true` in shard.json means every change really was compared. A second recording
 * that crashed or ran out of time has no result for some shots, so this throws and leaves the
 * flag out: `publish` then treats the whole shard as not reported.
 */
export async function confirm({ work, out }) {
    const shardFile = path.join(out, "shard.json");
    const shard = JSON.parse(fs.readFileSync(shardFile, "utf8"));
    const toConfirm = shard.results.filter((x) => x.ok && x.changed);
    const resultsFile = path.join(work, "results.json");
    const second =
        toConfirm.length && fs.existsSync(resultsFile)
            ? JSON.parse(fs.readFileSync(resultsFile, "utf8"))
            : [];
    const absent = toConfirm.filter(
        (r) => !second.some((x) => x.id === r.id && x.theme === r.theme),
    );
    if (absent.length)
        throw new Error(
            `no second recording of ${absent.map((r) => `${r.id} (${r.theme})`).join(", ")}: this shard's changes stay unconfirmed`,
        );
    for (const r of toConfirm) {
        const again = second.find((x) => x.id === r.id && x.theme === r.theme);
        const metrics = again.ok
            ? compareFiles(
                  path.join(out, "media", mainFile(r)),
                  path.join(REPO, mainFile(again)),
                  r.kind,
              )
            : { changed: true, reason: "failed the second time" };
        if (!metrics.changed) {
            console.log(`confirmed ${r.id} (${r.theme})`);
            continue;
        }
        console.log(
            `unstable  ${r.id} (${r.theme}): the two new recordings differ, ${metrics.reason}`,
        );
        r.changed = false;
        r.unstable = `the two new recordings differ: ${metrics.reason}`;
        for (const f of r.files)
            fs.rmSync(path.join(out, "media", f), { force: true });
        if (r.diff)
            fs.renameSync(
                path.join(out, "diffs", r.diff),
                path.join(
                    out,
                    "diffs",
                    r.diff.replace(/\.png$/, ".unstable.png"),
                ),
            );
        r.diff = undefined;
    }
    for (const id of Object.keys(shard.manifest))
        if (!shard.results.some((x) => x.id === id && x.changed))
            delete shard.manifest[id];
    await clipSheet(shard.results, out);
    shard.confirmed = true;
    fs.writeFileSync(shardFile, `${JSON.stringify(shard, null, 2)}\n`);
    return shard;
}

// ── Publish ──────────────────────────────────────────────────────────────────────────────

/** The refresh's own git identity: anything else on its branch is someone's work to keep. */
const BOT = {
    name: "github-actions[bot]",
    email: "41898282+github-actions[bot]@users.noreply.github.com",
};
/** More broken shots than this in one run usually share a cause: one issue, not one each. */
const MAX_ISSUES = 5;
const ROLLUP_TITLE = "User guide: many shots no longer record";
const issueTitle = (id) => `User guide: the "${id}" shot no longer records`;
const code = (ids) => ids.map((id) => `\`${id}\``).join(", ");
/** A shot in one theme. */
const recordingKey = (r) => `${r.id}.${r.theme}`;
/** Text from an artifact, safe on one line of a pull request or a table cell. */
const oneLine = (text, max = 200) =>
    String(text ?? "")
        .replace(/[\r\n|`<>@]+/g, " ")
        .trim()
        .slice(0, max);
/** Text from an artifact, safe inside a code block: its first `lines` lines. */
const fenced = (text, lines = 12) =>
    [
        "```",
        String(text)
            .replace(/`{3,}/g, "'''")
            .split("\n")
            .slice(0, lines)
            .join("\n"),
        "```",
    ].join("\n");

function pageList(id, pages) {
    const using = pagesFor(id, pages);
    return using.length
        ? using
              .map(
                  (p) =>
                      `[\`${p.url}\`](https://openmarch.com${p.url}) (\`${p.file}\`)`,
              )
              .join(", ")
        : "no page (unused shot)";
}

/** Runs a command in the repo, or with `dryRun` prints it (and its input) and returns "". */
function commandRunner(dryRun) {
    return (cmd, args, input) => {
        if (dryRun) {
            console.log(
                `$ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
            );
            if (input) console.log(input.replace(/^/gm, "  | "));
            return "";
        }
        return execFileSync(cmd, args, {
            cwd: REPO,
            encoding: "utf8",
            input,
            stdio: [input ? "pipe" : "ignore", "pipe", "inherit"],
        });
    };
}

/** Throws unless `file` in a shard's media folder is a real, plausible picture or clip. */
function checkMedia(dir, file) {
    const root = fs.realpathSync(path.join(dir, "media"));
    const source = path.resolve(root, file);
    if (!source.startsWith(`${root}${path.sep}`))
        throw new Error(`${file} is outside the media folder`);
    if (fs.realpathSync(source) !== source || !fs.lstatSync(source).isFile())
        throw new Error(`${file} isn't a plain file`);
    const head = fs.readFileSync(source).subarray(0, 12).toString("latin1");
    const looksRight = file.endsWith(".mp4")
        ? head.slice(4, 8) === "ftyp"
        : head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
    if (!looksRight) throw new Error(`${file} isn't what its name says`);
}

/** One entry of a shard's results, rebuilt from checked fields. Throws if it doesn't add up. */
function cleanResult(raw, dir, allowed, known) {
    const shot = allowed.has(raw?.id) ? known.get(raw.id) : undefined;
    if (!shot)
        throw new Error(
            `a result for ${oneLine(raw?.id)}, not one of its shots`,
        );
    if (
        !(shot.themes ?? ["light", "dark"]).includes(raw.theme) ||
        raw.chapter !== shot.chapter ||
        raw.kind !== shot.kind
    )
        throw new Error(`a result for ${shot.id} that doesn't match the shot`);
    const base = {
        id: shot.id,
        chapter: shot.chapter,
        theme: raw.theme,
        kind: shot.kind,
    };
    if (raw.ok !== true)
        return {
            ...base,
            ok: false,
            error: String(raw.error ?? "no error reported").slice(0, 8000),
        };
    // Only the files this shot writes, whatever the artifact lists
    const files = mediaFiles(shot, raw.theme);
    if (
        !Array.isArray(raw.files) ||
        raw.files.length !== files.length ||
        files.some((f) => !raw.files.includes(f))
    )
        throw new Error(`files for ${shot.id} that it doesn't write`);
    const unstable = raw.unstable ? oneLine(raw.unstable) : undefined;
    const changed = raw.changed === true && !unstable;
    if (changed) for (const f of files) checkMedia(dir, f);
    return {
        ...base,
        ok: true,
        files,
        changed,
        unstable,
        reason: oneLine(raw.reason),
    };
}

/** A shard's manifest entry for a shot, rebuilt from checked fields. */
function cleanManifestEntry(raw, shot) {
    const size = (n) => Number.isInteger(n) && n > 0 && n < 20000;
    if (
        raw?.chapter !== shot.chapter ||
        raw.kind !== shot.kind ||
        !size(raw.width) ||
        !size(raw.height) ||
        (shot.kind === "clip" && !(raw.seconds > 0 && raw.seconds < 3600))
    )
        throw new Error(`a bad manifest entry for ${shot.id}`);
    const { chapter, kind, width, height, seconds } = raw;
    return shot.kind === "clip"
        ? { chapter, kind, width, height, seconds }
        : { chapter, kind, width, height };
}

/**
 * A shard's output, checked. Artifacts come from jobs that build and run the app, so nothing
 * in one is trusted: results must be for this shard's planned shots, files must be the ones
 * those shots write, and manifest entries must be for shots it changed. Throws otherwise, and
 * if the shard's changes were never confirmed by a second recording.
 */
function loadShard(dir, planned, known) {
    const raw = JSON.parse(
        fs.readFileSync(path.join(dir, "shard.json"), "utf8"),
    );
    if (raw.confirmed !== true)
        throw new Error("its second recording never finished");
    if (!Array.isArray(raw.results)) throw new Error("no results");
    const allowed = new Set(planned.shots.split(" "));
    const results = raw.results.map((r) => cleanResult(r, dir, allowed, known));
    const changedIds = new Set(
        results.filter((r) => r.changed).map((r) => r.id),
    );
    const extra = Object.keys(raw.manifest ?? {}).filter(
        (id) => !changedIds.has(id),
    );
    if (extra.length)
        throw new Error(
            `manifest entries for ${oneLine(extra.join(", "))}, which it didn't change`,
        );
    const manifest = Object.fromEntries(
        [...changedIds].map((id) => [
            id,
            cleanManifestEntry(raw.manifest?.[id], known.get(id)),
        ]),
    );
    return { dir, results, manifest };
}

/**
 * Every shard's checked output (download-artifact puts each artifact in a folder of its own,
 * docs-media-<shard>), and what's wrong with the ones that can't be used.
 */
function readShards(artifacts, planData, known) {
    const shards = [];
    const rejected = [];
    for (const planned of planData.shards) {
        const dir = path.join(artifacts, `docs-media-${planned.name}`);
        if (!fs.existsSync(path.join(dir, "shard.json"))) continue;
        try {
            shards.push(loadShard(dir, planned, known));
        } catch (error) {
            rejected.push(`\`${planned.name}\`: ${oneLine(error.message)}`);
        }
    }
    return { shards, rejected };
}

/** Copies every shard's changed media, and anything carried over, and merges the manifest. */
function applyShards(shards, carried, tip) {
    const manifestPath = path.join(REPO, MANIFEST);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const write = (file, bytes) => {
        const to = path.join(REPO, file);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, bytes);
    };
    if (carried.length) {
        const kept = JSON.parse(git("show", `${tip}:${MANIFEST}`));
        for (const { file, id } of carried) {
            write(file, gitBuffer("show", `${tip}:${file}`));
            if (kept[id]) manifest[id] = kept[id];
        }
    }
    for (const s of shards) {
        for (const r of s.results.filter((x) => x.changed))
            for (const f of r.files)
                write(f, fs.readFileSync(path.join(s.dir, "media", f)));
        Object.assign(manifest, s.manifest);
    }
    const sorted = Object.fromEntries(
        Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
    );
    fs.writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 4)}\n`);
}

/**
 * The media an open refresh pull request changed whose shot this run didn't record
 * successfully (it failed, came back unstable or wasn't reached), so replacing the branch
 * doesn't lose it. A picture that has since changed on the base branch is left alone.
 */
function carryForward(tip, results) {
    const mergeBase = git("merge-base", "HEAD", tip).trim();
    const settled = new Set(
        results.filter((r) => r.ok && !r.unstable).map(recordingKey),
    );
    const blob = (rev, file) =>
        tryGit("rev-parse", "--verify", "-q", `${rev}:${file}`);
    return git("diff", "--name-only", mergeBase, tip, "--", MEDIA)
        .split("\n")
        .filter(Boolean)
        .map((file) => {
            const [id, theme] = path.basename(file).split(".");
            return { file, id, theme };
        })
        .filter(
            ({ file, id, theme }) =>
                !settled.has(`${id}.${theme}`) &&
                blob(tip, file) &&
                blob("HEAD", file) === blob(mergeBase, file),
        );
}

/** Looks up the open issues whose titles contain `phrase`: `{ number, title }`. */
function openIssues(phrase, { run, repoArgs }) {
    const out = run("gh", [
        "issue",
        "list",
        ...repoArgs,
        "--state",
        "open",
        "--search",
        `"${phrase}" in:title`,
        "--limit",
        "200",
        "--json",
        "number,title",
    ]);
    return out ? JSON.parse(out) : [];
}

/** Opens an issue with `body`, or adds `update` to the open one called `title`. */
function fileIssue(title, body, update, open, { run, repoArgs }) {
    const existing = open.find((i) => i.title === title)?.number;
    if (existing) {
        run(
            "gh",
            [
                "issue",
                "comment",
                String(existing),
                ...repoArgs,
                "--body-file",
                "-",
            ],
            update,
        );
        return `#${existing}`;
    }
    const url = run(
        "gh",
        [
            "issue",
            "create",
            ...repoArgs,
            "--title",
            title,
            "--label",
            "documentation",
            "--body-file",
            "-",
        ],
        body,
    ).trim();
    return url ? `#${url.split("/").pop()}` : "(new issue)";
}

/** One issue for a run where too many shots failed to give each its own. */
function fileRollup(byId, ctx) {
    const { pages, base, runUrl, artifactsLink } = ctx;
    const rows = [...byId].map(
        ([id, fails]) =>
            `| \`${id}\` | ${fails.map((f) => f.theme).join(", ")} | ${oneLine(fails[0].error, 140)} | ${pageList(id, pages)} |`,
    );
    const table = [
        "| Shot | Themes | Error | Pages |",
        "| --- | --- | --- | --- |",
        ...rows,
    ].join("\n");
    const ref = fileIssue(
        ROLLUP_TITLE,
        [
            `The scheduled user guide refresh of \`${base}\` couldn't record ${byId.size} shots. That many at once usually has one cause: something the recorder relies on changed, or the app didn't start.`,
            table,
            `Screenshots of the windows when they failed are \`diffs/<shot>.<theme>.failed.png\` in ${artifactsLink}.`,
        ].join("\n\n"),
        `Still failing in ${runUrl || "the latest refresh"}:\n\n${table}`,
        openIssues(ROLLUP_TITLE, ctx),
        ctx,
    );
    return new Map([...byId.keys()].map((id) => [id, ref]));
}

/**
 * Opens an issue for each shot that failed to record, naming the pages that show it, or
 * comments on the open one. Returns each shot's issue reference. Above MAX_ISSUES shots, files
 * one issue for all of them instead.
 */
function fileIssues(failures, ctx) {
    const { pages, base, runUrl, artifactsLink } = ctx;
    const byId = Map.groupBy(failures, (r) => r.id);
    if (byId.size > MAX_ISSUES) return fileRollup(byId, ctx);
    const open = openIssues("no longer records", ctx);
    const links = new Map();
    for (const [id, fails] of byId) {
        const error = fenced(fails[0].error);
        const body = [
            `The scheduled user guide refresh of \`${base}\` couldn't record the \`${id}\` shot (\`${SHOTS_DIR}/${fails[0].chapter}.mjs\`) in ${fails.map((f) => f.theme).join(" and ")}. The app has probably changed under the shot's setup: a control moved, was renamed, or opens differently.`,
            `**Pages that show it:** ${pageList(id, pages)}. They keep the last good recording until the shot is fixed, so check their words too.`,
            error,
            `A screenshot of the window when it failed is \`diffs/${id}.<theme>.failed.png\` in ${artifactsLink}.`,
            `To fix: update the shot's \`setup\` or \`perform\` to match the app, record it (\`scripts/media-kit/in-docker.sh scripts/docs-media/capture.mjs ${id}\` from \`apps/desktop\`), look at the result, and update the pages if the steps changed. See \`apps/website/AGENTS.md\`.`,
        ].join("\n\n");
        const update = `Still failing in ${runUrl || "the latest refresh"}:\n\n${error}`;
        links.set(id, fileIssue(issueTitle(id), body, update, open, ctx));
    }
    return links;
}

/** The refresh branch's commit on the remote, fetched, or "" if there's no such branch. */
function remoteBranch(branch, dryRun) {
    const ref = `refs/remotes/origin/${branch}`;
    if (dryRun) return tryGit("rev-parse", "--verify", "-q", ref);
    const tip = git("ls-remote", "origin", `refs/heads/${branch}`).split(
        /\s/,
    )[0];
    if (tip) git("fetch", "origin", `+refs/heads/${branch}:${ref}`);
    return tip;
}

/**
 * Replaces `docs/media-refresh/<base>` with one commit of the changed media (and what the open
 * pull request had that this run couldn't redo), and opens or updates its pull request. Throws
 * instead of replacing a branch someone else has committed to. Returns the shots carried over.
 */
// eslint-disable-next-line max-lines-per-function -- one pass, read top to bottom
function openPullRequest(changed, notes, ctx) {
    const { base, recorded, pages, run, repoArgs, runUrl, artifactsLink } = ctx;
    const branch = `docs/media-refresh/${base}`;
    const tip = remoteBranch(branch, ctx.dryRun);
    const foreign = tip
        ? git("log", "--format=%ae %h", `HEAD..${tip}`)
              .split("\n")
              .filter(Boolean)
              .filter((line) => !line.startsWith(`${BOT.email} `))
        : [];
    if (foreign.length)
        throw new Error(
            `${branch} has commits the refresh didn't make (${foreign.map((l) => l.split(" ")[1]).join(", ")}), so it wasn't replaced. Merge or close its pull request and delete the branch.`,
        );
    const open = run("gh", [
        "pr",
        "list",
        ...repoArgs,
        "--head",
        branch,
        "--base",
        base,
        "--state",
        "open",
        "--json",
        "number",
        "--jq",
        ".[0].number",
    ]).trim();
    // A closed or merged pull request's old branch has nothing worth keeping
    const carried = tip && open ? carryForward(tip, ctx.results) : [];
    const ids = [...new Set(changed.map((r) => r.id))];
    const carriedIds = [...new Set(carried.map((c) => c.id))];
    const rows = [
        ...ids.map((id) => {
            const rs = changed.filter((r) => r.id === id);
            return `| \`${id}\` | ${rs.map((r) => `${r.theme}: ${r.reason}`).join("<br>")} | ${pageList(id, pages)} |`;
        }),
        ...carriedIds
            .filter((id) => !ids.includes(id))
            .map(
                (id) =>
                    `| \`${id}\` | kept from the last refresh: this run couldn't record it again | ${pageList(id, pages)} |`,
            ),
    ];
    const body = [
        `The scheduled user guide refresh recorded ${recorded} shot(s) again from \`${base}\`, and these look different from the committed ones (each was recorded twice, and both recordings agreed). Look at each picture in **Files changed** and check that it still shows what its page says.`,
        [
            "| Shot | What changed | Pages |",
            "| --- | --- | --- |",
            ...rows,
        ].join("\n"),
        `Before \\| after \\| diff pictures for each changed recording (red: darker now, blue: lighter) and a contact sheet of the changed clips are in \`diffs/\` in ${artifactsLink}.`,
        ...notes,
        "## User guide",
        "Pictures only; no page text changed. If a picture now contradicts its page, fix the page in this pull request. Once anyone else commits here, the refresh stops replacing this branch until the pull request is merged or closed.",
    ].join("\n\n");
    if (ctx.dryRun)
        console.log(`(dry run: not copying ${ctx.shards.length} shard(s))`);
    else applyShards(ctx.shards, carried, tip);
    run("git", ["switch", "-C", branch]);
    run("git", ["add", "--", MEDIA, MANIFEST]);
    run("git", [
        "-c",
        `user.name=${BOT.name}`,
        "-c",
        `user.email=${BOT.email}`,
        "commit",
        "-m",
        `docs: record ${ids.length} user guide picture(s) again`,
        "-m",
        `Recorded by the scheduled refresh${runUrl ? ` (${runUrl})` : ""}.`,
    ]);
    // The lease fails if the branch moved since the check above
    run("git", [
        "push",
        `--force-with-lease=refs/heads/${branch}:${tip}`,
        "origin",
        `HEAD:refs/heads/${branch}`,
    ]);
    if (open)
        run("gh", ["pr", "edit", open, ...repoArgs, "--body-file", "-"], body);
    else
        run(
            "gh",
            [
                "pr",
                "create",
                ...repoArgs,
                "--base",
                base,
                "--head",
                branch,
                "--title",
                `docs: refresh the user guide's pictures (${ids.length})`,
                "--label",
                "documentation",
                "--body-file",
                "-",
            ],
            body,
        );
    return carriedIds;
}

/**
 * Checks every shard's output, then opens or updates one pull request with the changed media
 * and an issue for each shot that failed, in that order, so a problem with issues can't hold
 * up the pictures. With `reportOnly`, or for a run that can't publish, it only writes the run
 * summary. Writes `stateFile` for the next refresh: this commit, and every shot this one left
 * unfinished, so those are tried again even though the commit counts as done.
 */
// eslint-disable-next-line max-lines-per-function -- one pass, read top to bottom
export async function publish({
    artifacts,
    base,
    planFile,
    runUrl = "",
    repo,
    dryRun = false,
    reportOnly = false,
    stateFile,
}) {
    const planData = JSON.parse(fs.readFileSync(planFile, "utf8"));
    const known = new Map((await loadShots()).map((s) => [s.id, s]));
    const { shards, rejected } = readShards(artifacts, planData, known);
    const results = shards.flatMap((s) => s.results);
    const ids = (filter) => [
        ...new Set(results.filter(filter).map((r) => r.id)),
    ];
    const reported = new Set(results.map(recordingKey));
    const planned = planData.shots.filter((s) => known.has(s.id));
    const ctx = {
        base,
        shards,
        results,
        recorded: new Set(results.map((r) => r.id)).size,
        pages: guidePages(),
        run: commandRunner(dryRun),
        dryRun,
        repoArgs: repo ? ["-R", repo] : [],
        runUrl,
        artifactsLink: runUrl
            ? `${runUrl}#artifacts`
            : "the workflow run's artifacts",
    };
    const changed = results.filter((r) => r.changed);
    const changedIds = ids((r) => r.changed);
    const failures = results.filter((r) => !r.ok);
    const failed = ids((r) => !r.ok);
    // A shot with a theme nobody reported counts too: its shard stopped partway
    const missing = planned
        .filter((s) =>
            s.themes.some(
                (t) => !reported.has(recordingKey({ id: s.id, theme: t })),
            ),
        )
        .map((s) => s.id);
    const unchanged = ids((r) => r.ok && !r.changed && !r.unstable).filter(
        (id) => !changedIds.includes(id),
    );
    const unstable = results.filter((r) => r.unstable);
    const notes = [
        unchanged.length &&
            `Recorded with no visible change: ${code(unchanged)}.`,
        unstable.length &&
            `Left out because two recordings of the same app differed (the shot isn't repeatable; make its setup wait for a steady state): ${unstable.map((r) => `\`${r.id}\` (${r.theme}: ${r.unstable.replace(/^the two new recordings differ: /, "")})`).join(", ")}.`,
        failed.length && `Failed to record: ${code(failed)}.`,
        missing.length &&
            `Not recorded because their job failed or timed out: ${code(missing)}.`,
        ...rejected.map(
            (r) =>
                `Ignored this job's output, so nothing from it is here: ${r}.`,
        ),
    ].filter(Boolean);

    const problems = [];
    let issues = new Map();
    let carriedIds = [];
    let published = false;
    if (reportOnly) {
        notes.unshift(
            "Report only: this run opened no pull request and no issues. The recordings and diffs are in its artifacts.",
        );
        for (const r of failures)
            notes.push(`\`${r.id}\` (${r.theme}):\n\n${fenced(r.error)}`);
    } else {
        if (changed.length)
            try {
                carriedIds = openPullRequest(changed, notes, ctx);
                published = true;
            } catch (error) {
                problems.push(
                    `No pull request: ${oneLine(error.message, 500)}`,
                );
            }
        else console.log("No recording changed: no pull request.");
        if (failures.length)
            try {
                issues = fileIssues(failures, ctx);
            } catch (error) {
                problems.push(
                    `Issues not filed: ${oneLine(error.message, 500)}`,
                );
            }
    }
    if (rejected.length) problems.push(...rejected);

    const summary = [
        "### User guide media refresh",
        changedIds.length
            ? `${reportOnly ? "Would change" : "Changed"}: ${code(changedIds)}.`
            : "No picture changed.",
        carriedIds.length &&
            `Kept from the open pull request, because this run couldn't record them again: ${code(carriedIds)}.`,
        issues.size > 0 &&
            `Issues: ${[...issues].map(([id, ref]) => `\`${id}\` ${ref}`).join(", ")}.`,
        ...notes,
        ...problems.map((p) => `**Problem:** ${p}`),
    ]
        .filter(Boolean)
        .join("\n\n");
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    if (stateFile) {
        const retry = new Set([
            ...failed,
            ...missing,
            ...unstable.map((r) => r.id),
            // Found but never published: the next run has to find them again
            ...(reportOnly || published ? [] : changedIds),
        ]);
        fs.writeFileSync(
            stateFile,
            `${JSON.stringify({ head: planData.head, retry: [...retry] }, null, 2)}\n`,
        );
    }
    return { changed: changedIds, failed, missing, problems };
}

/** What the last refresh left: its commit (`since`) and the shots to try again. */
function readState(file) {
    if (!file || !fs.existsSync(file)) return { retry: [] };
    try {
        const state = JSON.parse(fs.readFileSync(file, "utf8"));
        return {
            since: /^[0-9a-f]{40}$/.test(state.head) ? state.head : undefined,
            retry: Array.isArray(state.retry)
                ? state.retry.filter((id) => typeof id === "string")
                : [],
        };
    } catch (error) {
        console.error(`ignoring ${file}: ${error.message}`);
        return { retry: [] };
    }
}

// ── Command line ─────────────────────────────────────────────────────────────────────────

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) ===
        path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
    const [command, ...rest] = process.argv.slice(2);
    const o = parseArgs(rest);
    if (command === "plan") {
        const state = readState(o.state);
        const result = await plan({
            all: Boolean(o.all),
            only:
                typeof o.only === "string"
                    ? o.only.trim().split(/\s+/).filter(Boolean)
                    : undefined,
            since: o.since ?? state.since,
            keep: o.keep,
            retry: state.retry,
            shards: o.shards ?? MAX_SHARDS,
        });
        console.log(JSON.stringify(result, null, 2));
        // In a workflow: the shards as job outputs, and why each shot is recorded in the log
        if (o["github-output"]) {
            for (const shot of result.shots)
                console.error(`${shot.id}: ${shot.why.join(", ")}`);
            fs.appendFileSync(
                process.env.GITHUB_OUTPUT,
                `shards=${JSON.stringify(result.shards)}\ncount=${result.shards.length}\n`,
            );
        }
    } else if (command === "pages") {
        const pages = guidePages();
        for (const id of o._) {
            const using = pagesFor(id, pages);
            console.log(
                `${id}: ${using.length ? using.map((p) => `${p.url} (${p.file})`).join(", ") : "no page"}`,
            );
        }
    } else if (command === "compare") {
        if (!o.work || !o.out)
            throw new Error("compare needs --work and --out");
        await compare({ work: path.resolve(o.work), out: path.resolve(o.out) });
    } else if (command === "confirm") {
        if (!o.work || !o.out)
            throw new Error("confirm needs --work and --out");
        await confirm({ work: path.resolve(o.work), out: path.resolve(o.out) });
    } else if (command === "changed") {
        // The shots compare found changed, space-separated (for recording them again)
        const shard = JSON.parse(
            fs.readFileSync(path.join(o.out, "shard.json"), "utf8"),
        );
        console.log(
            [
                ...new Set(
                    shard.results.filter((r) => r.changed).map((r) => r.id),
                ),
            ].join(" "),
        );
    } else if (command === "publish") {
        if (!o.artifacts || !o.base || !o.plan)
            throw new Error("publish needs --artifacts, --base and --plan");
        const { failed, missing, problems } = await publish({
            artifacts: path.resolve(o.artifacts),
            base: o.base,
            planFile: o.plan,
            runUrl: o["run-url"],
            repo: o.repo,
            dryRun: Boolean(o["dry-run"]),
            reportOnly: Boolean(o["report-only"]),
            stateFile: o.state,
        });
        process.exit(
            failed.length || missing.length || problems.length ? 1 : 0,
        );
    } else {
        console.error(
            "usage: refresh.mjs plan|pages|compare|changed|confirm|publish ... (see the top of this file)",
        );
        process.exit(2);
    }
}
