/**
 * Diagnostic: walk every `.3dz` given on argv, extract the set-list chunk, and
 * report what the current parser recovers. Not part of the build or tests.
 *
 *   npx tsx scripts/diag-setlist.mts <file.3dz>...
 *   npx tsx scripts/diag-setlist.mts --dump <file.3dz>   # hex around failure
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";
import { BinaryReader } from "../src/binaryReader.ts";
import { readSetList } from "../src/document.ts";

const PAGE_RECORD_BYTES = 69;

interface Chunk {
    tag: string;
    payload: Uint8Array;
}

/** Walk the top-level chunk stream the same way `parseDrillDocument` does. */
function chunks(bytes: Uint8Array): Chunk[] {
    const reader = new BinaryReader(bytes);
    const out: Chunk[] = [];
    while (reader.remaining >= 4) {
        const tag = reader.ascii(4);
        if (tag === "END.") break;
        if (tag === "PG15") {
            reader.i32();
            reader.u16();
            const count = reader.u16();
            reader.skip(count * PAGE_RECORD_BYTES);
            reader.skip(reader.u16());
            out.push({ tag, payload: new Uint8Array() });
            continue;
        }
        if (reader.remaining < 4) break;
        const length = reader.i32();
        if (length < 0 || length > reader.remaining) break;
        out.push({ tag, payload: reader.slice(length) });
    }
    return out;
}

function doc(path: string): Uint8Array {
    const zip = unzipSync(readFileSync(path));
    const name = Object.keys(zip).find((n) => n.endsWith(".3dj"));
    if (!name) throw new Error(`no .3dj inside ${path}`);
    return zip[name]!;
}

function hex(bytes: Uint8Array, from: number, length: number): string {
    const lines: string[] = [];
    for (let i = from; i < Math.min(from + length, bytes.length); i += 16) {
        const row = bytes.subarray(i, Math.min(i + 16, bytes.length));
        const h = [...row]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
        const a = [...row]
            .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
            .join("");
        lines.push(`${String(i).padStart(6)}  ${h.padEnd(47)}  ${a}`);
    }
    return lines.join("\n");
}

const dump = process.argv.includes("--dump");
const raw = process.argv.includes("--raw");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));

for (const file of files) {
    let all: Chunk[];
    try {
        all = chunks(doc(file));
    } catch (error) {
        console.log(`\n=== ${basename(file)}\n  ERROR ${String(error)}`);
        continue;
    }
    const tags = [...new Set(all.map((c) => c.tag))].join(" ");
    const table = all.find((c) => c.tag === "PTB7" || c.tag === "PTB6");
    console.log(`\n=== ${basename(file)}`);
    console.log(`  chunks: ${tags}`);
    if (!table) {
        console.log("  no set-list chunk");
        continue;
    }
    const reader = new BinaryReader(table.payload);
    const version = reader.u16();
    const declared = reader.u16();
    console.log(
        `  ${table.tag} version=${version} count=${declared} bytes=${table.payload.length}`,
    );
    if (raw) console.log(hex(table.payload, 0, table.payload.length));
    if (table.tag !== "PTB7") {
        if (dump) console.log(hex(table.payload, 0, 256));
        continue;
    }
    const sets = readSetList(table.payload);
    const status = sets.length >= declared - 1 ? "ok " : "SHORT";
    console.log(`  ${status} parsed ${sets.length} sets of ${declared}`);
    for (const [i, s] of sets.entries()) {
        const note = (s.notes ?? "").replace(/\s+/g, " ").slice(0, 48);
        console.log(
            `    ${String(i).padStart(3)} cum=${String(s.cumulativeCount).padStart(4)} ` +
                `${s.subsetFollows ? "S" : " "} ${JSON.stringify(s.name).padEnd(12)} ${note}`,
        );
    }
    if (dump && sets.length < declared) console.log(hex(table.payload, 0, 512));
}
