import type { Resolver } from "@openmarch/core";
import type { FieldProperties } from "@openmarch/core";
import { StepSize, type MinMaxStepSizes } from "@/global/classes/StepSize";
import { pageEndBeat } from "./timelineCanvas";
import { sampleMarcherPath } from "./timelineKeyframes";

/**
 * Path visuals and step sizes in timeline mode (docs/timeline/phases/07-page-parity.md P7.10).
 *
 * Page mode draws a straight line between two pages' `marcher_pages` rows. In timeline mode the
 * move between two pages is whatever the resolver says, so the path is sampled from it between
 * the two pages' end beats (`pageEndBeat`, D-16): an arc or a follow-the-leader move draws as the
 * curve the marcher really walks. Nothing here reads `marcher_pages`.
 *
 * - **Endpoints** are the positions at the page end beats, which is where the canvas draws the
 *   marchers on those pages.
 * - **The midpoint** is the position halfway through the move in counts (the midset), so it lies
 *   on the drawn path. For a straight move at a constant pace it is the page-mode midpoint.
 * - **Step size** is the stride of the marcher's fastest moving stretch within the page: the
 *   largest length per count over the non-hold spans clipped to the page (lead decision on PR
 *   #33). Holds, moves that end mid-page and breakaway holds don't dilute it. For a straight move
 *   over the whole page it is page mode's step size.
 */

/**
 * The chord tolerance for drawn paths and for step sizes, in field units (canvas pixels): under a
 * pixel. A polyline is shorter than its curve by roughly the tolerance squared over the radius
 * per chord, a few thousandths of a step at this tolerance, far under the tenth of a step shown.
 */
export const PATH_DRAW_TOLERANCE = 0.25;

export interface TimelinePath {
    /** From the position at the start beat to the one at the end beat; at least one point */
    points: { x: number; y: number }[];
    start: { x: number; y: number };
    end: { x: number; y: number };
    /** The position halfway through the move in beats (the midset) */
    midpoint: { x: number; y: number };
    /** The length of `points` as a polyline, in field units */
    length: number;
    /**
     * Field units per count of the fastest moving stretch (see the module comment); 0 for a
     * marcher that holds throughout
     */
    stride: number;
}

type PathResolver = Pick<Resolver, "positionAt" | "spanInfos" | "marcherIds">;

/** A page as these helpers read it: `Page` satisfies this. */
export interface PathPage {
    readonly counts: number;
    readonly beats: readonly { readonly index: number }[];
}

function hasMarcher(resolver: PathResolver, marcherId: number): boolean {
    const ids = resolver.marcherIds();
    let lo = 0;
    let hi = ids.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const id = ids[mid]!;
        if (id === marcherId) return true;
        if (id < marcherId) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}

/**
 * One marcher's path between two beats, or null when the resolver doesn't know the marcher or
 * the range is empty.
 */
export function sampleTimelinePath(
    resolver: PathResolver,
    marcherId: number,
    fromBeat: number,
    toBeat: number,
    tolerance = PATH_DRAW_TOLERANCE,
): TimelinePath | null {
    if (!(fromBeat < toBeat) || !hasMarcher(resolver, marcherId)) return null;
    const { points, stride } = sampleMarcherPath(
        resolver,
        marcherId,
        fromBeat,
        toBeat,
        { tolerance },
    );
    const xy = points.map(([x, y]) => ({ x, y }));
    let length = 0;
    for (let i = 1; i < xy.length; i++)
        length += Math.hypot(xy[i]!.x - xy[i - 1]!.x, xy[i]!.y - xy[i - 1]!.y);
    const [mx, my] = resolver.positionAt(marcherId, (fromBeat + toBeat) / 2);
    return {
        points: xy,
        start: xy[0]!,
        end: xy[xy.length - 1]!,
        midpoint: { x: mx, y: my },
        length,
        stride,
    };
}

/**
 * The move into `page` from `previousPage`: the path between their end beats. Null when there is
 * no previous page (the first page) or the resolver doesn't know the marcher.
 */
export function pathIntoPage(
    resolver: PathResolver,
    marcherId: number,
    page: PathPage,
    previousPage: PathPage | null | undefined,
    tolerance = PATH_DRAW_TOLERANCE,
): TimelinePath | null {
    if (!previousPage) return null;
    return sampleTimelinePath(
        resolver,
        marcherId,
        pageEndBeat(previousPage),
        pageEndBeat(page),
        tolerance,
    );
}

/** Every listed marcher's move into `page`, by marcher id; marchers with none are left out. */
export function pathsIntoPage(
    resolver: PathResolver,
    marcherIds: Iterable<number>,
    page: PathPage | null | undefined,
    previousPage: PathPage | null | undefined,
    tolerance = PATH_DRAW_TOLERANCE,
): Map<number, TimelinePath> {
    const paths = new Map<number, TimelinePath>();
    if (!page || !previousPage) return paths;
    for (const marcherId of marcherIds) {
        const path = pathIntoPage(
            resolver,
            marcherId,
            page,
            previousPage,
            tolerance,
        );
        if (path) paths.set(marcherId, path);
    }
    return paths;
}

/** The step size of a sampled path: its stride as the distance covered in one count. */
export function stepSizeOfPath(
    marcherId: number,
    path: Pick<TimelinePath, "stride">,
    fieldProperties: FieldProperties,
): StepSize {
    return StepSize.fromDistance({
        marcher_id: marcherId,
        distance: path.stride,
        counts: 1,
        fieldProperties,
    });
}

/**
 * The step size of a marcher's move into `page` from `previousPage`, from the resolver (see the
 * module comment). Undefined where page mode has none (no previous page) or the resolver doesn't
 * know the marcher.
 */
export function timelineStepSize({
    resolver,
    marcherId,
    page,
    previousPage,
    fieldProperties,
}: {
    resolver: PathResolver;
    marcherId: number;
    page: PathPage;
    previousPage: PathPage | null | undefined;
    fieldProperties: FieldProperties;
}): StepSize | undefined {
    const path = pathIntoPage(resolver, marcherId, page, previousPage);
    return path ? stepSizeOfPath(marcherId, path, fieldProperties) : undefined;
}

/**
 * The smallest and largest step sizes among `marcherIds` for the move into `page`, from the
 * resolver; the timeline counterpart of `StepSize.getMinAndMaxStepSizesForMarchers`.
 */
export function timelineMinMaxStepSizes({
    resolver,
    marcherIds,
    page,
    previousPage,
    fieldProperties,
}: {
    resolver: PathResolver;
    marcherIds: Iterable<number>;
    page: PathPage;
    previousPage: PathPage | null | undefined;
    fieldProperties: FieldProperties;
}): MinMaxStepSizes {
    const stepSizes: StepSize[] = [];
    for (const marcherId of marcherIds) {
        const stepSize = timelineStepSize({
            resolver,
            marcherId,
            page,
            previousPage,
            fieldProperties,
        });
        if (stepSize) stepSizes.push(stepSize);
    }
    stepSizes.sort(StepSize.compare);
    return { min: stepSizes[0], max: stepSizes[stepSizes.length - 1] };
}
