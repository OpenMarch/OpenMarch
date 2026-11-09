// The user guide's shots (shots/<chapter>.mjs), shared by the recorder (capture.mjs) and the
// scheduled refresh (refresh.mjs). Imports nothing but Node, so the refresh can plan without
// installing the app's dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DESKTOP = path.resolve(HERE, "../..");

/** Shows a shot can open (`shot.show`); anything else is a path from apps/desktop. */
export const SHOWS = {
    demo: path.join(DESKTOP, "web/public/demos/part1-demo.dots"),
};

/** The .dots file a shot opens, as an absolute path. */
export const showPath = (shot) =>
    SHOWS[shot.show ?? "demo"] ?? path.resolve(DESKTOP, shot.show);

/** Every shot, in chapter order, each with its `chapter` (the shots/ file it's in). */
export async function loadShots() {
    const dir = path.join(HERE, "shots");
    const all = [];
    for (const file of fs.readdirSync(dir).sort()) {
        if (!file.endsWith(".mjs")) continue;
        const chapter = file.replace(/\.mjs$/, "");
        const { default: shots } = await import(path.join(dir, file));
        for (const shot of shots) {
            if (all.some((s) => s.id === shot.id))
                throw new Error(`two shots are called "${shot.id}"`);
            all.push({ chapter, ...shot });
        }
    }
    return all;
}
