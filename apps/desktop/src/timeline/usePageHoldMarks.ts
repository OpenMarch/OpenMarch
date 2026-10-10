import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { marcherPagesByPageQueryOptions } from "@/hooks/queries/useMarcherPages";
import {
    pageHoldMarks,
    pageModeMarcherPageStates,
    timelineMarcherPageStates,
    type PageHoldMark,
} from "./pageHoldMarks";
import { pageFlags, type FlagPage } from "./timelinePlayhead";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { useKeptAssignmentsStore } from "./useKeepLaterPages";

/** Each page's mark for the selection, by page id; pages without a mark aren't in it. */
export type PageHoldMarks = ReadonlyMap<number, PageHoldMark>;

export const NO_HOLD_MARKS: PageHoldMarks = new Map();

type NamedPage = FlagPage & { readonly name: string };

function marksById(
    pageIds: readonly number[],
    marks: readonly (PageHoldMark | null)[],
): PageHoldMarks {
    const byId = new Map<number, PageHoldMark>();
    marks.forEach((mark, index) => {
        if (mark) byId.set(pageIds[index]!, mark);
    });
    return byId;
}

/**
 * The selection's marks in timeline mode (`pageHoldMarks`), from the resolver's spans and the
 * kept markers (a kept page holds). Computed once per selection, page list, kept markers and
 * resolver version (a committed edit, undo or redo), so playback and scrubbing never recompute it.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useTimelineHoldMarks(
    pages: readonly NamedPage[],
    marcherIds: readonly number[],
): PageHoldMarks {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const kept = useKeptAssignmentsStore((s) => s.ids);
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || marcherIds.length === 0) return NO_HOLD_MARKS;
        const flags = pageFlags(pages);
        const beats = flags.map((f) => f.flag);
        return marksById(
            flags.map((f) => f.page.id),
            pageHoldMarks(
                marcherIds.map((id) =>
                    timelineMarcherPageStates(
                        resolverSpans(resolver, id),
                        beats,
                        kept,
                    ),
                ),
                flags.map((f) => f.page.name),
            ),
        );
    }, [resolver, version, kept, pages, marcherIds]);
}

/** Every page's marcher rows, by page index (undefined while one loads). */
export const _combinePageMarcherPages = (
    results: UseQueryResult<MarcherPagesByMarcher>[],
): (MarcherPagesByMarcher | undefined)[] => results.map((r) => r.data);

/**
 * The selection's marks in page mode (`pageHoldMarks`), from each page's marcher rows: a page
 * holds for a marcher whose position equals the previous page's. Reads nothing with an empty
 * selection; the rows follow the page queries, so an edit, undo or redo updates the marks.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function usePageModeHoldMarks(
    pages: readonly { readonly id: number; readonly name: string }[],
    marcherIds: readonly number[],
    enabled = true,
): PageHoldMarks {
    const reading = enabled && marcherIds.length > 0;
    const rows = useQueries({
        queries: reading
            ? pages.map((page) => marcherPagesByPageQueryOptions(page.id))
            : [],
        combine: _combinePageMarcherPages,
    });
    return useMemo(() => {
        if (!reading || rows.length !== pages.length) return NO_HOLD_MARKS;
        return marksById(
            pages.map((p) => p.id),
            pageHoldMarks(
                marcherIds.map((id) =>
                    pageModeMarcherPageStates(rows.map((page) => page?.[id])),
                ),
                pages.map((p) => p.name),
            ),
        );
    }, [reading, rows, pages, marcherIds]);
}
