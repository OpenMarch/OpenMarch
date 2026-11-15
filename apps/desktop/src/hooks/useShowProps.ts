/**
 * The show's props as the 3D View stands them (C4.5): each prop's surface type and Outline
 * changes, beats as ordinals (their place among the beats by position), as the timeline resolver
 * counts them.
 */
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { DatabaseBeat } from "@/db-functions";
import type { DatabaseItem, DatabaseItemGeometry } from "@/db-functions/items";
import { allDatabaseBeatsQueryOptions } from "@/hooks/queries/useBeats";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
} from "@/hooks/queries/useItems";
import {
    itemOutlineChanges,
    type ItemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import type { PropInput } from "@/view3d/core/props/propLayout";

type ShowPropItem = Pick<
    DatabaseItem,
    "id" | "marcher_id" | "kind" | "surface_type"
>;

export type ShowPropsReturn = {
    props: PropInput[];
    isLoading: boolean;
    hasError: boolean;
};

const NO_PROPS: PropInput[] = [];
const NONE_HIDDEN: ReadonlySet<number> = new Set();

/**
 * The props among the items (equipment is carried, not stood), with their Outline changes by
 * marchers row. A prop hidden on the field in the editor (`hidden`, by item id) is left out: it
 * isn't drawn, so nobody stands on it.
 */
export function propInputs(
    items: readonly ShowPropItem[],
    outlines: ItemOutlineChanges,
    hidden: ReadonlySet<number> = NONE_HIDDEN,
): PropInput[] {
    return items.flatMap((item) =>
        item.kind === "prop" && item.surface_type && !hidden.has(item.id)
            ? [
                  {
                      id: item.marcher_id,
                      surface: item.surface_type,
                      changes: outlines.get(item.marcher_id) ?? [],
                  },
              ]
            : [],
    );
}

/** Every prop with its item id, before the hidden ones are left out. */
type CombinedProps = {
    items: readonly ShowPropItem[];
    outlines: ItemOutlineChanges;
} | null;

/** The last combined results, by the query data they came from. */
let lastCombined: {
    items: readonly ShowPropItem[];
    geometry: readonly DatabaseItemGeometry[];
    beats: readonly Pick<DatabaseBeat, "id" | "position">[];
    combined: NonNullable<CombinedProps>;
} | null = null;

export const _combineShowPropsQueries = (
    results: [
        UseQueryResult<ShowPropItem[]>,
        UseQueryResult<DatabaseItemGeometry[]>,
        UseQueryResult<Pick<DatabaseBeat, "id" | "position">[]>,
    ],
): { combined: CombinedProps; isLoading: boolean; hasError: boolean } => {
    const [items, geometry, beats] = results;
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    if (isLoading || hasError || !items.data || !geometry.data || !beats.data)
        return { combined: null, isLoading, hasError };

    if (
        lastCombined?.items === items.data &&
        lastCombined.geometry === geometry.data &&
        lastCombined.beats === beats.data
    )
        return {
            combined: lastCombined.combined,
            isLoading: false,
            hasError: false,
        };
    const ordered = [...beats.data].sort(
        (a, b) => a.position - b.position || a.id - b.id,
    );
    const outlines = itemOutlineChanges({
        items: items.data,
        geometry: geometry.data,
        beatIndexes: new Map(ordered.map((b, i) => [b.id, i])),
    });
    lastCombined = {
        items: items.data,
        geometry: geometry.data,
        beats: beats.data,
        combined: { items: items.data, outlines },
    };
    return {
        combined: lastCombined.combined,
        isLoading: false,
        hasError: false,
    };
};

/** The last props built, so every caller in the window gets the same array. */
let shared: {
    combined: CombinedProps;
    hidden: ReadonlySet<number>;
    props: PropInput[];
} | null = null;

/** The one props array for these query results and hidden props (`performerLift.ts` keys on it). */
function sharedProps(
    combined: CombinedProps,
    hidden: ReadonlySet<number>,
): PropInput[] {
    if (!combined) return NO_PROPS;
    if (shared?.combined !== combined || shared.hidden !== hidden)
        shared = {
            combined,
            hidden,
            props: propInputs(combined.items, combined.outlines, hidden),
        };
    return shared.props;
}

/**
 * The show's props, for the 3D View window.
 *
 * @param hidden - item ids hidden on the field in the editor
 */
export function useShowProps(
    hidden: ReadonlySet<number> = NONE_HIDDEN,
): ShowPropsReturn {
    const { combined, isLoading, hasError } = useQueries({
        queries: [
            allItemsQueryOptions(),
            itemGeometryQueryOptions(),
            allDatabaseBeatsQueryOptions(),
        ],
        combine: _combineShowPropsQueries,
    });
    return { props: sharedProps(combined, hidden), isLoading, hasError };
}
