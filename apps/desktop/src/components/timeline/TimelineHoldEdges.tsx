import {
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    memo,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import tolgee from "@/global/singletons/Tolgee";
import { holdTerms } from "@/timeline/holdTerms";
import {
    landHoldEdge,
    type HoldEdgeBlock,
    type HoldEdgeHandle,
} from "@/timeline/holdExtent";
import { snapEdgeBeat } from "./timelineEdgeSnap";
import {
    beatToX,
    clamp,
    getPageCountAt,
    isPageSnapDisabled,
    TIMELINE_PAGE_ROW_BOTTOM,
} from "./TimelineGeometry";
import type { BeatPosition, TimelinePageMarker } from "./TimelineViewModel";

/**
 * The draggable ends of the selected marchers' **Held** bars (holds README decisions 3 and 6; fork
 * #475). The bars stay thin and quiet (#477); each end that can move gets an invisible handle
 * over it, as tall as the bar's hit strip and a little wider than the line, so the thin
 * line is still easy to grab. On hover the cursor turns into the resize arrows and a small knob
 * shows on the edge; while dragging it is in the accent.
 *
 * - **Drag the end** to leave earlier or hold longer, up to the marcher's next move and the show's
 *   end. A hold's start is fixed by what last put the marcher there, so it has no handle.
 *   The limits are worked out with the bars (`holdEdgeHandles`); the bars draw the hold where it
 *   would land while dragging, and two holds that would touch draw as one.
 * - **Snapping** is every dragged edge's rule (`snapEdgeBeat`, UI-15): page lines and the playhead
 *   within 12 px, downbeats within 6 px, else whole counts. Alt keeps only whole counts.
 * - **Esc**, a cancelled pointer or a lost capture put it back and write nothing, as does a drop
 *   where it started. A press that doesn't move is not a drag.
 * - **Keys:** ← and → move a focused handle one count, as one edit each.
 *
 * Above the flag grips on the bar's strip (so at a page flag the grip still takes the rest of the
 * line), under the keyframe diamonds and the playhead lines (z-36 and up). Beats are view beats.
 */

/** How far, in pixels, a press must move to drag the edge */
const DRAG_PX = 4;
/** The handle's hit area (px): a little wider than a count at most zooms, as tall as the strip */
const HANDLE_WIDTH = 10;
const HANDLE_HEIGHT = 10;
/** The knob shown on hover and while dragging (px) */
const KNOB_WIDTH = 4;
const KNOB_HEIGHT = 10;

/** The selection's hold edges on the view axis, and their commands by handle index. */
export interface TimelineHoldEdges {
    readonly handles: readonly HoldEdgeHandle[];
    /** The edge at index `index` as it would land at `beat`, or `null` when the drag ends */
    readonly onPreview: (index: number, beat: number | null) => void;
    /**
     * Writes the edge at index `index` at `beat`, on release; `from`, when given, is where the edge
     * is now if the handle hasn't caught up yet (a step queued behind another)
     */
    readonly onCommit: (
        index: number,
        beat: number,
        from?: number,
    ) => void | Promise<void>;
}

interface Landing {
    readonly beat: number;
    readonly blocked: HoldEdgeBlock | null;
}

/** What stopped a dragged edge, as the readout says it */
function blockWords(block: HoldEdgeBlock): string {
    switch (block) {
        case "minimum":
            return tolgee.t(
                "timeline.holdEdge.blocked.minimum",
                "A hold lasts at least one count",
            );
        case "nextMove":
            return tolgee.t(
                "timeline.holdEdge.blocked.nextMove",
                "Stops at the next move",
            );
        case "showEnd":
            return tolgee.t(
                "timeline.holdEdge.blocked.showEnd",
                "Stops at the end of the show",
            );
    }
}

/**
 * Each handle's identity, which stays the same when its end moves: the marchers and which of
 * their holds' ends it is, left to right. So a stepped handle keeps its element, and
 * with it the keyboard focus.
 */
export function holdEdgeHandleKeys(
    handles: readonly HoldEdgeHandle[],
): string[] {
    const sorted = handles
        .map((handle, index) => ({ handle, index }))
        .sort((a, b) => a.handle.beat - b.handle.beat);
    const seen = new Map<string, number>();
    const keys: string[] = new Array(handles.length);
    for (const { handle, index } of sorted) {
        const group = handle.marcherIds.join(",");
        const nth = seen.get(group) ?? 0;
        seen.set(group, nth + 1);
        keys[index] = `${group}#${nth}`;
    }
    return keys;
}

/** What the readout says while dragging: where the hold now ends, and what stops it. */
export function holdEdgeReadout(
    landing: Landing,
    pages: readonly TimelinePageMarker[],
): { where: string; blocked: string | null } {
    // The end is the hold's last count
    const at = getPageCountAt({ pages }, landing.beat);
    const where = tolgee.t(
        "timeline.holdEdge.readoutEnd",
        "{held} through Page {page}, count {count}",
        { ...holdTerms(), page: at.pageLabel, count: at.count },
    );
    const blocked = landing.blocked ? blockWords(landing.blocked) : null;
    return { where, blocked };
}

export const TimelineHoldEdgeHandles = memo(function TimelineHoldEdgeHandles({
    edges,
    pages,
    beatCount,
    pixelsPerBeat,
    pageBeats,
    downbeats,
    snapPlayhead,
}: {
    edges: TimelineHoldEdges;
    pages: readonly TimelinePageMarker[];
    beatCount: number;
    pixelsPerBeat: number;
    /** The page lines (flags): a dragged edge lands on them when near */
    pageBeats: readonly number[];
    /** The measures' downbeats: a dragged edge lands on them when nearer */
    downbeats: readonly number[];
    /** The playhead, which a dragged edge lands on when near too */
    snapPlayhead?: () => BeatPosition;
}) {
    const drag = useRef<{
        pointerId: number;
        index: number;
        startClientX: number;
        surface: Element;
        playhead: number | null;
        moved: boolean;
        last: Landing;
    } | null>(null);
    /**
     * The handle being dragged (by `keyOf`) and where it would land; `settling` after the drop,
     * until the write and the marks it changed are read, so it doesn't jump back for a moment
     */
    const [dragging, setDragging] = useState<{
        key: string;
        landing: Landing;
        settling?: boolean;
    } | null>(null);
    const keys = useMemo(() => holdEdgeHandleKeys(edges.handles), [edges]);
    const keySteps = useRef<Promise<void>>(Promise.resolve());
    /** Where the last queued arrow step puts its handle (by key), until it is written */
    const keyTarget = useRef<{ key: string; beat: number } | null>(null);
    /** The latest handles, for a queued step that runs after they reloaded */
    const latest = useRef({ edges, keys });
    latest.current = { edges, keys };
    // A drag that ends unmounted (playback started, the selection changed) writes nothing
    useEffect(
        () => () => {
            if (drag.current) edges.onPreview(drag.current.index, null);
            drag.current = null;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- on unmount only
        [],
    );

    const landing = (clientX: number, altKey: boolean): Landing | null => {
        const current = drag.current;
        const handle = current && edges.handles[current.index];
        if (!current || !handle) return null;
        const left = current.surface.getBoundingClientRect().left;
        const raw = clamp((clientX - left) / pixelsPerBeat, 0, beatCount);
        const snapped = snapEdgeBeat({
            beat: raw,
            pageBeats,
            downbeats,
            playheadBeat: current.playhead,
            pixelsPerBeat,
            snapDisabled: isPageSnapDisabled({ altKey }),
            from: handle.beat,
        });
        return landHoldEdge(handle.limits, snapped);
    };

    const cancel = (element?: Element | null) => {
        const current = drag.current;
        if (!current) return false;
        drag.current = null;
        if (element?.hasPointerCapture?.(current.pointerId))
            element.releasePointerCapture(current.pointerId);
        edges.onPreview(current.index, null);
        setDragging(null);
        return true;
    };

    const onPointerDown = (
        event: ReactPointerEvent<HTMLElement>,
        index: number,
    ) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
        // The press is the handle's: no scrub, no page selection
        event.stopPropagation();
        const handle = edges.handles[index];
        const surface = event.currentTarget.closest(
            '[data-testid="timeline-pointer-surface"]',
        );
        if (!handle || !surface) return;
        drag.current = {
            pointerId: event.pointerId,
            index,
            startClientX: event.clientX,
            surface,
            playhead: snapPlayhead ? Math.round(snapPlayhead()) : null,
            moved: false,
            last: { beat: handle.beat, blocked: null },
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (
            !current.moved &&
            Math.abs(event.clientX - current.startClientX) < DRAG_PX
        )
            return;
        const first = !current.moved;
        current.moved = true;
        const next = landing(event.clientX, event.altKey);
        if (
            !next ||
            (!first &&
                next.beat === current.last.beat &&
                next.blocked === current.last.blocked)
        )
            return;
        current.last = next;
        edges.onPreview(current.index, next.beat);
        const handle = edges.handles[current.index];
        if (handle) setDragging({ key: keys[current.index]!, landing: next });
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const element = event.currentTarget;
        const handle = edges.handles[current.index];
        if (!current.moved || !handle) {
            cancel(element);
            return;
        }
        const next = landing(event.clientX, event.altKey) ?? current.last;
        drag.current = null;
        if (element.hasPointerCapture?.(current.pointerId))
            element.releasePointerCapture(current.pointerId);
        // A drop where it started writes nothing
        if (next.beat === handle.beat) {
            setDragging(null);
            edges.onPreview(current.index, null);
            return;
        }
        // The handle and the bars stay where it was dropped until the marks reload
        const settling = {
            key: keys[current.index]!,
            landing: next,
            settling: true,
        };
        setDragging(settling);
        void Promise.resolve(edges.onCommit(current.index, next.beat)).finally(
            () =>
                setDragging((now) =>
                    now?.key === settling.key && now.settling ? null : now,
                ),
        );
    };

    const onKeyDown = (
        event: ReactKeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (event.key === "Escape") {
            if (cancel(event.currentTarget)) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        const delta =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (delta === 0) return;
        // The arrow moves the edge, not the selected marchers (the window's nudge keys)
        event.preventDefault();
        event.stopPropagation();
        if (drag.current) return;
        const handle = edges.handles[index];
        const key = keys[index];
        if (!handle || key === undefined) return;
        // Quick presses add up: each steps from where the one before it puts the edge
        const from =
            keyTarget.current?.key === key
                ? keyTarget.current.beat
                : handle.beat;
        const { beat } = landHoldEdge(handle.limits, from + delta);
        if (beat === from) return;
        const step = { key, beat };
        keyTarget.current = step;
        keySteps.current = keySteps.current
            .then(() => {
                // The handles may have reloaded since the press: find this one again
                const now = latest.current;
                const at = now.keys.indexOf(key);
                if (at < 0) return;
                return now.edges.onCommit(at, beat, from);
            })
            .catch(() => {})
            .finally(() => {
                if (keyTarget.current === step) keyTarget.current = null;
            });
    };

    const shown =
        dragging && !dragging.settling
            ? edges.handles[keys.indexOf(dragging.key)]
            : undefined;
    const readout =
        shown && dragging ? holdEdgeReadout(dragging.landing, pages) : null;
    return (
        <>
            {edges.handles.map((handle, index) => {
                const key = keys[index]!;
                const active = dragging?.key === key;
                const beat = active ? dragging.landing.beat : handle.beat;
                const label = tolgee.t(
                    "timeline.holdEdge.endLabel",
                    "End of {held}. Drag to leave earlier or hold longer",
                    holdTerms(),
                );
                return (
                    <button
                        key={key}
                        type="button"
                        data-testid={`timeline-hold-end-${handle.beat}`}
                        data-timeline-interactive="true"
                        data-timeline-own-keys="true"
                        data-dragging={active || undefined}
                        aria-label={label}
                        title={label}
                        onPointerDown={(event) => onPointerDown(event, index)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={(event) => cancel(event.currentTarget)}
                        onLostPointerCapture={() => {
                            if (drag.current) cancel();
                        }}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        // `!`: the shared `button { cursor: pointer }` beats a cursor utility (see the
                        // flag grips). Above the grips (z-35, earlier in the DOM), under the diamonds
                        // (z-36) and the lines
                        className="group focus-visible:ring-accent pointer-events-auto absolute z-[35] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize! touch-none rounded-full border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2"
                        style={{
                            left: Math.round(beatToX(beat, pixelsPerBeat)),
                            top: TIMELINE_PAGE_ROW_BOTTOM,
                            width: HANDLE_WIDTH,
                            height: HANDLE_HEIGHT,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            data-hold-knob=""
                            className={clsx(
                                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity",
                                active
                                    ? "bg-accent opacity-100"
                                    : "bg-text-subtitle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                            )}
                            style={{ width: KNOB_WIDTH, height: KNOB_HEIGHT }}
                        />
                    </button>
                );
            })}
            {dragging && readout && (
                <div
                    role="status"
                    data-testid="timeline-hold-edge-readout"
                    className="bg-bg-1 border-stroke rounded-6 text-text text-sub pointer-events-none absolute z-[60] flex flex-col gap-2 border px-6 py-4 leading-tight whitespace-nowrap shadow-sm"
                    style={{
                        left:
                            Math.round(
                                beatToX(dragging.landing.beat, pixelsPerBeat),
                            ) + 8,
                        top: TIMELINE_PAGE_ROW_BOTTOM + 8,
                    }}
                >
                    <span>{readout.where}</span>
                    {readout.blocked && (
                        <span className="text-text-subtitle">
                            {readout.blocked}
                        </span>
                    )}
                </div>
            )}
        </>
    );
});
