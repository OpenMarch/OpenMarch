/**
 * Diagnostic: dump any chunk by tag as hex + ASCII, or list every chunk with its
 * size and the printable strings it contains. Not part of the build or tests.
 *
 *   npx tsx scripts/diag-chunk.mts <file.3dz>                 # inventory
 *   npx tsx scripts/diag-chunk.mts <file.3dz> TxD1            # hex dump
 *   npx tsx scripts/diag-chunk.mts <file.3dz> --strings TxD1  # strings only
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";
import { BinaryReader } from "../src/binaryReader.ts";

const PAGE_RECORD_BYTES = 69;

function chunks(bytes: Uint8Array): { tag: string; payload: Uint8Array }[] {
    const r = new BinaryReader(bytes);
    const out: { tag: string; payload: Uint8Array }[] = [];
    while (r.remaining >= 4) {
        const tag = r.ascii(4);
        if (tag === "END.") break;
        if (tag === "PG15") {
            r.i32();
            r.u16();
            const c = r.u16();
            r.skip(c * PAGE_RECORD_BYTES);
            r.skip(r.u16());
            out.push({ tag, payload: new Uint8Array() });
            continue;
        }
        if (r.remaining < 4) break;
        const length = r.i32();
        if (length < 0 || length > r.remaining) break;
        out.push({ tag, payload: r.slice(length) });
    }
    return out;
}

/** Runs of printable ASCII, and of UTF-16BE (which the exporter uses for paths). */
function strings(b: Uint8Array, min = 4): string[] {
    const out: string[] = [];
    let run = "";
    for (const byte of b) {
        if (byte >= 0x20 && byte < 0x7f) run += String.fromCharCode(byte);
        else {
            if (run.length >= min) out.push(run);
            run = "";
        }
    }
    if (run.length >= min) out.push(run);

    let wide = "";
    for (let i = 0; i + 1 < b.length; i += 2) {
        const code = (b[i]! << 8) | b[i + 1]!;
        if (code >= 0x20 && code < 0x7f) wide += String.fromCharCode(code);
        else {
            if (wide.length >= min) out.push(`(u16) ${wide}`);
            wide = "";
        }
    }
    if (wide.length >= min) out.push(`(u16) ${wide}`);
    return out;
}

function hex(b: Uint8Array, limit: number): string {
    const lines: string[] = [];
    for (let i = 0; i < Math.min(b.length, limit); i += 16) {
        const row = b.subarray(i, Math.min(i + 16, b.length));
        lines.push(
            `${String(i).padStart(6)}  ` +
                [...row]
                    .map((x) => x.toString(16).padStart(2, "0"))
                    .join(" ")
                    .padEnd(47) +
                "  " +
                [...row]
                    .map((x) =>
                        x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : ".",
                    )
                    .join(""),
        );
    }
    return lines.join("\n");
}

const args = process.argv.slice(2);
const stringsOnly = args.includes("--strings");
const [file, ...rest] = args.filter((a) => !a.startsWith("--"));
const wanted = rest[0];

const zip = unzipSync(readFileSync(file!));
const name = Object.keys(zip).find((n) => n.endsWith(".3dj"))!;
const all = chunks(zip[name]!);

console.log(`=== ${basename(file!)}`);
if (!wanted) {
    const sizes = new Map<string, { n: number; bytes: number }>();
    for (const c of all) {
        const e = sizes.get(c.tag) ?? { n: 0, bytes: 0 };
        e.n++;
        e.bytes += c.payload.length;
        sizes.set(c.tag, e);
    }
    for (const [tag, e] of sizes) {
        console.log(`  ${tag}  x${String(e.n).padStart(4)}  ${e.bytes} bytes`);
    }
} else {
    for (const c of all.filter((x) => x.tag === wanted)) {
        console.log(`--- ${c.tag} (${c.payload.length} bytes)`);
        if (stringsOnly) {
            for (const s of strings(c.payload)) console.log(`  ${s}`);
        } else {
            console.log(hex(c.payload, 2048));
        }
    }
}
