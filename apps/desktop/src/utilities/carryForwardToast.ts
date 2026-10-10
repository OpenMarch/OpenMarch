import { asc, eq, inArray } from "drizzle-orm";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, schema } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { generatePageNames } from "@/global/classes/Page";
import {
    moveLaterMovesToo,
    restoreCarriedRuns,
    type CarriedRun,
    type MarcherPagesWriteResult,
    type OwnMoveStop,
} from "@/db-functions/marcherPage";
import { invalidateAfterMarcherPagesWrite } from "@/hooks/queries/sharedInvalidators";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { conToastError } from "./utils";
import {
    MOVE_THEM_TOO_TOAST_MS,
    addShifts,
    continueEditRun,
    editHistoryMark,
    editScope,
    editSurpriseToastId,
    inDrillOrder,
    marcherLabelsById,
    moveThemTooMessage,
    type ShiftTotals,
} from "./moveThemToo";

/**
 * What page mode says after an edit carried forward to later pages (defined coordinates, 07b;
 * worded by 08): "Pages 3–7 followed (they were copies)", since those pages held copies of the
 * edited one, with **Only Page 2**, which puts those pages back as a second undoable edit
 * (`restoreCarriedRuns`).
 *
 * When the edit split the marchers it moved at a later page, some following into it and some
 * keeping their own move there, the one toast says both, "Pages 3–4 followed (they were copies).
 * OT1 and OT8 have their own move on Page 3, so they kept their spot", with **Move them too**
 * (`moveThemToo.ts`) and **Only Page 2** beside it.
 */

/** Translates with ICU parameters; the Tolgee singleton by default, anything in tests. */
export type CarryForwardTranslate = (
    key: string,
    defaultMessage: string,
    params?: Record<string, string>,
) => string;

const defaultTranslate: CarryForwardTranslate = (key, defaultMessage, params) =>
    tolgee.t(key, defaultMessage, params);

/**
 * The toast's text and action label. `followed` and `edited` are page names in page order;
 * `followed` is aggregated over every marcher as its first to last page.
 */
export function carryForwardMessage(
    followed: readonly string[],
    edited: readonly string[],
    translate: CarryForwardTranslate = defaultTranslate,
): { message: string; actionLabel: string } {
    const first = followed[0] ?? "";
    const last = followed[followed.length - 1] ?? first;
    const message =
        first === last
            ? translate(
                  "marcherPages.carryForward.onePage",
                  "Page {page} followed (it was a copy)",
                  { page: first },
              )
            : translate(
                  "marcherPages.carryForward.pages",
                  "Pages {first}–{last} followed (they were copies)",
                  { first, last },
              );
    const actionLabel =
        edited.length === 1
            ? translate("marcherPages.carryForward.only", "Only Page {page}", {
                  page: edited[0],
              })
            : translate(
                  "marcherPages.carryForward.onlyEdited",
                  "Only the edited pages",
              );
    return { message, actionLabel };
}

/** Every page's name, as the app shows it (with the file's page number offset). */
async function pageNamesById(qc: QueryClient): Promise<Map<number, string>> {
    const pages = await db
        .select({ id: schema.pages.id, is_subset: schema.pages.is_subset })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(asc(schema.beats.position))
        .all();
    const offset = await qc
        .fetchQuery(workspaceSettingsQueryOptions())
        .then((settings) => settings.pageNumberOffset ?? 0)
        .catch(() => 0);
    const names = generatePageNames(
        pages.map((p) => Boolean(p.is_subset)),
        offset,
    );
    return new Map(pages.map((p, i) => [p.id, names[i]]));
}

/** A run of page-mode edits behind one toast (`continueEditRun`) */
interface PageEditRun {
    /** The kept marchers' shifts so far (Move them too) */
    stops: ShiftTotals;
    /** The rows the run carried to, each with its position from before the run (Only Page N) */
    carried: CarriedRun[];
}

/**
 * The rows a run of edits carried to, as `restoreCarriedRuns` takes them: `next`'s runs, each row
 * with its position from before the run (the earliest `previous` had), then `previous`'s rows that
 * `next` didn't carry to. A run that lost its last row no longer restores the next pathway's start.
 */
export function mergeCarriedRuns(
    previous: readonly CarriedRun[],
    next: readonly CarriedRun[],
): CarriedRun[] {
    const before = new Map(
        previous.flatMap((run) => run.rows.map((r) => [r.id, r] as const)),
    );
    const merged = next.map((run) => ({
        ...run,
        rows: run.rows.map((r) => {
            const old = before.get(r.id);
            return old ? { ...r, x: old.x, y: old.y } : r;
        }),
    }));
    const covered = new Set(merged.flatMap((run) => run.rows.map((r) => r.id)));
    const left = previous.flatMap((run) => {
        const rows = run.rows.filter((r) => !covered.has(r.id));
        if (rows.length === 0) return [];
        const keepsLast = rows.includes(run.rows[run.rows.length - 1]!);
        return [
            {
                ...run,
                rows,
                nextPathwayId: keepsLast ? run.nextPathwayId : null,
                nextPageId: keepsLast ? run.nextPageId : null,
            },
        ];
    });
    return [...left, ...merged];
}

/**
 * The pages a write edited and the marchers it moved there (`editScope`): its rows, without the
 * ones it carried to.
 */
async function pageEditScope(result: MarcherPagesWriteResult): Promise<string> {
    const carriedIds = new Set(
        result.carried.flatMap((run) => run.rows.map((r) => r.id)),
    );
    const edited = result.updatedIds.filter((id) => !carriedIds.has(id));
    const rows: { marcherId: number; pageId: number }[] = [];
    for (let i = 0; i < edited.length; i += 500)
        rows.push(
            ...(await db
                .select({
                    marcherId: schema.marcher_pages.marcher_id,
                    pageId: schema.marcher_pages.page_id,
                })
                .from(schema.marcher_pages)
                .where(
                    inArray(schema.marcher_pages.id, edited.slice(i, i + 500)),
                )
                .all()),
        );
    return editScope(
        rows.map((r) => r.pageId),
        rows.map((r) => r.marcherId),
    );
}

/** `result` as the next edit in the toast's run (`continueEditRun`), or a new run */
const continuePageEditRun = (
    result: MarcherPagesWriteResult,
    mark: number,
    scope: string,
) =>
    continueEditRun<PageEditRun>("page", mark, scope, (previous) => ({
        stops: addShifts(previous?.stops ?? null, result.ownMoveStops, stopKey)
            .totals,
        carried: mergeCarriedRuns(previous?.carried ?? [], result.carried),
    }));

const stopKey = (s: OwnMoveStop) =>
    `${s.marcherId}:${s.pageId}:${s.stopPageId}`;

/**
 * After a page-mode write: when it carried forward to later pages, says which, and offers
 * **Only Page N**. When it also split the marchers it moved (`ownMoveStops`, only pages where
 * others followed), the same toast names those that kept their spot and offers **Move them too**
 * first. Says nothing when nothing was carried. Called right after the write: edits in a row on
 * the same pages that move the same marchers add up (`continueEditRun`), so Only Page N puts the
 * followed pages back to before the first, and Move them too shifts by all of them while they
 * keep the same marchers.
 */
export async function toastCarryForward(
    qc: QueryClient,
    result: MarcherPagesWriteResult | undefined,
): Promise<void> {
    if (!result) return;
    const mark = editHistoryMark();
    if (result.followedPageIds.length === 0) return;
    const [names, labels, scope] = await Promise.all([
        pageNamesById(qc),
        marcherLabelsById(result.ownMoveStops.map((s) => s.marcherId)),
        pageEditScope(result),
    ]);
    const run = continuePageEditRun(result, mark, scope);
    // A newer edit's toast already shows
    if (run.stale) return;
    const { carried } = run.value;
    const order = [...names.keys()];
    const editedPageIds = [...new Set(carried.map((r) => r.pageId))].sort(
        (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    const name = (id: number) => names.get(id) ?? "?";
    const followed = carryForwardMessage(
        result.followedPageIds.map(name),
        editedPageIds.map(name),
    );
    const onlyEdited = {
        label: followed.actionLabel,
        onClick: () => {
            run.forget();
            restoreCarriedRuns({ db, carried })
                .then((pageIds) =>
                    invalidateAfterMarcherPagesWrite(qc, pageIds),
                )
                .catch((e: unknown) =>
                    conToastError("Error moving marchers back", e),
                );
        },
    };
    const closing = { onDismiss: run.forget, onAutoClose: run.forget };

    const stopOf = new Map(result.ownMoveStops.map((s) => [s.marcherId, s]));
    const kept = inDrillOrder([...stopOf.keys()], labels).map((id) => ({
        label: labels.get(id)!.label,
        page: name(stopOf.get(id)!.stopPageId),
    }));
    const id = editSurpriseToastId();
    if (kept.length === 0) {
        toast.message(followed.message, {
            id,
            duration: 10000,
            action: onlyEdited,
            ...closing,
        });
    } else {
        // Split: one toast, Move them too first, Only Page N beside it (sonner's second button)
        const stops = result.ownMoveStops.map((s) => ({
            ...s,
            ...run.value.stops.get(stopKey(s)),
        }));
        const moveThemToo = moveThemTooMessage(kept);
        toast.info(withFollowedMessage(followed.message, moveThemToo.message), {
            id,
            duration: MOVE_THEM_TOO_TOAST_MS,
            action: {
                label: moveThemToo.actionLabel,
                onClick: () => {
                    run.forget();
                    moveKeptMarchersToo(qc, stops);
                },
            },
            cancel: onlyEdited,
            ...closing,
        });
    }
    run.shown(id);
}

/** **Move them too**: shifts the kept marchers' later moves, and refreshes those pages. */
function moveKeptMarchersToo(
    qc: QueryClient,
    stops: readonly OwnMoveStop[],
): void {
    moveLaterMovesToo({ db, stops })
        .then((write) =>
            invalidateAfterMarcherPagesWrite(
                qc,
                stops.map((s) => s.stopPageId),
                write,
            ),
        )
        .catch((e: unknown) => conToastError("Error moving marchers", e));
}

/**
 * "Pages 3–4 followed (they were copies). OT1 and OT8 have their own move on Page 3, so they
 * kept their spot": the carry-forward and Move them too messages as one.
 */
export function withFollowedMessage(
    followed: string,
    kept: string,
    translate: CarryForwardTranslate = defaultTranslate,
): string {
    return translate(
        "marcherPages.moveThemToo.withFollowed",
        "{followed}. {kept}",
        { followed, kept },
    );
}
