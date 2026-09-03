import { describe, expect, it } from "vitest";
import { buildPropStructureKey } from "../props";
import type MarcherPage from "@/global/classes/MarcherPage";
import type {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";

const prop = {
    id: 1,
    marcher_id: 100,
    image_opacity: 1,
} as unknown as PropWithMarcher;

const marcherPages = {
    100: { id: 500, marcher_id: 100, x: 0, y: 0 } as MarcherPage,
};

const geometry = (
    overrides: Partial<DatabasePropPageGeometry> = {},
): DatabasePropPageGeometry =>
    ({
        id: 900,
        marcher_page_id: 500,
        outline_type: "polygon",
        width: 10,
        height: 10,
        rotation: 0,
        custom_outline: null,
        ...overrides,
    }) as unknown as DatabasePropPageGeometry;

const key = (geometries: DatabasePropPageGeometry[]) =>
    buildPropStructureKey({
        props: [prop],
        propGeometries: geometries,
        marcherPages,
        imageCacheVersion: 0,
        pageId: 1,
        showPropNames: false,
        propNameOverrides: {},
        hiddenPropIds: {},
        propRecreateKey: 0,
    });

describe("buildPropStructureKey", () => {
    it("is stable when nothing changes", () => {
        expect(key([geometry()])).toBe(key([geometry()]));
    });

    it("changes when a custom outline's points change", () => {
        // A polygon's shape lives entirely in custom_outline. If the fingerprint
        // ignores it, editing the outline leaves a stale CanvasProp on screen.
        const before = key([
            geometry({ custom_outline: '{"points":[{"x":0,"y":0}]}' }),
        ]);
        const after = key([
            geometry({ custom_outline: '{"points":[{"x":9,"y":9}]}' }),
        ]);

        expect(after).not.toBe(before);
    });

    it("changes when the outline type changes", () => {
        expect(key([geometry({ outline_type: "circle" })])).not.toBe(
            key([geometry({ outline_type: "rectangle" })]),
        );
    });

    it("changes when size or rotation changes", () => {
        expect(key([geometry({ width: 20 })])).not.toBe(key([geometry()]));
        expect(key([geometry({ rotation: 45 })])).not.toBe(key([geometry()]));
    });

    it("ignores geometry belonging to other pages", () => {
        const otherPage = geometry({ id: 901, marcher_page_id: 999 });
        expect(key([geometry(), otherPage])).toBe(key([geometry()]));
    });
});
