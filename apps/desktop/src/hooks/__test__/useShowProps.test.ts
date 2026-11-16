import { describe, expect, it } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import type { DatabaseItemGeometry } from "@/db-functions/items";
import {
    _combineShowPropsQueries,
    playedInstrumentInputs,
    propInputs,
} from "../useShowProps";

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
        {
            id: 1,
            marcher_id: 101,
            kind: "prop",
            surface_type: "platform",
            model: null,
        },
        {
            id: 2,
            marcher_id: 102,
            kind: "equipment",
            surface_type: null,
            model: "pit/marimba-5.0",
        },
        {
            id: 3,
            marcher_id: 103,
            kind: "prop",
            surface_type: "floor",
            model: null,
        },
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
        // equipment other than a podium is not stood on
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

    it("stands performers on a podium item, at its model's standing height", () => {
        const withPodium = results();
        withPodium[0] = ok([
            ...withPodium[0].data!,
            {
                id: 4,
                marcher_id: 104,
                kind: "equipment",
                surface_type: null,
                model: "pit/conductor-podium",
            },
            {
                id: 5,
                marcher_id: 105,
                kind: "equipment",
                surface_type: null,
                model: "pit/unknown-podium",
            },
            {
                id: 6,
                marcher_id: 106,
                kind: "equipment",
                surface_type: null,
                model: "pit/stepladder-6ft",
            },
        ]);
        const props = propsOf(withPodium);
        expect(
            props.map((p) => [
                p.id,
                p.surface,
                p.standTop,
                p.facesAcross,
                p.standAt,
            ]),
        ).toEqual([
            [101, "platform", undefined, undefined, undefined],
            [103, "floor", undefined, undefined, undefined],
            [104, "platform", 0.426, true, { x: 0, z: 0 }],
            [106, "platform", 1.2192, true, { x: 0, z: 0.2 }],
        ]);
        expect(
            propsOf(withPodium, new Set([4])).map((p) => p.id),
        ).not.toContain(104);
    });

    it("lists the played pit instruments, not speakers, the mixer, podiums or hidden items", () => {
        const pit = results();
        pit[0] = ok([
            ...pit[0].data!,
            ...[
                "pit/speaker-tall",
                "pit/mixer-cart-covered",
                "pit/conductor-podium",
                "pit/vibraphone-3.0-gold",
            ].map((model, k) => ({
                id: 4 + k,
                marcher_id: 104 + k,
                kind: "equipment" as const,
                surface_type: null,
                model,
            })),
        ]);
        const { combined } = _combineShowPropsQueries(pit);
        const played = (hidden?: ReadonlySet<number>) =>
            playedInstrumentInputs(
                combined!.items,
                combined!.outlines,
                hidden,
            ).map((p) => [p.id, p.model]);
        expect(played()).toEqual([
            [102, "pit/marimba-5.0"],
            [107, "pit/vibraphone-3.0-gold"],
        ]);
        expect(played(new Set([2]))).toEqual([
            [107, "pit/vibraphone-3.0-gold"],
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
