import { describe, expect, it } from "vitest";
import { parseStretch, readOpenMarchMetadata } from "../openmarch-metadata";

const ID = "6B1F3C1E-5A43-4D0E-9A51-2F7C8E9D0A11";

describe("readOpenMarchMetadata", () => {
    it("reads OM_* nodes from raw names and skips names that break the rule", () => {
        const meta = readOpenMarchMetadata({
            nodes: [
                { name: "OM_grip_R" },
                { name: "OM_grip_L.001" },
                { name: "OM_silk_top" },
                { name: "Pole" },
                { name: "om.hold R" },
            ],
        });
        expect(meta.omNodes).toEqual([
            { index: 0, name: "OM_grip_R" },
            { index: 2, name: "OM_silk_top" },
        ]);
        expect(meta.misnamed).toEqual(["OM_grip_L.001", "om.hold R"]);
        expect(meta.hasOpenMarchData).toBe(true);
    });

    it("reads the kit stamp and stretch from the scene, then root nodes, then asset", () => {
        const meta = readOpenMarchMetadata({
            asset: { extras: { openmarch: { kitVersion: 2 } } },
            scene: 0,
            scenes: [
                {
                    nodes: [0],
                    extras: { openmarch: { itemId: ID, kind: "prop" } },
                },
            ],
            nodes: [{ extras: { openmarch: { stretch: { x: [0.2, 1.8] } } } }],
        });
        expect(meta.stamp).toEqual({
            itemId: ID.toLowerCase(),
            kind: "prop",
            kitVersion: 2,
        });
        expect(meta.stretch).toEqual({ x: [0.2, 1.8], y: null, z: null });
        expect(meta.notes).toEqual([]);
    });

    it("notes conflicting and malformed model-level data", () => {
        const meta = readOpenMarchMetadata({
            scenes: [
                {
                    nodes: [0],
                    extras: {
                        openmarch: { kind: "prop", itemId: "not-a-uuid" },
                    },
                },
            ],
            nodes: [
                {
                    extras: {
                        openmarch: {
                            kind: "equipment",
                            stretch: { x: [2, 1] },
                        },
                    },
                },
            ],
        });
        expect(meta.stamp.kind).toBe("prop");
        expect(meta.stamp.itemId).toBeNull();
        expect(meta.stretch).toBeNull();
        expect(meta.notes.map((n) => n.code)).toEqual([
            "invalidOpenMarchData",
            "invalidOpenMarchData",
            "invalidOpenMarchData",
        ]);
    });

    it("reads artwork slots on materials and meshes, dropping bad ones", () => {
        const slot = (id: string, w = 1, h = 2) => ({
            extras: {
                openmarch: { artworkSlot: { id, widthM: w, heightM: h } },
            },
        });
        const meta = readOpenMarchMetadata({
            materials: [slot("top"), slot("bad", 0), slot("top")],
            meshes: [slot("front", 2.4, 0.6)],
        });
        expect(meta.slots).toEqual([
            { target: { material: 0 }, id: "top", widthM: 1, heightM: 2 },
            { target: { mesh: 0 }, id: "front", widthM: 2.4, heightM: 0.6 },
        ]);
        expect(meta.notes).toHaveLength(2);
    });

    it("reads fits from mesh nodes or their meshes", () => {
        const meta = readOpenMarchMetadata({
            meshes: [{}, { extras: { openmarch: { fit: "neutral-broad" } } }],
            nodes: [
                { mesh: 0, extras: { openmarch: { fit: "neutral-slim" } } },
                { mesh: 1 },
                { mesh: 0 },
            ],
        });
        expect([...meta.fitsByNode]).toEqual([
            [0, "neutral-slim"],
            [1, "neutral-broad"],
        ]);
    });

    it("keeps a non-string fit as text and notes a node overriding its mesh", () => {
        const meta = readOpenMarchMetadata({
            meshes: [{ extras: { openmarch: { fit: "neutral-slim" } } }],
            nodes: [
                { mesh: 0, extras: { openmarch: { fit: 3 } } },
                { mesh: 0, extras: { openmarch: { fit: "neutral-broad" } } },
            ],
        });
        expect([...meta.fitsByNode]).toEqual([
            [0, "3"],
            [1, "neutral-broad"],
        ]);
        expect(meta.notes.map((n) => n.code)).toEqual([
            "invalidOpenMarchData",
            "invalidOpenMarchData",
        ]);
    });

    it("tells openmarch extras from custom properties the app ignores", () => {
        expect(
            readOpenMarchMetadata({ nodes: [{ name: "Box" }] }),
        ).toMatchObject({
            hasOpenMarchData: false,
            hasForeignExtras: false,
        });
        expect(
            readOpenMarchMetadata({
                materials: [{ extras: { blenderId: 3 } }],
            }),
        ).toMatchObject({ hasOpenMarchData: false, hasForeignExtras: true });
    });
});

describe("parseStretch", () => {
    it("accepts zones per axis and null axes", () => {
        expect(parseStretch({ y: [0, 1], z: null })).toEqual({
            x: null,
            y: [0, 1],
            z: null,
        });
    });

    it.each([[{ x: [1, 0] }], [{ x: [0] }], [{ x: ["0", 1] }], ["x"]])(
        "rejects %j",
        (value) => expect(parseStretch(value)).toBeNull(),
    );
});
