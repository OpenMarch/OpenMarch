import { describe, expect, it } from "vitest";
import { readCast } from "../document";

interface CastRecord {
    id: bigint;
    label: string;
    /** Instrument/section name, e.g. "Piccolo". Older exports omit this. */
    name?: string;
}

/**
 * Builds a synthetic `CST7` payload: `u16 count`, then per record `u64 id,
 * u32 labelLen, label, u16 nameLen, name, 6 reserved bytes` (§2.3). Mirrors
 * the real record shape byte-for-byte so a regression to the old flat
 * `skip(8)` reading loses alignment the same way it would against a real file.
 */
function buildCastPayload(records: CastRecord[]): Uint8Array {
    const bytes: number[] = [];
    const pushU16 = (n: number) => bytes.push((n >> 8) & 0xff, n & 0xff);
    const pushU32 = (n: number) =>
        bytes.push(
            (n >>> 24) & 0xff,
            (n >>> 16) & 0xff,
            (n >>> 8) & 0xff,
            n & 0xff,
        );
    const pushU64 = (n: bigint) => {
        pushU32(Number((n >> 32n) & 0xffffffffn));
        pushU32(Number(n & 0xffffffffn));
    };
    const pushAscii = (s: string) => {
        for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    };

    pushU16(records.length);
    for (const { id, label, name = "" } of records) {
        pushU64(id);
        pushU32(label.length);
        pushAscii(label);
        pushU16(name.length);
        pushAscii(name);
        bytes.push(0, 0, 0, 0, 0, 0); // 6 reserved bytes
    }
    return Uint8Array.from(bytes);
}

describe("readCast", () => {
    it("reads records with and without an instrument/section name, staying aligned across both", () => {
        // Mirrors a real Pyware 3D v11 export: a mix of old-style records
        // (nameLen === 0) and new-style records that carry an instrument
        // name — the case that misaligns a reader that blindly skips 8 bytes.
        const records: CastRecord[] = [
            { id: 1n, label: "T3" }, // old-style: no name field
            { id: 2n, label: "P38", name: "Piccolo" }, // new-style: has a name
            { id: 3n, label: "P37", name: "Piccolo" }, // proves alignment held
        ];
        const payload = buildCastPayload(records);

        const performers = readCast(payload);

        expect(performers).toHaveLength(records.length);
        expect(performers[0]).toMatchObject({
            id: "1",
            label: "T3",
            drill_prefix: "T",
            drill_order: 3,
        });
        expect(performers[1]).toMatchObject({
            id: "2",
            label: "P38",
            drill_prefix: "P",
            drill_order: 38,
        });
        expect(performers[2]).toMatchObject({
            id: "3",
            label: "P37",
            drill_prefix: "P",
            drill_order: 37,
        });
    });

    it("reads an all-old-style payload (nameLen always 0) unaffected", () => {
        const records: CastRecord[] = [
            { id: 10n, label: "G10" },
            { id: 11n, label: "G11" },
        ];
        const payload = buildCastPayload(records);

        const performers = readCast(payload);

        expect(performers).toHaveLength(2);
        expect(performers[0]).toMatchObject({ id: "10", label: "G10" });
        expect(performers[1]).toMatchObject({ id: "11", label: "G11" });
    });

    it("disambiguates bare-numeric labels that collide, leaving a lone one plain", () => {
        // Mirrors the real Carolina CST7 cast: every label is a bare digit
        // string with no section prefix, and distinct performers can share
        // the same numeral (e.g. several sections each restarting at 1).
        const records: CastRecord[] = [
            { id: 1n, label: "1" },
            { id: 2n, label: "1" },
            { id: 3n, label: "1" },
            { id: 4n, label: "1" },
            { id: 5n, label: "T3" },
            { id: 6n, label: "7" }, // lone bare numeral: no collision
        ];
        const payload = buildCastPayload(records);

        const performers = readCast(payload);

        expect(performers).toHaveLength(records.length);
        expect(performers[0]).toMatchObject({
            drill_prefix: "1-",
            drill_order: 1,
        });
        expect(performers[1]).toMatchObject({
            drill_prefix: "2-",
            drill_order: 1,
        });
        expect(performers[2]).toMatchObject({
            drill_prefix: "3-",
            drill_order: 1,
        });
        expect(performers[3]).toMatchObject({
            drill_prefix: "4-",
            drill_order: 1,
        });
        expect(performers[4]).toMatchObject({
            drill_prefix: "T",
            drill_order: 3,
        });
        expect(performers[5]).toMatchObject({
            drill_prefix: "-",
            drill_order: 7,
        });
    });
});
