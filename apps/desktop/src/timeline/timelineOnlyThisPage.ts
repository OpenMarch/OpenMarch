import type { Resolver, XY } from "@openmarch/core";
import { toast } from "sonner";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import type {
    TimelineEditTarget,
    TimelineMoveResult,
} from "@/db-functions/timelineMoves";
import { keepMarchersOnPage } from "@/db-functions/timelineKeepHere";
import { readKeptAssignmentIds } from "@/db-functions/timelineKeptMarkers";
import {
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import {
    MOVE_THEM_TOO_TOAST_MS,
    continueEditRun,
    editSurpriseToastId,
} from "@/utilities/moveThemToo";
import type { KeptPageBox } from "./timelineKept";
import {
    followingPages,
    pageKeepStates,
    type KeepPage,
    type KeepTranslate,
} from "./timelineKeepLater";
import { editedMarcherEnds } from "./timelineCarryForward";
import { toastTimelineError } from "./timelineErrorMessages";
import { applyKeptChange } from "./useKeepLaterPages";
import {
    resolverSpans,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "./timelineStore";

/**
 * **Only Page N** in timeline mode (UI-18 keep later pages; defined-coordinates 10, the C
 * prototype's rule, owner decision 2026-10-09): after an edit that changed an existing own move on
 * page N and carried into the later pages that follow it, one surprise toast, "Pages 3–4
 * followed", with **Only Page 2**. The action, its own undo step, keeps the moved marchers on the
 * next page at their spots from before the edit (`keepMarchersOnPage` with `at`), so the later
 * pages look as they did. A page's first move stays silent: its later pages following is what the
 * designer meant. Nudges in a row (`continueEditRun`) keep one toast, whose action goes back to
 * the spots before the first nudge. The pass-through and **Move them too** toasts win: the caller
 * asks only when neither shows.
 */

/** Two offsets closer to zero than this, per axis, are no move (canvas pixels) */
const NO_OFFSET = 1e-6;

/**
 * Of `marcherIds`, the ones with a move of their own ending in the range target's window
 * (`(start, end]`) now: read before an edit, the ones whose move there it changes rather than
 * creates. Empty for other targets.
 */
export function ownMovers(
    target: TimelineEditTarget,
    marcherIds: readonly number[],
    resolver: Resolver | null = useTimelineResolverStore.getState().resolver,
): Set<number> {
    const out = new Set<number>();
    if (target.kind !== "range" || !resolver) return out;
    for (const id of marcherIds)
        if (
            resolverSpans(resolver, id).some(
                (s) =>
                    s.kind !== "hold" &&
                    s.end > target.start &&
                    s.end <= target.end,
            )
        )
            out.add(id);
    return out;
}

/** The page boxes as `pageKeepStates` takes them, home first (it has no box). */
export function keepPagesOfBoxes(boxes: readonly PageBox[]): KeepPage[] {
    const sorted = [...boxes].sort((a, b) => a.end - b.end);
    return [
        { id: 0, name: "", flag: 0, range: null },
        ...sorted.map((b, i) => ({
            id: i + 1,
            name: b.name ?? "?",
            flag: b.end,
            range: { start: b.start, end: b.end },
        })),
    ];
}

/** Who followed an edit into later pages, and where (`followedAfterEdit`). */
export interface FollowedAfterEdit {
    /** The moved marchers that follow into the next page box, ascending */
    marcherIds: number[];
    /** The pages they followed into, in page order */
    pages: string[];
    /** The next page box after the edited page */
    next: KeptPageBox;
    /** The edited page's name */
    editedName: string;
}

/**
 * After a range edit ending on a page flag has reached the resolver: the moved marchers among
 * `owned` (offset past `NO_OFFSET` at the edit's end) that follow it into the next page box, and
 * the pages they followed into. Null when nobody followed, or the edit doesn't end on a flag.
 */
export function followedAfterEdit({
    target,
    result,
    start,
    owned,
    resolver,
    kept,
    pages,
}: {
    target: TimelineEditTarget;
    result: Pick<TimelineMoveResult, "homes" | "slots" | "cleared">;
    start: { positions: ReadonlyMap<number, XY> };
    owned: ReadonlySet<number>;
    resolver: Resolver;
    kept: ReadonlySet<number>;
    pages: readonly KeepPage[];
}): FollowedAfterEdit | null {
    if (target.kind !== "range") return null;
    const edited = pages.find((p) => p.range && p.flag === target.end);
    if (!edited) return null;
    const spansOf = (id: number) => resolverSpans(resolver, id);
    const moved: number[] = [];
    for (const id of editedMarcherEnds(target, result, spansOf).keys()) {
        const before = start.positions.get(id);
        if (!before || !owned.has(id)) continue;
        const [x, y] = resolver.positionAt(id, target.end);
        if (
            Math.abs(x - before[0]) > NO_OFFSET ||
            Math.abs(y - before[1]) > NO_OFFSET
        )
            moved.push(id);
    }
    if (moved.length === 0) return null;
    const states = pageKeepStates({
        pages,
        marcherIds: moved,
        spansOf,
        kept,
    });
    const nextIndex = states.findIndex((s) => s.pageId === edited.id) + 1;
    const next = states[nextIndex];
    const following = followingPages(states, edited.id, pages[0]?.id);
    if (!next || next.follows.length === 0 || !following) return null;
    return {
        marcherIds: next.follows,
        pages: following.names,
        next: next.box,
        editedName: edited.name,
    };
}

/** The toast's text and action label. */
export function onlyThisPageMessage(
    followed: readonly string[],
    edited: string,
    translate: KeepTranslate = (key, defaultValue, params) =>
        tolgee.t(key, defaultValue, params),
): { message: string; actionLabel: string } {
    const first = followed[0] ?? "";
    const last = followed[followed.length - 1] ?? first;
    return {
        message:
            first === last
                ? translate(
                      "timeline.keep.followed.onePage",
                      "Page {page} followed",
                      { page: first },
                  )
                : translate(
                      "timeline.keep.followed.pages",
                      "Pages {first}–{last} followed",
                      { first, last },
                  ),
        actionLabel: translate(
            "timeline.keep.followed.only",
            "Only Page {page}",
            {
                page: edited,
            },
        ),
    };
}

/** The run of edits behind one **Only Page N** toast: the spots before its first edit */
interface OnlyRun {
    readonly kind: "only-page";
    readonly positions: ReadonlyMap<number, XY>;
    toastId: string | null;
    continued: boolean;
}

const isOnlyRun = (v: unknown): v is OnlyRun =>
    typeof v === "object" && v !== null && (v as OnlyRun).kind === "only-page";

/**
 * Shows the toast for `found`, whose action keeps the followers on the next page box at their
 * spots in `positions` (from before the run's first edit).
 *
 * @returns the toast's id
 */
function showOnlyThisPageToast({
    database,
    found,
    positions,
    forget,
}: {
    database: DbConnection;
    found: FollowedAfterEdit;
    positions: ReadonlyMap<number, XY>;
    forget: () => void;
}): string {
    const at = new Map<number, XY>();
    for (const id of found.marcherIds) {
        const spot = positions.get(id);
        if (spot) at.set(id, spot);
    }
    const { message, actionLabel } = onlyThisPageMessage(
        found.pages,
        found.editedName,
    );
    const id = editSurpriseToastId();
    toast.info(message, {
        id,
        duration: MOVE_THEM_TOO_TOAST_MS,
        action: {
            label: actionLabel,
            onClick: () => {
                forget();
                keepMarchersOnPage({
                    db: database,
                    pageBox: found.next,
                    marcherIds: found.marcherIds,
                    at,
                })
                    .then((kept) => applyKeptChange(kept.markers))
                    .catch((e: unknown) =>
                        toastTimelineError(e, "Error keeping the later pages"),
                    );
            },
        },
        onDismiss: forget,
        onAutoClose: forget,
    });
    return id;
}

/**
 * Once the edit has reached the resolver, shows the **Only Page N** toast when it carried into
 * later pages for some of the `owned` marchers it moved (`followedAfterEdit`). Errors reading
 * the kept spots are logged: the edit itself has committed.
 *
 * @returns whether it said anything
 */
export async function offerOnlyThisPage({
    database = db,
    target,
    result,
    start,
    mark,
    scope,
    owned,
    boxes = useTimelineSelectionStore.getState().pageBoxes,
}: {
    database?: DbConnection;
    target: TimelineEditTarget;
    result: Pick<TimelineMoveResult, "homes" | "slots" | "cleared">;
    start: { positions: ReadonlyMap<number, XY> } | null;
    /** The edit's `editHistoryMark` */
    mark: number;
    /** The edit's window and marchers (`editScope`) */
    scope: string;
    /** The marchers that had their own move in the edit's window before it (`ownMovers`) */
    owned: ReadonlySet<number>;
    boxes?: readonly PageBox[];
}): Promise<boolean> {
    if (!start || target.kind !== "range" || owned.size === 0) return false;
    await timelineResolverSettled();
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) return false;
    const found = followedAfterEdit({
        target,
        result,
        start,
        owned,
        resolver,
        kept: await readKeptAssignmentIds(database),
        pages: keepPagesOfBoxes(boxes),
    });
    if (!found) return false;
    const run = continueEditRun<OnlyRun>("timeline", mark, scope, (previous) =>
        isOnlyRun(previous)
            ? { ...previous, continued: true }
            : {
                  kind: "only-page",
                  positions: start.positions,
                  toastId: null,
                  continued: false,
              },
    );
    // A newer edit's toast already shows
    if (run.stale) return false;
    // A nudge in a run keeps the run's open toast, whose action now covers this edit too
    if (run.value.continued && run.value.toastId !== null) {
        run.shown(run.value.toastId);
        return true;
    }
    const id = showOnlyThisPageToast({
        database,
        found,
        positions: run.value.positions,
        forget: () => run.forget(),
    });
    run.value.toastId = id;
    run.shown(id);
    return true;
}
