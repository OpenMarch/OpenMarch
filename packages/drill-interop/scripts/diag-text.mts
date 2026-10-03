/**
 * Diagnostic: extract on-field text boxes (`PRP8` type-2 objects) and show which
 * count they sit at, based on how many page frames precede them in the stream.
 * Not part of the build or tests.
 *
 *   npx tsx scripts/diag-text.mts <file.3dz>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";
import { BinaryReader } from "../src/binaryReader.ts";
import { readSetList } from "../src/document.ts";

const PAGE_RECORD_BYTES = 69;

/** One text object placed on the field. */
interface TextBox {
    /** Page frames seen before this chunk — i.e. the count it follows. */
    afterCount: number;
    id: string;
    text: string;
}

function walk(bytes: Uint8Array): {
    texts: TextBox[];
    setList?: Uint8Array;
    pages: number;
} {
    const r = new BinaryReader(bytes);
    const texts: TextBox[] = [];
    let setList: Uint8Array | undefined;
    let pages = 0;

    while (r.remaining >= 4) {
        const tag = r.ascii(4);
        if (tag === "END.") break;
        if (tag === "PG15") {
            r.i32();
            r.u16();
            const c = r.u16();
            r.skip(c * PAGE_RECORD_BYTES);
            r.skip(r.u16());
            pages++;
            continue;
        }
        if (r.remaining < 4) break;
        const length = r.i32();
        if (length < 0 || length > r.remaining) break;
        const payload = r.slice(length);
        if (tag === "PTB7") setList = payload;
        if (tag === "PRP8") texts.push(...readTextObjects(payload, pages));
    }
    return { texts, setList, pages };
}

/**
 * `PRP8`: `u16 count`, then objects tagged by a leading type byte. Type `2` is a
 * text box — `u64 id, 4×f32 bounds, 4 flag bytes, u16 textLen, text` — and type
 * `1` is a fixed-width prop/marker record we skip.
 */
function readTextObjects(payload: Uint8Array, afterCount: number): TextBox[] {
    const r = new BinaryReader(payload);
    const out: TextBox[] = [];
    if (r.remaining < 2) return out;
    const count = r.u16();

    for (let i = 0; i < count; i++) {
        if (r.remaining < 1) break;
        const type = r.slice(1)[0]!;
        if (type === 2) {
            if (r.remaining < 8 + 16 + 4 + 2) break;
            const id = r.u64String();
            r.skip(16); // bounding box: 4 × f32
            r.skip(4); // flags
            const textLength = r.u16();
            if (textLength > r.remaining) break;
            out.push({ afterCount, id, text: r.utf8(textLength) });
        } else if (type === 1) {
            if (r.remaining < 8 + 16 + 14) break;
            r.skip(8 + 16 + 14);
        } else {
            break; // unknown object type — stop rather than misread
        }
    }
    return out;
}

for (const file of process.argv.slice(2)) {
    const zip = unzipSync(readFileSync(file));
    const name = Object.keys(zip).find((n) => n.endsWith(".3dj"))!;
    const { texts, setList, pages } = walk(zip[name]!);
    const sets = setList ? readSetList(setList) : [];

    console.log(
        `\n=== ${basename(file)}  (${pages} counts, ${texts.length} text boxes)`,
    );
    for (const t of texts) {
        // The set whose page frame this text follows.
        const idx = sets.findIndex((s) => s.cumulativeCount >= t.afterCount);
        const set = idx >= 0 ? sets[idx] : undefined;
        console.log(
            `  afterCount=${String(t.afterCount).padStart(4)}  ` +
                `set≈${JSON.stringify(set?.name ?? "?").padEnd(10)} ` +
                `${JSON.stringify(t.text)}`,
        );
    }
}
