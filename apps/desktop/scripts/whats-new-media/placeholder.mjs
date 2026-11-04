// cspell:words drawtext fontfile fontcolor fontsize libwebp dejavu lavfi
/* eslint-disable no-console -- a command-line script: it prints what it wrote */
// A plain poster for a What's new slide whose feature isn't on main yet, so the slide can be
// reviewed before its clip is recorded. Users never see it: the slide stays hidden until the
// feature lands, and record.mjs then writes the real clip and poster over it.
//
//   node scripts/whats-new-media/placeholder.mjs <clip name> "<title>" "<note>"
//
// Needs ffmpeg with libwebp and drawtext. FONT overrides the font file.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../../src/assets/welcome/whats-new");
const FONT =
    process.env.FONT ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

const [name, title, note] = process.argv.slice(2);
if (!name || !title || !note) {
    console.error('usage: placeholder.mjs <clip name> "<title>" "<note>"');
    process.exit(2);
}
const escape = (text) =>
    text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
const text = (value, size, color, y) =>
    `drawtext=fontfile=${FONT}:text='${escape(value)}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;
const out = path.join(OUT_DIR, `${name}.webp`);
execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0xE8E6EF:s=960x600",
    "-vf",
    [
        text(title, 44, "0x3B3355", "(h/2)-50"),
        text(note, 22, "0x6B6485", "(h/2)+20"),
    ].join(","),
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "80",
    out,
]);
console.log(path.relative(process.cwd(), out));
