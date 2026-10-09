import {
    memo,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import clsx from "clsx";
import { START_INK } from "./startFlagInk";
import { beatToX } from "./TimelineGeometry";
import type { TimelineBeatRange } from "./TimelineViewModel";

/** Snaps a dragged loop end to the nearest snap beat within this many pixels */
const SNAP_PX = 8;

/**
 * The loop (UI-17): its own region, drawn as a bar along the ruler's top edge in the start flag's
 * color, as Logic draws its cycle region. Each end is a handle: drag it to move that end, snapping
 * to page lines and downbeats (Alt turns snapping off), or focus it and use the arrow keys. The
 * handles sit above the page flag's grip in the ruler's top strip, so they never move a page.
 * Moving the playhead never changes the loop; the owner of `loop` moves it on page navigation.
 */
export const TimelineLoopBar = memo(function TimelineLoopBar({
    loop,
    beatCount,
    pixelsPerBeat,
    snapBeats = [],
    onChange,
}: {
    /** The loop, in view beats */
    loop: TimelineBeatRange;
    beatCount: number;
    pixelsPerBeat: number;
    /** Page lines and downbeats an end snaps to */
    snapBeats?: readonly number[];
    /** A dragged or stepped end's new loop, in view beats; without it the bar is drawn only */
    onChange?: (loop: TimelineBeatRange) => void;
}) {
    // The loop while an end is dragged, drawn before it's committed
    const [preview, setPreview] = useState<TimelineBeatRange | null>(null);
    const drag = useRef<{
        edge: "start" | "end";
        pointerId: number;
        surface: Element;
    } | null>(null);
    useEffect(() => setPreview(null), [loop.startBeatIndex, loop.endBeatIndex]);
    const shown = preview ?? loop;
    const startX = Math.round(beatToX(shown.startBeatIndex, pixelsPerBeat));
    const endX = Math.round(beatToX(shown.endBeatIndex, pixelsPerBeat));

    const moved = (
        edge: "start" | "end",
        beat: number,
        from: TimelineBeatRange,
    ): TimelineBeatRange =>
        edge === "start"
            ? {
                  startBeatIndex: Math.max(
                      0,
                      Math.min(beat, from.endBeatIndex - 1),
                  ),
                  endBeatIndex: from.endBeatIndex,
              }
            : {
                  startBeatIndex: from.startBeatIndex,
                  endBeatIndex: Math.min(
                      beatCount,
                      Math.max(beat, from.startBeatIndex + 1),
                  ),
              };
    const beatAt = (clientX: number, surface: Element, altKey: boolean) => {
        const raw =
            (clientX - surface.getBoundingClientRect().left) / pixelsPerBeat;
        if (!altKey) {
            let best: number | null = null;
            for (const beat of snapBeats)
                if (
                    Math.abs(beat - raw) * pixelsPerBeat <= SNAP_PX &&
                    (best === null ||
                        Math.abs(beat - raw) < Math.abs(best - raw))
                )
                    best = beat;
            if (best !== null) return best;
        }
        return Math.round(raw);
    };

    const handle = (edge: "start" | "end") => {
        const beat =
            edge === "start" ? shown.startBeatIndex : shown.endBeatIndex;
        return (
            <button
                type="button"
                data-timeline-interactive="true"
                data-testid={`timeline-loop-${edge}`}
                aria-label={`Loop ${edge}, beat ${beat}`}
                title="Drag to move this end of the loop"
                disabled={!onChange}
                onPointerDown={(
                    event: ReactPointerEvent<HTMLButtonElement>,
                ) => {
                    if (!onChange || event.button !== 0) return;
                    event.stopPropagation();
                    const surface = event.currentTarget.parentElement;
                    if (!surface) return;
                    drag.current = {
                        edge,
                        pointerId: event.pointerId,
                        surface,
                    };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                    const current = drag.current;
                    if (!current || current.pointerId !== event.pointerId)
                        return;
                    setPreview(
                        moved(
                            current.edge,
                            beatAt(
                                event.clientX,
                                current.surface,
                                event.altKey,
                            ),
                            loop,
                        ),
                    );
                }}
                onPointerUp={(event) => {
                    const current = drag.current;
                    if (!current || current.pointerId !== event.pointerId)
                        return;
                    drag.current = null;
                    event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                    );
                    const next = moved(
                        current.edge,
                        beatAt(event.clientX, current.surface, event.altKey),
                        loop,
                    );
                    if (
                        next.startBeatIndex !== loop.startBeatIndex ||
                        next.endBeatIndex !== loop.endBeatIndex
                    )
                        onChange?.(next);
                    else setPreview(null);
                }}
                onLostPointerCapture={() => {
                    if (!drag.current) return;
                    drag.current = null;
                    setPreview(null);
                }}
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                    const delta =
                        event.key === "ArrowLeft"
                            ? -1
                            : event.key === "ArrowRight"
                              ? 1
                              : 0;
                    if (delta === 0 || !onChange) return;
                    event.preventDefault();
                    // The arrow moves this end, not the selected marchers
                    event.stopPropagation();
                    onChange(moved(edge, beat + delta, loop));
                }}
                className="group focus-visible:ring-accent pointer-events-auto absolute top-0 z-[58] h-12 w-12 -translate-x-1/2 touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2 enabled:cursor-ew-resize!"
                style={{ left: edge === "start" ? startX : endX }}
            >
                {/* At rest the bar's rounded end is the handle; hovered or focused, a knob shows */}
                <span
                    aria-hidden="true"
                    className={clsx(
                        "absolute top-0 left-1/2 size-8 -translate-x-1/2 rounded-full opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100",
                        START_INK.bg,
                    )}
                />
            </button>
        );
    };

    return (
        <div
            data-testid="timeline-loop-region"
            className="pointer-events-none absolute inset-0"
        >
            <span
                data-testid="timeline-loop-bar"
                aria-hidden="true"
                className={clsx(
                    "absolute top-px z-40 h-4 rounded-full",
                    START_INK.bg,
                )}
                style={{ left: startX, width: Math.max(endX - startX, 4) }}
            />
            {handle("start")}
            {handle("end")}
        </div>
    );
});
