import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Resolver, SpanInfo } from "@openmarch/core";
import { useTimelineResolverStore } from "../timelineStore";
import {
    keepStatesComputations,
    sharedPageKeepStates,
    useKeptAssignmentsStore,
    usePageKeepStates,
} from "../useKeepLaterPages";

/**
 * Pre-merge review U4: the selection's keep states are computed once per resolver version, kept
 * markers, selection and pages, however many places ask (the timeline panel, the inspector line,
 * K), even with their own arrays.
 */

const page = (id: number, name: string, first: number, last: number) => ({
    id,
    name,
    beats: Array.from({ length: last - first + 1 }, (_, i) => ({
        index: first + i,
    })),
});
// Flags: page 1 at 0 (home), page 2 at 9, page 3 at 17
const PAGES = [page(1, "1", 0, 0), page(2, "2", 1, 8), page(3, "3", 9, 16)];

const span = (
    marcherId: number,
    start: number,
    end: number,
    kind: SpanInfo["kind"],
    assignmentId: number | null = null,
): SpanInfo => ({
    marcherId,
    start,
    end,
    kind,
    assignmentId,
    transitionId: null,
    slot: null,
});

/** Marchers 1 and 2 move on page 2 and hold after */
const fakeResolver = () =>
    ({
        marcherIds: () => [1, 2],
        spanInfos: (id: number) => [
            span(id, -Infinity, 1, "hold"),
            span(id, 1, 9, "founding", id * 10),
            span(id, 9, Infinity, "hold"),
        ],
    }) as unknown as Resolver;

afterEach(() => {
    useTimelineResolverStore.setState({ resolver: null });
    useKeptAssignmentsStore.setState({ ids: new Set() });
});

describe("sharedPageKeepStates", () => {
    it("computes once for equal inputs, as other arrays; again when any changes", () => {
        const resolver = fakeResolver();
        const ask = (kept: Set<number>, ids: number[], version = 1) =>
            sharedPageKeepStates({
                resolver,
                version,
                kept,
                pages: [...PAGES],
                marcherIds: ids,
            });
        const before = keepStatesComputations();
        const first = ask(new Set(), [1, 2]);
        expect(ask(new Set(), [2, 1])).toBe(first);
        expect(keepStatesComputations()).toBe(before + 1);
        // New kept markers, a new version, another selection: computed again
        ask(new Set([20]), [1, 2]);
        ask(new Set([20]), [1, 2], 2);
        ask(new Set([20]), [1], 2);
        expect(keepStatesComputations()).toBe(before + 4);
        expect(first.map((s) => s.follows)).toEqual([[], [1, 2]]);
    });

    it("the panel's and the inspector's hooks share one computation", () => {
        useTimelineResolverStore.setState({
            resolver: fakeResolver(),
            version: 41,
        });
        const before = keepStatesComputations();
        const panelIds = [1, 2];
        const inspectorIds = [1, 2];
        const panel = renderHook(() => usePageKeepStates(PAGES, panelIds));
        const inspector = renderHook(() =>
            usePageKeepStates(PAGES, inspectorIds),
        );
        expect(inspector.result.current).toBe(panel.result.current);
        expect(keepStatesComputations()).toBe(before + 1);
    });
});
