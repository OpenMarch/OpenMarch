/* eslint-disable no-console -- a command-line check: it reports what it found */
// Checks that the user guide's pictures and clips (public/docs/media) stay small, so a PR
// can't commit a huge recording. Limits follow docs/conventions/user-docs.md, Pictures and
// clips: about 150 KB for a WebP still and 1.5 MB for an MP4 clip. A file of any other
// type fails too: the recorder only writes WebP and MP4.
//
//   node apps/website/scripts/check-media-size.mjs
//
// Exits 1 when a file is over its limit, listing each one and by how much. A clip that's
// over is usually too long or too large a crop: shorten it or crop tighter and record again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const MEDIA = path.join(WEBSITE, "public/docs/media");

const KB = 1024;
const MB = 1024 * KB;
const LIMITS = { ".webp": 150 * KB, ".mp4": 1.5 * MB };

const size = (bytes) =>
    bytes >= MB
        ? `${(bytes / MB).toFixed(2)} MB`
        : `${(bytes / KB).toFixed(1)} KB`;

const problems = [];
let count = 0;
for (const entry of fs.readdirSync(MEDIA, {
    recursive: true,
    withFileTypes: true,
})) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const rel = path.relative(WEBSITE, file);
    const limit = LIMITS[path.extname(entry.name).toLowerCase()];
    count++;
    if (limit === undefined) {
        problems.push(`${rel}: not a .webp still or .mp4 clip`);
        continue;
    }
    const bytes = fs.statSync(file).size;
    if (bytes > limit) {
        problems.push(
            `${rel}: ${size(bytes)}, ${size(bytes - limit)} over the ${size(limit)} limit`,
        );
    }
}

if (problems.length > 0) {
    console.error(
        `${problems.length} of ${count} guide media files are too big or the wrong type:`,
    );
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}
console.log(
    `${count} guide media files are within their limits (WebP ${size(LIMITS[".webp"])}, MP4 ${size(LIMITS[".mp4"])}).`,
);
