import fs from "node:fs";
import path from "node:path";

/**
 * License files for third-party material that the bundle carries in a form the
 * minifier strips comments from. Each is copied into the build as a stand-alone
 * text file, which is how their licenses ask to travel with copies.
 */
const NOTICES = [
    {
        // The yard number digits are outlines from the Inter typeface.
        from: "src/field/fieldNumeralGlyphs.LICENSE.txt",
        to: "licenses/Inter-OFL-1.1.txt",
    },
];

/** @returns {import("vite").Plugin} */
export const thirdPartyNotices = () => ({
    name: "openmarch-third-party-notices",
    apply: "build",
    generateBundle() {
        for (const notice of NOTICES)
            this.emitFile({
                type: "asset",
                fileName: notice.to,
                source: fs.readFileSync(
                    path.join(import.meta.dirname, notice.from),
                ),
            });
    },
});
