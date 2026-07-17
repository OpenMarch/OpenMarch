import { describe, expect, it } from "vitest";
import { getMarcherTimelines } from "../useCoordinateData";
import type { InterpolatedGeometry } from "@/utilities/Keyframes";
import type MarcherPage from "@/global/classes/MarcherPage";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";

const makeMarcherPage = (id: number, marcher_id: number): MarcherPage =>
    ({
        id,
        marcher_id,
        page_id: 1,
        x: 0,
        y: 0,
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    }) as unknown as MarcherPage;

describe("getMarcherTimelines geometry attachment", () => {
    it("attaches geometry to a prop marcher_page and not to others", () => {
        const marcherPages: MarcherPagesByMarcher = {
            1: makeMarcherPage(5, 1), // prop: marcher_page id 5
            2: makeMarcherPage(6, 2), // non-prop: no geometry row
        } as unknown as MarcherPagesByMarcher;

        const geometry: InterpolatedGeometry = {
            width: 10,
            height: 10,
            rotation: 0,
        };
        const geometryByMarcherPageId = new Map<number, InterpolatedGeometry>([
            [5, geometry],
        ]);

        const timelines = getMarcherTimelines(
            1000,
            marcherPages,
            {},
            geometryByMarcherPageId,
        );

        expect(timelines.get(1)?.pathMap.get(1000)?.geometry).toEqual(geometry);
        expect(timelines.get(2)?.pathMap.get(1000)?.geometry).toBeUndefined();
    });
});
