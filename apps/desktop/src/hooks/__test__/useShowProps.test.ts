import { describe, expect, it } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import type { DatabaseItemGeometry } from "@/db-functions/items";
import { _combineShowPropsQueries, propInputs } from "../useShowProps";

type Results = Parameters<typeof _combineShowPropsQueries>[0];

const ok = <T>(data: T) =>
    ({ data, isLoading: false, isError: false }) as UseQueryResult<T>;

const geometryRow = (
    item_id: number,
    beat_id: number,
    width: number,
): DatabaseItemGeometry =>
    ({
        id: beat_id,
        item_id,
        beat_id,
        outline_type: "rectangle",
        width,
        depth: 1,
        height: 0.4,
        rotation: 0,
        custom_outline: null,
        transition_length: 1,
        rolls_out: 0,
        leading_edge: null,
    }) as DatabaseItemGeometry;

const results = (): Results => [
    ok([
        { id: 1, marcher_id: 101, kind: "prop", surface_type: "platform" },
        { id: 2, marcher_id: 102, kind: "equipment", surface_type: null },
        { id: 3, marcher_id: 103, kind: "prop", surface_type: "floor" },
    ]),
    ok([geometryRow(1, 30, 2), geometryRow(1, 10, 4), geometryRow(3, 20, 1)]),
    // beat ids out of position order
    ok([
        { id: 30, position: 2 },
        { id: 10, position: 0 },
        { id: 20, position: 1 },
    ]),
];

const propsOf = (r: Results, hidden?: ReadonlySet<number>) => {
    const { combined } = _combineShowPropsQueries(r);
    return combined
        ? propInputs(combined.items, combined.outlines, hidden)
        : [];
};

describe("_combineShowPropsQueries", () => {
    it("gives each prop its surface and Outline changes by beat ordinal", () => {
        const { isLoading, hasError } = _combineShowPropsQueries(results());
        expect(isLoading).toBe(false);
        expect(hasError).toBe(false);
        const props = propsOf(results());
        // equipment is carried, not stood on
        expect(props.map((p) => [p.id, p.surface])).toEqual([
            [101, "platform"],
            [103, "floor"],
        ]);
        expect(props[0]!.changes.map((c) => [c.beat, c.width]).sort()).toEqual([
            [0, 4],
            [2, 2],
        ]);
        expect(props[1]!.changes.map((c) => c.beat)).toEqual([1]);
    });

    it("leaves out a prop hidden on the field, by item id", () => {
        expect(propsOf(results(), new Set([1])).map((p) => p.id)).toEqual([
            103,
        ]);
    });

    it("has no props while a query loads or fails", () => {
        const loading = results();
        loading[1] = {
            data: undefined,
            isLoading: true,
            isError: false,
        } as UseQueryResult<DatabaseItemGeometry[]>;
        expect(_combineShowPropsQueries(loading)).toEqual({
            combined: null,
            isLoading: true,
            hasError: false,
        });
        const failed = results();
        failed[2] = {
            data: undefined,
            isLoading: false,
            isError: true,
        } as unknown as Results[2];
        expect(_combineShowPropsQueries(failed)).toMatchObject({
            combined: null,
            hasError: true,
        });
    });
});
