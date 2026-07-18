import { describe, expect, it } from "vitest";
import { resolvePropsForPage } from "../propSelectors";
import type MarcherPage from "../MarcherPage";
import type { PropWithMarcher, DatabasePropPageGeometry } from "../Prop";

const makeProp = (id: number, marcher_id: number): PropWithMarcher =>
    ({
        id,
        marcher_id,
        marcher: { id: marcher_id, name: `p${id}` },
    }) as unknown as PropWithMarcher;

const makeMarcherPage = (marcher_id: number, id: number): MarcherPage =>
    ({ id, marcher_id, x: marcher_id * 10, y: marcher_id * 20 }) as MarcherPage;

const makeGeometry = (marcher_page_id: number): DatabasePropPageGeometry =>
    ({
        id: marcher_page_id * 100,
        marcher_page_id,
        shape_type: "rectangle",
        width: 15,
        height: 15,
        rotation: 0,
        visible: true,
        custom_geometry: null,
    }) as unknown as DatabasePropPageGeometry;

describe("resolvePropsForPage", () => {
    it("joins prop → marcher_page → geometry", () => {
        const props = [makeProp(1, 10), makeProp(2, 20)];
        const marcherPages = [
            makeMarcherPage(10, 100),
            makeMarcherPage(20, 200),
        ];
        const geometries = [makeGeometry(100), makeGeometry(200)];

        const result = resolvePropsForPage({ props, geometries, marcherPages });

        expect(result).toHaveLength(2);
        expect(result[0].prop.id).toBe(1);
        expect(result[0].marcherPage.id).toBe(100);
        expect(result[0].geometry.marcher_page_id).toBe(100);
        expect(result[1].prop.id).toBe(2);
        expect(result[1].geometry.marcher_page_id).toBe(200);
    });

    it("accepts marcherPages as a record keyed by marcher_id", () => {
        const props = [makeProp(1, 10)];
        const marcherPages: Record<number, MarcherPage> = {
            10: makeMarcherPage(10, 100),
        };
        const geometries = [makeGeometry(100)];

        const result = resolvePropsForPage({ props, geometries, marcherPages });

        expect(result).toHaveLength(1);
        expect(result[0].marcherPage.id).toBe(100);
    });

    it("skips props missing a marcher_page", () => {
        const props = [makeProp(1, 10), makeProp(2, 20)];
        const marcherPages = [makeMarcherPage(10, 100)];
        const geometries = [makeGeometry(100), makeGeometry(200)];

        const result = resolvePropsForPage({ props, geometries, marcherPages });

        expect(result).toHaveLength(1);
        expect(result[0].prop.id).toBe(1);
    });

    it("skips props missing a geometry", () => {
        const props = [makeProp(1, 10), makeProp(2, 20)];
        const marcherPages = [
            makeMarcherPage(10, 100),
            makeMarcherPage(20, 200),
        ];
        const geometries = [makeGeometry(100)];

        const result = resolvePropsForPage({ props, geometries, marcherPages });

        expect(result).toHaveLength(1);
        expect(result[0].prop.id).toBe(1);
    });
});
