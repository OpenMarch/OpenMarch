import { toast } from "sonner";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import {
    moveMarchersFromFlagInstead,
    type TimelineMoveResult,
    type TimelinePassThrough,
} from "@/db-functions/timelineMoves";
import type { BeatRange } from "@/db-functions/timelineMembership";
import {
    selectionIsRange,
    useTimelineSelectionStore,
    type PageBox,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import { joinList, moveName } from "./timelineRangeWords";
import { editSurpriseToastId } from "@/utilities/moveThemToo";
import { toastTimelineError } from "./timelineErrorMessages";

/**
 * What the app says after a drag passed through pages (research/ownership/10-cross-page-windows.md
 * §4.1, §4.2; worded by defined-coordinates 08): which pages are no longer stops, since the
 * marchers now move straight through their flags, and the one-click way back, **Keep Page N as a
 * stop**, which takes the marchers out of the long move and moves them from the last flag inside
 * it instead (`moveMarchersFromFlagInstead`), so every flag inside is a stop again. It shows
 * whenever the drag added marchers over a page flag, even where no stored move ended there
 * (sparse rows, defined-coordinates 07a §4). No marcher names: the selection already shows who.
 *
 * Ordinary edits say nothing: which later pages an edit carried into is shown on the page boxes,
 * not in a toast (defined-coordinates 08, owner decision 2026-10-08).
 */

/** Translates with ICU parameters; the Tolgee singleton by default, anything in tests. */
export type PassThroughTranslate = (
    key: string,
    defaultMessage: string,
    params?: Record<string, string>,
) => string;

const defaultTranslate: PassThroughTranslate = (key, defaultMessage, params) =>
    tolgee.t(key, defaultMessage, params);

/** A stored move, for its name (UI-14): its id, range and stored name. */
export type PassThroughMove = Pick<
    StoredTimelineMembership,
    "id" | "start" | "end" | "name"
>;

// Pages and counts, and move names, shared with the write path's refusals
export { moveName, rangeWhere } from "./timelineRangeWords";

/**
 * The flag **Keep as a stop** moves from: the last page flag strictly inside the drag's range.
 * `null` when no flag is inside (the range crossed only clips).
 */
export function narrowingFlag(
    range: BeatRange,
    boxes: readonly PageBox[],
): number | null {
    const inside = boxes
        .map((b) => b.end)
        .filter((beat) => range.start < beat && beat < range.end);
    return inside.length === 0 ? null : Math.max(...inside);
}

/**
 * The pages whose flags `pass` moves straight through, as "3" or "3–4" (the flags inside one
 * range are consecutive), named by the box ending at each. `null` when it passes no flag, or a
 * flag has no named page.
 */
export function passedPages(
    pass: Pick<TimelinePassThrough, "flags">,
    boxes: readonly PageBox[],
): { first: string; last: string } | null {
    const names = pass.flags.map(
        (beat) => boxes.find((b) => b.end === beat)?.name,
    );
    if (names.length === 0 || names.some((n) => n === undefined)) return null;
    return { first: names[0]!, last: names[names.length - 1]! };
}

/**
 * The toast's text for `pass`: "Page 3 is no longer a stop" or "Pages 3–4 are no longer stops"
 * when it passes page flags; otherwise (it crossed only other moves) what it moves through and
 * what catches up after it, named by `moveName` from `moves` (the stored timelines).
 */
export function passThroughMessage(
    pass: TimelinePassThrough,
    boxes: readonly PageBox[],
    translate: PassThroughTranslate = defaultTranslate,
    moves: readonly PassThroughMove[] = [],
): string {
    const pages = passedPages(pass, boxes);
    if (pages)
        return pages.first === pages.last
            ? translate(
                  "timeline.edit.passThrough.noLongerStop.one",
                  "Page {page} is no longer a stop",
                  { page: pages.first },
              )
            : translate(
                  "timeline.edit.passThrough.noLongerStop.many",
                  "Pages {first}–{last} are no longer stops",
                  pages,
              );
    if (pass.flags.length > 0)
        return translate(
            "timeline.edit.passThrough.noLongerStop.unnamed",
            "The sets inside this move are no longer stops",
        );
    const through = joinList(
        pass.overridden.map((r) => moveName(r, boxes, moves)),
    );
    const caughtUp = joinList(
        pass.caughtUp.map((r) => moveName(r, boxes, moves)),
    );
    const params = { through, caughtUp };
    if (through && caughtUp)
        return translate(
            "timeline.edit.passThrough.throughAndCatchUp",
            "Now moves straight through {through}, then catches up to the set at the end of {caughtUp}",
            params,
        );
    if (through)
        return translate(
            "timeline.edit.passThrough.through",
            "Now moves straight through {through}",
            params,
        );
    return translate(
        "timeline.edit.passThrough.catchUp",
        "Now catches up to the set at the end of {caughtUp}",
        params,
    );
}

/**
 * The action's label, by what it does to the user's sets: every flag inside the drag becomes a
 * stop again, so "Keep Page 3 as a stop" or "Keep Pages 3–4 as stops".
 */
export function keepStopsLabel(
    pass: Pick<TimelinePassThrough, "flags">,
    boxes: readonly PageBox[],
    translate: PassThroughTranslate = defaultTranslate,
): string {
    const pages = passedPages(pass, boxes);
    if (!pages)
        return translate(
            "timeline.edit.passThrough.keepStops.unnamed",
            "Keep them as stops",
        );
    return pages.first === pages.last
        ? translate(
              "timeline.edit.passThrough.keepStops.one",
              "Keep Page {page} as a stop",
              { page: pages.first },
          )
        : translate(
              "timeline.edit.passThrough.keepStops.many",
              "Keep Pages {first}–{last} as stops",
              pages,
          );
}

/**
 * **Keep as a stop**: moves the passed marchers from the last flag inside the drag instead
 * (`moveMarchersFromFlagInstead`, which keeps where they are now). Their move is then the one
 * over `[flag, end)`, often a page box with no clip of its own, so a window still on the drag's
 * range would name a move that is gone: the window follows to the new range.
 */
export async function keepPassedFlagsAsStops(
    pass: TimelinePassThrough,
    flag: number,
): Promise<TimelineMoveResult> {
    const result = await moveMarchersFromFlagInstead({
        db,
        range: pass.range,
        from: flag,
        marcherIds: pass.marcherIds,
        deleteIfEmpty: pass.createdTimelineId,
    });
    const store = useTimelineSelectionStore.getState();
    if (
        store.isolation === null &&
        selectionIsRange(store.selection, pass.range.start, pass.range.end)
    )
        store.selectRange(flag, pass.range.end);
    return result;
}

/**
 * After a timeline-mode edit (`moveMarchersInTarget` and the like) has committed: when it passed
 * through page flags or other moves, says so, with **Keep as a stop** when a page flag lies
 * inside the range. Says nothing otherwise.
 */
export function toastPassThrough(
    result: Pick<TimelineMoveResult, "passThrough">,
): void {
    const pass = result.passThrough;
    if (!pass) return;
    const { pageBoxes: boxes, storedTimelines } =
        useTimelineSelectionStore.getState();
    const flag = narrowingFlag(pass.range, boxes);
    toast.info(
        passThroughMessage(pass, boxes, undefined, storedTimelines ?? []),
        {
            id: editSurpriseToastId(),
            duration: flag !== null ? 10000 : 6000,
            action:
                flag !== null
                    ? {
                          label: keepStopsLabel(pass, boxes),
                          onClick: () => {
                              keepPassedFlagsAsStops(pass, flag)
                                  .then(toastPassThrough)
                                  .catch((e: unknown) =>
                                      toastTimelineError(
                                          e,
                                          "Error moving marchers",
                                      ),
                                  );
                          },
                      }
                    : undefined,
        },
    );
}
