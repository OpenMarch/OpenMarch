/**
 * Opening the Follow tool (pathways step 4b, DL-4): the window between the start flag and the
 * end flag, the selected line's shape at the start flag (DL-6), refusals said before anything is
 * drawn, and the session whose ends pulse until one is pressed.
 */
import type { Resolver } from "@openmarch/core";
import { db } from "@/global/database/db";
import {
    followOrderAt,
    tailFirstOf,
    trailDragRefusalFor,
    trailDragRefusal,
    type TrailWindow,
} from "@/db-functions/timelineTrailDrag";
import { endSpotsInMove, readTrails } from "@/db-functions/timelineTrails";
import { rippleFormAt } from "@/db-functions/timelineTrailRipple";
import {
    rippleFormProblem,
    rippleRefusal,
} from "@/db-functions/timelineTrailRipplePlan";
import type { DbConnection } from "@/db-functions/types";
import { isBasicMode } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { basicPageBox } from "@/timeline/timelineCoordinateWrites";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { currentShapeField } from "@/shapes/field/shapeField";
import type { XY } from "@/shapes/types";
import { groupMoveAt, type PathTarget } from "./pathTarget";
import { usePathPenStore } from "./pathPenStore";
import type { FollowDrag, FollowKeep } from "./followDrag";
import type { RippleForm } from "@/db-functions/timelineTrailRipplePlan";

/**
 * The window a trail is dragged in now (DL-2): the edit window `[start flag, playhead)`, in Basic
 * the page box at the playhead (past the last page, the window after the last flag). Null at home.
 */
export function followWindowNow(): TrailWindow | null {
    const state = useTimelineSelectionStore.getState();
    const { selection } = state;
    if (selection.kind !== "range") return null;
    if (isBasicMode()) {
        const box = basicPageBox(state, selection.end);
        if (box) return box;
    }
    return { start: selection.start, end: selection.end };
}

/**
 * Whether `ids` are exactly the line of a trail in their one move at `beat`: every member of it
 * and nobody else. Follow (Shift+L) then draws that trail again (step 4, AP-T1 and AP-T2's
 * "Again") instead of opening the Follow tool's drag.
 */
export async function isTrailLineAt(
    database: DbConnection,
    ids: readonly number[],
    beat: number,
): Promise<boolean> {
    const move = await groupMoveAt(database, ids, beat);
    if (move.kind !== "move") return false;
    const chosen = new Set(ids);
    return (await readTrails(database, move.timelineId)).some(
        (t) =>
            t.marcherIds.length === chosen.size &&
            t.marcherIds.every((m) => chosen.has(m)),
    );
}

/**
 * Keep end spots (AP-T9) by step 4's target rule: the one move every one of `ids` is in at `beat`
 * (the playhead), with each member's end spot there (its slot's stored destination). Null when there's none.
 */
export async function followKeepAt(
    database: DbConnection,
    resolver: Pick<Resolver, "positionAt">,
    ids: readonly number[],
    beat: number,
): Promise<FollowKeep | null> {
    const move = await groupMoveAt(database, ids, beat);
    if (move.kind !== "move") return null;
    // The line where that move starts, which is where the trail into its spots starts (step 9
    // review): its starts, and its order there (remembered, or else guessed), tail first
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    const at = sorted.map((m): [number, number] => {
        const [x, y] = resolver.positionAt(m, move.start);
        return [x, y];
    });
    const along = await followOrderAt(database, sorted, move.start, at);
    // Each end spot from its slot's stored destination, as Ripple in's write reads it (step 9)
    const stored = await database.transaction((tx) =>
        endSpotsInMove(tx, move.timelineId, sorted),
    );
    return {
        timelineId: move.timelineId,
        start: move.start,
        end: move.end,
        spots: new Map(
            ids.map((m): [number, XY] => {
                const p = stored?.get(m) ?? resolver.positionAt(m, move.end);
                return [m, { x: p[0], y: p[1] }];
            }),
        ),
        ...(along
            ? {
                  line: {
                      starts: new Map(
                          sorted.map((m, i) => [
                              m,
                              { x: at[i]![0], y: at[i]![1] },
                          ]),
                      ),
                      order: tailFirstOf(along).map((i) => sorted[i]!),
                  },
              }
            : {}),
    };
}

/**
 * Ripple in's next form (RP-2): `keep`'s end spots of `ids` in the form's own order, or null with
 * the reason (translated) when there's none, it closes or folds, or it lies on the line itself
 */
async function followFormOf(
    ids: readonly number[],
    keep: FollowKeep | null,
): Promise<{ form: RippleForm | null; formWhy: string | null }> {
    if (!keep) return { form: null, formWhy: null };
    const form = await rippleFormAt(
        db,
        ids,
        keep.end,
        new Map(
            [...keep.spots].map(([m, p]): [number, [number, number]] => [
                m,
                [p.x, p.y],
            ]),
        ),
    );
    if (!form)
        return {
            form: null,
            formWhy: translateTimelineText(rippleRefusal.notAForm()),
        };
    const line = keep.line;
    const problem = rippleFormProblem(
        form.spots,
        line
            ? line.order.map((m) => [
                  line.starts.get(m)!.x,
                  line.starts.get(m)!.y,
              ])
            : [],
    );
    return problem
        ? { form: null, formWhy: translateTimelineText(problem) }
        : { form, formWhy: null };
}

/**
 * Opens the Follow tool on the selected marchers `ids`: their ends pulse, ready to drag a trail
 * out of one. `beat` is the playhead, whose move Keep end spots follows into. Resolves to why not
 * (translated), or null when it opened.
 */
export async function openFollowTool(
    resolver: Pick<Resolver, "positionAt">,
    ids: readonly number[],
    drills: ReadonlyMap<number, string>,
    beat: number,
): Promise<string | null> {
    const window = followWindowNow();
    if (!window) return translateTimelineText(trailDragRefusal.noWindow());
    const field = currentShapeField();
    if (!field) return null;
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    const starts = sorted.map((m): [number, number] => {
        const [x, y] = resolver.positionAt(m, window.start);
        return [x, y];
    });
    // The order the show remembers for them, or else the one their positions suggest (step 4f)
    const along = await followOrderAt(db, sorted, window.start, starts);
    if (!along) return translateTimelineText(trailDragRefusal.notFitted());
    // Tail first, so the leader offered before an end is grabbed is the real one (the last)
    const order = tailFirstOf(along).map((i) => sorted[i]!);
    // Said before drawing starts, so no drawing is lost (AP-T8's refusals)
    const refusal = await db.transaction((tx) =>
        trailDragRefusalFor(tx, window, sorted, order.at(-1)!, "trail"),
    );
    if (refusal) return translateTimelineText(refusal);
    const keep = await followKeepAt(db, resolver, sorted, beat);
    // Ripple in (step 9, RP-2): the form those end spots make, in its own order, and why not
    const { form, formWhy } = await followFormOf(sorted, keep);
    const at = new Map<number, XY>(
        sorted.map((m, i) => [m, { x: starts[i]![0], y: starts[i]![1] }]),
    );
    const follow: FollowDrag = {
        window,
        ids: sorted,
        order,
        starts: at,
        grabbed: null,
        spacing: { kind: "keep" },
        ends: "trail",
        keep,
        form,
        formWhy,
        step: field.fieldProperties.pixelsPerStep,
    };
    const members = order.map((m) => ({
        marcherId: m,
        drill: drills.get(m) ?? `${m}`,
        from: at.get(m)!,
        to: at.get(m)!,
    }));
    const leader = members.at(-1)!;
    const target: PathTarget = {
        timelineId: -1,
        transitionId: -1,
        marcherId: leader.marcherId,
        start: window.start,
        end: window.end,
        from: leader.from,
        to: leader.from,
        routeId: null,
        points: [],
        ends: null,
        group: null,
        trail: { members, leaderId: leader.marcherId, reverse: false },
    };
    usePathPenStore.setState({
        session: {
            phase: "drawing",
            target,
            drill: `${sorted.length}`,
            points: [],
            pointer: null,
            selected: null,
            dragging: null,
            object: false,
            byRoute: false,
            follow,
        },
    });
    return null;
}
