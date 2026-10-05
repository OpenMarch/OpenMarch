import { useEffect, useMemo, useState } from "react";
import { eq } from "drizzle-orm";
import type { FieldTheme } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { withTimelineWriteLock } from "@/db-functions/history";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    isolatedTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { getTimelineHost, useTimelineResolverStore } from "./timelineStore";
import { TIMELINE_TRACK_COLORS } from "./timelineViewModel";
import {
    buildFocusScene,
    planResolver,
    type FocusMemberSlot,
    type FocusScene,
} from "./timelineFocusScene";
import {
    useIsolationPlanStore,
    type IsolationPlan,
} from "./timelineIsolationPlan";

export interface FocusRows {
    readonly timelineId: number;
    /** Every assignment row in the timeline */
    readonly members: readonly FocusMemberSlot[];
    readonly timelineOfTransition: ReadonlyMap<number, number>;
}

/** The isolated timeline's member rows and every transition's timeline. */
export async function readFocusRows(
    db: DbConnection | DbTransaction,
    timelineId: number,
): Promise<FocusRows> {
    const t = schema.timeline_transitions;
    const a = schema.timeline_assignments;
    const transitions = await db
        .select({ id: t.id, timelineId: t.timeline_id })
        .from(t)
        .all();
    const rows = await db
        .select({
            marcherId: a.marcher_id,
            transitionId: a.transition_id,
            slot: a.slot_index,
            start: a.start_beat,
            end: a.end_beat,
            layer: a.layer,
        })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(eq(t.timeline_id, timelineId))
        .all();
    return {
        timelineId,
        members: rows.sort(
            (x, y) => x.marcherId - y.marcherId || x.start - y.start,
        ),
        timelineOfTransition: new Map(
            transitions.map((r) => [r.id, r.timelineId]),
        ),
    };
}

/**
 * The ghost gray for a field: darker on a light field, lighter on a dark one (07 §2), so it reads
 * against the field rather than the app's theme.
 */
export function ghostColorFor(theme: Pick<FieldTheme, "background">): string {
    const { r, g, b } = theme.background;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.5 ? "#6f6f6f" : "#c4c4c4";
}

/** A timeline's color as the strip draws it: by start order over every timeline. */
const stripColors = (timelines: readonly { readonly id: number }[]) => {
    const index = new Map(timelines.map((t, i) => [t.id, i]));
    return (id: number) =>
        TIMELINE_TRACK_COLORS[
            (index.get(id) ?? 0) % TIMELINE_TRACK_COLORS.length
        ];
};

/** Publishes the plan, so the static render and the coordinate tools draw and edit at it. */
function usePublishIsolationPlan(plan: IsolationPlan | null): void {
    const setPlan = useIsolationPlanStore((s) => s.set);
    useEffect(() => setPlan(plan), [plan, setPlan]);
    useEffect(() => () => setPlan(null), [setPlan]);
}

/**
 * The selected marchers, or null with none: with a selection, the others' paths step back (a
 * page-wide move draws every member).
 */
function useSelectionEmphasis(): ReadonlySet<number> | null {
    const selectedKey = (useSelectedMarchers()?.selectedMarchers ?? [])
        .map((m) => m.id)
        .join(",");
    return useMemo(
        () =>
            selectedKey === ""
                ? null
                : new Set(selectedKey.split(",").map(Number)),
        [selectedKey],
    );
}

/**
 * Draws the isolated timeline's scene (docs/timeline/research/ownership/09-isolation.md): its
 * members' paths, gray ghosts for the parts of the move they no longer perform, the moves they
 * leave for, and their start and end dots. Publishes the timeline's plan
 * (`useIsolationPlanStore`), so while paused the members are drawn and edited where it puts them.
 * Clears both when nothing is isolated or `enabled` is false. The scene stays while playing, so a
 * loop over the move shows the ghosts against the moving dots.
 */
export function useTimelineFocusRender({
    canvas,
    database,
    enabled,
    theme,
}: {
    canvas: OpenMarchCanvas | null;
    database: DbConnection;
    enabled: boolean;
    theme: Pick<FieldTheme, "background"> | undefined;
}): FocusScene | null {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const timeline = useTimelineSelectionStore(isolatedTimeline);
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const [rows, setRows] = useState<FocusRows | null>(null);
    const emphasis = useSelectionEmphasis();

    const timelineId = enabled ? (timeline?.id ?? null) : null;
    useEffect(() => {
        if (timelineId === null) {
            setRows(null);
            return;
        }
        let current = true;
        withTimelineWriteLock(() => readFocusRows(database, timelineId)).then(
            (next) => {
                if (current) setRows(next);
            },
            (error: unknown) =>
                console.error("Couldn't read the isolated timeline", error),
        );
        return () => {
            current = false;
        };
    }, [database, timelineId, version]);

    const built = useMemo(() => {
        const host = getTimelineHost();
        if (
            !timeline ||
            !resolver ||
            !host ||
            !rows ||
            rows.timelineId !== timeline.id ||
            !storedTimelines
        )
            return null;
        const colorOf = stripColors(storedTimelines);
        const input = {
            resolver,
            timeline,
            members: rows.members,
            snapshot: host.snapshot,
            timelineOfTransition: rows.timelineOfTransition,
            colorOf,
        };
        const plan = planResolver(input);
        return {
            scene: buildFocusScene({ ...input, plan }),
            plan: plan && {
                timelineId: timeline.id,
                plan,
                members: new Set(rows.members.map((m) => m.marcherId)),
            },
        };
        // `version` changes whenever the resolver's answers may have
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeline, resolver, version, rows, storedTimelines]);

    const scene = built?.scene ?? null;
    usePublishIsolationPlan(built?.plan ?? null);

    useEffect(() => {
        if (!canvas) return;
        if (!scene || !theme) {
            canvas.clearTimelineFocus();
            return;
        }
        canvas.renderTimelineFocus(scene, ghostColorFor(theme), emphasis);
    }, [canvas, scene, theme, emphasis]);

    useEffect(() => () => canvas?.clearTimelineFocus(), [canvas]);
    return scene;
}
