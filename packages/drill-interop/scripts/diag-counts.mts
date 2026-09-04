/**
 * Diagnostic: check set durations against the counts the author stated in their
 * own notes ("Move 16", "Hold 12", …), comparing the current mapping with the
 * proposed one. Not part of the build or tests.
 *
 *   npx tsx scripts/diag-counts.mts <file.3dz>...
 *
 * current  : counts_i = c(i-1) - c(i-2)   (set start = previous record's count)
 * proposed : counts_i = c(i)   - c(i-1)   (set start = its own count)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";
import { BinaryReader } from "../src/binaryReader.ts";
import { readSetList } from "../src/document.ts";

const PAGE_RECORD_BYTES = 69;

function setListChunk(bytes: Uint8Array): Uint8Array | undefined {
    const r = new BinaryReader(bytes);
    while (r.remaining >= 4) {
        const tag = r.ascii(4);
        if (tag === "END.") break;
        if (tag === "PG15") {
            r.i32();
            r.u16();
            const c = r.u16();
            r.skip(c * PAGE_RECORD_BYTES);
            r.skip(r.u16());
            continue;
        }
        if (r.remaining < 4) break;
        const length = r.i32();
        if (length < 0 || length > r.remaining) break;
        const payload = r.slice(length);
        if (tag === "PTB7") return payload;
    }
    return undefined;
}

/** The count an author wrote into a note, e.g. "Move 16" / "Hold 8". */
function statedCounts(notes: string | undefined): number | undefined {
    const m = notes?.match(/\b(?:move|hold)\s+(\d{1,3})\b/i);
    return m ? Number(m[1]) : undefined;
}

let totalCurrent = 0;
let totalProposed = 0;
let totalChecked = 0;

for (const file of process.argv.slice(2)) {
    let sets;
    try {
        const zip = unzipSync(readFileSync(file));
        const name = Object.keys(zip).find((n) => n.endsWith(".3dj"));
        const payload = name && setListChunk(zip[name]!);
        if (!payload) continue;
        sets = readSetList(payload);
    } catch {
        continue;
    }
    if (sets.length < 3) continue;

    const cum = sets.map((s) => s.cumulativeCount);
    let current = 0;
    let proposed = 0;
    let checked = 0;

    for (let i = 0; i < sets.length; i++) {
        const stated = statedCounts(sets[i]!.notes);
        if (stated === undefined) continue;
        // current: page i spans [c(i-2), c(i-1)]
        const currentCounts =
            i === 0 ? 0 : (cum[i - 1] ?? 0) - (i >= 2 ? cum[i - 2]! : 0);
        // proposed: page i spans [c(i-1), c(i)]
        const proposedCounts = cum[i]! - (i >= 1 ? cum[i - 1]! : 0);
        checked++;
        if (currentCounts === stated) current++;
        if (proposedCounts === stated) proposed++;
    }

    if (checked === 0) continue;
    totalChecked += checked;
    totalCurrent += current;
    totalProposed += proposed;
    console.log(
        `${basename(file).slice(0, 40).padEnd(40)} notes=${String(checked).padStart(3)}  ` +
            `current ${String(current).padStart(3)}/${checked}   proposed ${String(proposed).padStart(3)}/${checked}`,
    );
}

console.log(
    `\nTOTAL  ${totalChecked} author-stated counts:  ` +
        `current ${totalCurrent} (${((100 * totalCurrent) / totalChecked).toFixed(1)}%)   ` +
        `proposed ${totalProposed} (${((100 * totalProposed) / totalChecked).toFixed(1)}%)`,
);
