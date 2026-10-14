import { describe, expect, it as plainIt } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { pixelsToWorld } from "@openmarch/core";
import { describeDbTests } from "@/test/base";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { timeAtBeat } from "@/timeline/timeMap";
import { useShowPositions } from "../positions";
import { fakeShowPositions, linearTrack } from "./fakePositions";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

describe("ShowPositions", () => {
    const from = { x: 400, y: 300 };
    const to = { x: 600, y: 500 };
    const positions = fakeShowPositions(
        new Map([
            [1, linearTrack(from, to)],
            [2, linearTrack(to, from)],
        ]),
    );

    plainIt("gives the resolver's position in world meters", () => {
        for (const ms of [0, 250, 500, 1000, 2000]) {
            const p = linearTrack(from, to)(ms);
            const expected = pixelsToWorld(field, p);
            const actual = positions.positionAt(1, ms, field)!;
            expect(actual.x).toBeCloseTo(expected.x, 6);
            expect(actual.z).toBeCloseTo(expected.z, 6);
        }
    });

    plainIt("positionInto writes what positionAt returns", () => {
        for (const id of [1, 2])
            for (const ms of [0, 333, 1000]) {
                const out = { x: Number.NaN, z: Number.NaN };
                expect(positions.positionInto(id, ms, field, out)).toBe(true);
                expect(out).toEqual(positions.positionAt(id, ms, field));
            }
    });

    plainIt(
        "reads every marcher at the time asked, after reading another time",
        () => {
            const out = { x: 0, z: 0 };
            positions.positionInto(1, 0, field, out);
            positions.positionInto(2, 1000, field, out);
            const expected = pixelsToWorld(field, from);
            expect(out.x).toBeCloseTo(expected.x, 6);
            expect(out.z).toBeCloseTo(expected.z, 6);
        },
    );

    plainIt("returns false for a marcher it doesn't know and for NaN", () => {
        const out = { x: 1, z: 2 };
        expect(positions.has(3)).toBe(false);
        expect(positions.positionInto(3, 0, field, out)).toBe(false);
        expect(positions.positionInto(1, Number.NaN, field, out)).toBe(false);
        expect(out).toEqual({ x: 1, z: 2 });
    });
});

describeDbTests("useShowPositions", (it) => {
    it("matches the resolver at every page end", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        const { result } = renderHook(
            () => {
                const show = useShowPositions();
                const { pages, beats } = useTimingObjects();
                const { data: fieldProperties } = useQuery(
                    fieldPropertiesQueryOptions(),
                );
                return { show, pages, beats, fieldProperties };
            },
            { wrapper },
        );
        await waitFor(() => {
            expect(result.current.show.positions).not.toBeNull();
            expect(result.current.fieldProperties).toBeDefined();
        });
        expect(result.current.show.hasError).toBe(false);
        const { show, pages, beats, fieldProperties } = result.current;
        const resolver = await acquireExportResolver(db);
        expect(pages.length).toBeGreaterThan(1);

        for (const marcher of marchersAndPages.expectedMarchers) {
            expect(show.positions!.has(marcher.id)).toBe(true);
            for (const page of pages) {
                const beat = pageEndBeat(page);
                const ms = timeAtBeat(beats, beat) * 1000;
                const [x, y] = resolver.positionAt(marcher.id, beat);
                const expected = pixelsToWorld(fieldProperties!, { x, y });
                const actual = show.positions!.positionAt(
                    marcher.id,
                    ms,
                    fieldProperties!,
                )!;
                expect(actual.x).toBeCloseTo(expected.x, 6);
                expect(actual.z).toBeCloseTo(expected.z, 6);
            }
        }
    });
});
