import { describe, expect, it } from "vitest";
import {
    buildIlluminantVisualizerSource,
    serializeSampledMarcherCoordinates,
} from "../illuminantExport";

describe("illuminantExport", () => {
    it("builds the visualizer source shape expected by the local server", () => {
        const source = buildIlluminantVisualizerSource({
            fps: 2,
            beats: [
                { id: 1, duration: 1, position: 1 },
                { id: 2, duration: 1, position: 2 },
            ],
            pages: [
                { id: 100, start_beat: 1 },
                { id: 200, start_beat: 2 },
            ],
            marchers: [{ id: 3, drill_prefix: "B", drill_order: 1 }],
            marcherPages: [
                { marcher_id: 3, page_id: 100, x: 10, y: 20 },
                { marcher_id: 3, page_id: 200, x: 30, y: 40 },
            ],
            pathways: [],
            lightingData: {
                scenes: [{ id: 1, start_page_id: 100, name: null }],
                groups: [{ id: 10, scene_id: 1, name: null }],
                group_marchers: [
                    { id: 1000, group_id: 10, marcher_id: 3, scene_id: 1 },
                ],
                effects: [
                    {
                        id: 100,
                        scene_id: 1,
                        type: "solid",
                        args: JSON.stringify({ color: "#ffffff" }),
                        name: null,
                        start_offset_beats: 0,
                        duration_beats: 1,
                    },
                ],
                effect_groups: [
                    {
                        id: 500,
                        lighting_effect_id: 100,
                        lighting_group_id: 10,
                    },
                ],
                effect_layers: [],
            },
        });

        expect(source).toMatchObject({
            showData: {
                beats: [
                    { id: 1, duration: 1, position: 1 },
                    { id: 2, duration: 1, position: 2 },
                ],
                pages: [
                    { id: 100, start_beat: 1 },
                    { id: 200, start_beat: 2 },
                ],
            },
            lightingData: {
                scenes: [{ id: 1, start_page_id: 100, name: null }],
                groups: [{ id: 10, scene_id: 1, name: null }],
                group_marchers: [
                    { id: 1000, group_id: 10, marcher_id: 3, scene_id: 1 },
                ],
                effects: [
                    {
                        id: 100,
                        scene_id: 1,
                        type: "solid",
                        args: JSON.stringify({ color: "#ffffff" }),
                        name: null,
                        start_offset_beats: 0,
                        duration_beats: 1,
                    },
                ],
                effect_groups: [
                    {
                        id: 500,
                        lighting_effect_id: 100,
                        lighting_group_id: 10,
                    },
                ],
                effect_layers: [],
            },
        });
        expect(
            Array.isArray(
                source.showData.sampledCoordinates.coordinatesByMarcher["3"],
            ),
        ).toBe(true);
        expect(
            source.showData.sampledCoordinates.coordinatesByMarcher["3"],
        ).toEqual([10, 20, 15, 25, 20, 30, 25, 35, 30, 40]);
    });

    it("samples page 0 coordinates before page 1 coordinates", () => {
        const source = buildIlluminantVisualizerSource({
            fps: 2,
            beats: [
                { id: 0, duration: 0, position: 0 },
                { id: 1, duration: 1, position: 1 },
                { id: 2, duration: 1, position: 2 },
            ],
            pages: [
                { id: 0, start_beat: 0 },
                { id: 1, start_beat: 1 },
                { id: 2, start_beat: 2 },
            ],
            marchers: [{ id: 3, drill_prefix: "B", drill_order: 1 }],
            marcherPages: [
                { marcher_id: 3, page_id: 0, x: 0, y: 0 },
                { marcher_id: 3, page_id: 1, x: 10, y: 10 },
                { marcher_id: 3, page_id: 2, x: 20, y: 20 },
            ],
            pathways: [],
            lightingData: {
                scenes: [{ id: 1, start_page_id: 0, name: null }],
                groups: [{ id: 10, scene_id: 1, name: null }],
                group_marchers: [
                    { id: 1000, group_id: 10, marcher_id: 3, scene_id: 1 },
                ],
                effects: [],
                effect_groups: [],
                effect_layers: [],
            },
        });

        expect(
            source.showData.sampledCoordinates.coordinatesByMarcher["3"],
        ).toEqual([0, 0, 5, 5, 10, 10, 15, 15, 20, 20]);
    });

    it("serializes Float32Array coordinate samples into JSON arrays", () => {
        const serialized = serializeSampledMarcherCoordinates({
            fps: 30,
            frameCount: 2,
            durationSeconds: 1,
            coordinatesByMarcher: {
                "7": Float32Array.from([1, 2, 3, 4]),
            },
        });

        expect(serialized.coordinatesByMarcher["7"]).toEqual([1, 2, 3, 4]);
        expect(
            serialized.coordinatesByMarcher["7"] instanceof Float32Array,
        ).toBe(false);
    });
});
