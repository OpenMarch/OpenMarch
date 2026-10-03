/**
 * Diagnostic: run the full parse on a `.3dz` and print the page list the way
 * OpenMarch will show it after import — source set name, counts, subset flag,
 * and the generated page name. Not part of the build or tests.
 *
 *   npx tsx scripts/diag-pages.mts <file.3dz>...
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseDrillPackage } from "../src/package.ts";

/** `DrillImport` sets `pageNumberOffset = 1` so names match the source. */
const PAGE_NUMBER_OFFSET = 1;

/**
 * Mirrors `generatePageNames` in `apps/desktop/src/global/classes/Page.ts`
 * (imported directly it drags in the desktop app's `@/` aliases): `1, 1A, 2,
 * 2A, 2B, 3, …`, where the first page is never a subset.
 */
function generatePageNames(isSubsetArr: boolean[], offset: number): string[] {
    const names = [offset.toString()];
    let number = offset;
    let letter = "";
    const next = (l: string) =>
        l === "" ? "A" : String.fromCharCode(l.charCodeAt(0) + 1);
    for (let i = 1; i < isSubsetArr.length; i++) {
        if (isSubsetArr[i]) {
            letter = next(letter);
            names.push(`${number}${letter}`);
        } else {
            number++;
            letter = "";
            names.push(String(number));
        }
    }
    return names;
}

for (const file of process.argv.slice(2)) {
    const show = await parseDrillPackage(readFileSync(file));
    const names = generatePageNames(
        show.sets.map((s) => s.isSubset),
        PAGE_NUMBER_OFFSET,
    );
    console.log(`\n=== ${basename(file)}  (${show.title ?? "untitled"})`);
    console.log(
        `  ${show.sets.length} pages, ${show.totalCounts} counts, ${show.performers.length} performers`,
    );
    for (const [i, set] of show.sets.entries()) {
        const note = (set.notes ?? "").replace(/\s+/g, " ").slice(0, 40);
        console.log(
            `    page ${String(names[i]).padEnd(5)} ` +
                `src=${JSON.stringify(set.name).padEnd(10)} ` +
                `start=${String(set.startCount).padStart(4)} ` +
                `counts=${String(set.counts).padStart(3)} ` +
                `${set.isSubset ? "SUBSET" : "      "} ${note}`,
        );
    }
}
