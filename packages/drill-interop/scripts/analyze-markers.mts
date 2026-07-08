import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDrillDocument } from "../src/document.ts";

const fixture = fileURLToPath(
    new URL("../src/__test__/fixtures/sample.3dz", import.meta.url),
);
const { unzipSync } = await import("fflate");
const zip = unzipSync(readFileSync(fixture));
const docName = Object.keys(zip).find((n) => n.endsWith(".3dj"))!;
const doc = await parseDrillDocument(zip[docName]!);
const castIds = new Set(doc.performers.map((p) => p.id));
const propIds = new Set(doc.props.map((p) => p.id));

// Re-parse to get pages - document doesn't export pages. Use sets at boundaries only.
// Hack: import internal by duplicating discoverProps scan on first/last set frames
import { parseDrillPackage } from "../src/package.ts";
const show = await parseDrillPackage(readFileSync(fixture));

console.log("cast", show.performers.length, "props", show.props.length);
console.log(
    "FE labels",
    show.performers.filter((p) => p.label.startsWith("F")).map((p) => p.label),
);

// Count non-cast symbols from first set - we need full page decode
// Use package + manual decode of frame 0
import { BinaryReader } from "../src/binaryReader.ts";
import { decodeCoordinateBlock } from "../src/crypto.ts";

const data = zip[docName]!;
const reader = new BinaryReader(data);
if (reader.ascii(4) !== "3DJV") throw new Error("bad magic");
reader.seek(0);

while (reader.remaining >= 4) {
    const tag = reader.ascii(4);
    if (tag === "END.") break;
    if (tag === "PG15") {
        reader.i32();
        reader.u16();
        const count = reader.u16();
        reader.skip(count * 69);
        const blen = reader.u16();
        const block = reader.ascii(blen);
        const plain = await decodeCoordinateBlock(block);
        const bySym: Record<string, number> = {};
        const nonCast: { id: string; sym: string; x: number; y: number }[] = [];
        for (let i = 0; i < count; i++) {
            const rec = plain.slice(i * 39, (i + 1) * 39);
            const sym = rec[0]!;
            const id = String(parseInt(rec.slice(1, 19), 10));
            bySym[sym] = (bySym[sym] ?? 0) + 1;
            if (!castIds.has(id)) {
                nonCast.push({
                    id,
                    sym,
                    x: parseFloat(rec.slice(19, 29)),
                    y: parseFloat(rec.slice(29, 39)),
                });
            }
        }
        console.log("frame0 symbols", bySym);
        console.log("non-cast count", nonCast.length);
        for (const m of nonCast) {
            const imported = propIds.has(m.id) ? "prop" : "DROPPED";
            console.log(imported, m.sym, m.x.toFixed(1), m.y.toFixed(1), m.id.slice(-6));
        }
        break;
    }
    if (tag === "SEL2" || tag === "VIS2") {
        const len = reader.i32();
        reader.skip(len);
        continue;
    }
    const len = reader.i32();
    if (len < 0 || len > reader.remaining) break;
    reader.skip(len);
}
