import { inArray } from "drizzle-orm";
import { toast } from "sonner";
import { db, schema } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { subscribeHistoryChanges } from "@/db-functions/history";

/**
 * **Move them too** (defined-coordinates 09, G4): after an edit splits the marchers it moved at a
 * later page, some following into it and some keeping their own move's absolute spot there, the
 * ones that kept it no longer travel with the rest. Only a split says anything: where every moved
 * marcher has its own later move (a written show), or every one follows, ordinary edits stay
 * silent (V-146). The surprise toast names them, "OT1 and OT8 have their own move on Page
 * 3, so they kept their spot", with **Move them too**, which shifts those later destinations by
 * the offset the edit moved each marcher, as its own undoable edit. Destinations stay absolute
 * (D-5); this only offers to repeat the edit there. The same in both modes: page mode's write
 * result says where each marcher stopped (`OwnMoveStop`), timeline mode reads it from the
 * resolver (`timelineMoveThemToo.ts`).
 */

/**
 * The one toast for an edit's surprises: a window passing a flag, page mode's carry-forward, and
 * **Move them too** all show through `editSurpriseToastId`, so a later one replaces the earlier
 * instead of stacking.
 */
let surpriseToasts = 0;
let currentSurpriseToast: string | null = null;

/**
 * A fresh id for the next edit surprise toast, closing the one before. Not one fixed id: sonner
 * merges a toast into every earlier one with its id, even one long closed, so a one-button toast
 * would keep an earlier one's second button, icon and close handlers.
 */
export function editSurpriseToastId(): string {
    if (currentSurpriseToast !== null) toast.dismiss(currentSurpriseToast);
    surpriseToasts++;
    currentSurpriseToast = `timeline-edit-${surpriseToasts}`;
    return currentSurpriseToast;
}

/** The edit surprise toast shown last (it may have closed since), or null */
export const currentEditSurpriseToastId = () => currentSurpriseToast;

/** How long the toast stays: it has an action */
export const MOVE_THEM_TOO_TOAST_MS = 10000;

/** Translates with ICU parameters; the Tolgee singleton by default, anything in tests. */
export type MoveThemTooTranslate = (
    key: string,
    defaultMessage: string,
    params?: Record<string, string>,
) => string;

const defaultTranslate: MoveThemTooTranslate = (key, defaultMessage, params) =>
    tolgee.t(key, defaultMessage, params);

/** One marcher that kept its later own move's spot, by name, and that move's page. */
export interface KeptMarcher {
    label: string;
    page: string;
}

/**
 * "OT1", "OT1 and OT8", "OT1, OT2 and OT3", and past three, the first two and "and N others"
 * ("OT1, OT2 and 4 others"), so the toast never lists more than three things.
 */
export function marcherNamesList(
    labels: readonly string[],
    translate: MoveThemTooTranslate = defaultTranslate,
): string {
    if (labels.length <= 1) return labels[0] ?? "";
    if (labels.length <= 3)
        return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    return translate(
        "marcherPages.moveThemToo.namesAndOthers",
        "{first}, {second} and {count} others",
        {
            first: labels[0]!,
            second: labels[1]!,
            count: String(labels.length - 2),
        },
    );
}

/**
 * The toast's text and action label. `kept` is in the order to name them; pages are named as the
 * app shows them ("3").
 */
export function moveThemTooMessage(
    kept: readonly KeptMarcher[],
    translate: MoveThemTooTranslate = defaultTranslate,
): { message: string; actionLabel: string } {
    const names = marcherNamesList(
        kept.map((k) => k.label),
        translate,
    );
    const pages = [...new Set(kept.map((k) => k.page))];
    const actionLabel = translate(
        "marcherPages.moveThemToo.action",
        "Move them too",
    );
    if (pages.length > 1)
        return {
            message: translate(
                "marcherPages.moveThemToo.laterMoves",
                "{names} have their own later moves, so they kept their spots",
                { names },
            ),
            actionLabel,
        };
    const page = pages[0] ?? "";
    return {
        message:
            kept.length === 1
                ? translate(
                      "marcherPages.moveThemToo.oneMarcher",
                      "{names} has its own move on Page {page}, so it kept its spot",
                      { names, page },
                  )
                : translate(
                      "marcherPages.moveThemToo.onePage",
                      "{names} have their own move on Page {page}, so they kept their spot",
                      { names, page },
                  ),
        actionLabel,
    };
}

/** Each marcher's drill number ("OT1"), as the app shows it, by id. */
export async function marcherLabelsById(
    marcherIds: readonly number[],
): Promise<Map<number, { label: string; prefix: string; order: number }>> {
    if (marcherIds.length === 0) return new Map();
    const rows = await db
        .select({
            id: schema.marchers.id,
            prefix: schema.marchers.drill_prefix,
            order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .where(inArray(schema.marchers.id, [...new Set(marcherIds)]))
        .all();
    return new Map(
        rows.map((r) => [
            r.id,
            {
                label: `${r.prefix}${r.order}`,
                prefix: r.prefix,
                order: r.order,
            },
        ]),
    );
}

/**
 * `ids` in the order the toast names them: by drill prefix, then drill number, then id. Ids
 * without a marcher row are dropped.
 */
export function inDrillOrder(
    ids: readonly number[],
    labels: ReadonlyMap<number, { prefix: string; order: number }>,
): number[] {
    return ids
        .filter((id) => labels.has(id))
        .sort((a, b) => {
            const la = labels.get(a)!;
            const lb = labels.get(b)!;
            return (
                la.prefix.localeCompare(lb.prefix) ||
                la.order - lb.order ||
                a - b
            );
        });
}

/** Counts committed history changes (an edit, an undo or a redo), from the first time it's read */
let historyChanges = 0;
let countingHistoryChanges = false;

/**
 * Which history change the edit that just committed was. Read it as soon as the write returns,
 * before awaiting anything else, so a later edit can't have committed in between.
 */
export function editHistoryMark(): number {
    if (!countingHistoryChanges) {
        countingHistoryChanges = true;
        subscribeHistoryChanges(() => {
            historyChanges++;
        });
    }
    return historyChanges;
}

/** One kept marcher's shift: what Move them too adds to its later move */
export interface FollowUpShift {
    dx: number;
    dy: number;
}

/** Each kept marcher's later move's shift so far, by `keyOf` */
export type ShiftTotals = ReadonlyMap<string, FollowUpShift>;

/** The open toast's edits so far, so the next edit can add to them */
let pending: {
    mode: "page" | "timeline";
    mark: number;
    scope: string;
    toastId: string | null;
    value: unknown;
} | null = null;

/**
 * What an edit was on (its pages, or its window) and the marchers it moved, as `continueEditRun`
 * compares them: order doesn't matter.
 */
export function editScope(
    on: Iterable<number | string>,
    marcherIds: Iterable<number>,
): string {
    const sorted = <V extends number | string>(values: Iterable<V>) =>
        [...new Set(values)].map(String).sort().join(",");
    return `${sorted(on)}|${sorted(marcherIds)}`;
}

/** One edit in a run of edits behind one toast (`continueEditRun`). */
export interface EditRun<T> {
    /** This edit's value, combined with the run's so far */
    value: T;
    /** Call with the toast's id once it shows */
    shown: (toastId: string) => void;
    /** Ends the run: its action ran, or its toast closed */
    forget: () => void;
    /**
     * An older edit whose check finished after a newer one's: its toast would describe an edit
     * that's no longer the last, so the caller shows none
     */
    stale: boolean;
}

/**
 * Several edits in a row, one toast: while the toast is open, an edit right after the last (the
 * next history change) in the same mode, on the same page(s) or window and moving exactly the same
 * marchers (`scope`, from `editScope`), continues its run, so **Move them too** and **Only Page
 * N** repeat or take back every nudge, not only the last. Anything else, an undo or redo in
 * between, another edit, Move them too, Only Page N, another surprise toast, the toast closing,
 * or nudging only some of the marchers, starts over from this edit.
 *
 * @param mark the edit's `editHistoryMark`
 * @param scope what the edit was on and which marchers it moved (`editScope`)
 * @param combine this edit's value, given the run's so far (null when it starts one)
 */
export function continueEditRun<T>(
    mode: "page" | "timeline",
    mark: number,
    scope: string,
    combine: (previous: T | null) => T,
): EditRun<T> {
    const previous = pending;
    // An older edit's check finishing late leaves the newer toast's run alone
    if (previous && mark < previous.mark)
        return {
            value: combine(null),
            shown: () => {},
            forget: () => {},
            stale: true,
        };
    const continues =
        previous !== null &&
        previous.mode === mode &&
        previous.mark + 1 === mark &&
        previous.scope === scope &&
        previous.toastId !== null &&
        previous.toastId === currentSurpriseToast;
    const next = {
        mode,
        mark,
        scope,
        toastId: null as string | null,
        value: combine(continues ? (previous.value as T) : null),
    };
    pending = next;
    return {
        value: next.value,
        stale: false,
        shown: (toastId) => {
            if (pending === next) next.toastId = toastId;
        },
        // By toast: a nudge that continues the run replaces `pending` but keeps its toast, whose
        // close handlers are still this edit's
        forget: () => {
            if (
                pending === next ||
                (next.toastId !== null && pending?.toastId === next.toastId)
            )
                pending = null;
        },
    };
}

/**
 * `shifts` with the run's totals added (`previous`), when they keep the same marchers at the same
 * later moves (`keyOf`: the marcher, and the page or slot it stopped at); otherwise as they are.
 */
export function addShifts<T extends FollowUpShift>(
    previous: ShiftTotals | null,
    shifts: readonly T[],
    keyOf: (shift: T) => string,
): { shifts: T[]; totals: ShiftTotals } {
    const keys = shifts.map(keyOf);
    const same =
        previous !== null &&
        previous.size === new Set(keys).size &&
        keys.every((k) => previous.has(k));
    const summed = shifts.map((shift, i) => {
        const before = same ? previous.get(keys[i]!)! : null;
        return before
            ? { ...shift, dx: shift.dx + before.dx, dy: shift.dy + before.dy }
            : { ...shift };
    });
    return {
        shifts: summed,
        totals: new Map(
            summed.map((s, i) => [keys[i]!, { dx: s.dx, dy: s.dy }]),
        ),
    };
}

/** Forgets the open toast's run. Tests call it between cases. */
export function forgetEditRun(): void {
    pending = null;
}
