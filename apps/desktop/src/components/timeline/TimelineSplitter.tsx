import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { setLayoutResizing } from "@/global/layoutResize";
import { TimelinePaneStretchContext } from "./timelinePaneStretch";
import {
    MIN_TIMELINE_HEIGHT,
    TIMELINE_SPLIT_KEY_STEP,
    clampTimelineHeight,
    maxTimelineHeight,
} from "./timelineSplit";

/**
 * The timeline pane with a draggable divider on top. With no saved height the pane is as small as
 * it can be and still show every track. Once the divider moves, the pane keeps that height,
 * clamped to the workspace it sits in (its parent): taller than the tracks, the grid fills the
 * extra room; shorter, the tracks scroll. Drag, arrow keys, or double-click (back to fitted).
 *
 * A drag writes the pane's height straight to the DOM, once a frame, and commits it to the store
 * on release: React doesn't render on every pointer move, and the field canvas holds its size
 * until the drag ends (`setLayoutResizing`).
 */
export function TimelineSplitter({ children }: { children: ReactNode }) {
    const saved = useUiSettingsStore((s) => s.uiSettings.timelineHeight);
    const setTimelineHeight = useUiSettingsStore((s) => s.setTimelineHeight);
    const paneRef = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState(Infinity);
    const [measured, setMeasured] = useState(MIN_TIMELINE_HEIGHT);
    // Set on grab and release only, so the surface may fill the pane while it's dragged
    const [dragging, setDragging] = useState(false);
    /** The drag in progress: the pane's fixed bottom edge, where on the divider it was grabbed */
    const drag = useRef<{
        bottom: number;
        grab: number;
        available: number;
        height: number;
        frame: number | null;
    } | null>(null);

    useEffect(() => {
        const pane = paneRef.current;
        const parent = pane?.parentElement;
        if (!pane || !parent) return;
        const measure = () => {
            // The drag owns the pane's height until it ends
            if (drag.current) return;
            setAvailable(parent.clientHeight);
            setMeasured(pane.offsetHeight);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(parent);
        observer.observe(pane);
        return () => {
            observer.disconnect();
            const current = drag.current;
            if (current?.frame != null) cancelAnimationFrame(current.frame);
            if (current) setLayoutResizing(false);
            drag.current = null;
        };
    }, []);

    const height =
        saved === null ? null : clampTimelineHeight(saved, available);
    const shown = height ?? measured;

    /** Shows `next` as the pane's height without rendering */
    const applyHeight = (next: number) => {
        const pane = paneRef.current;
        if (!pane) return;
        pane.style.maxHeight = "";
        pane.style.height = `${next}px`;
        pane.querySelector('[role="separator"]')?.setAttribute(
            "aria-valuenow",
            String(next),
        );
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const pane = paneRef.current;
        if (!pane) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        // Read once: the pane's bottom edge stays put, so the divider follows the pointer
        const bottom = pane.getBoundingClientRect().bottom;
        const parentHeight = pane.parentElement?.clientHeight ?? available;
        drag.current = {
            bottom,
            // Where on the divider it was grabbed, so the pane doesn't jump on the first move
            grab: bottom - event.clientY - shown,
            available: parentHeight,
            height: shown,
            frame: null,
        };
        setLayoutResizing(true);
        setDragging(true);
        applyHeight(shown);
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current) return;
        current.height = clampTimelineHeight(
            current.bottom - event.clientY - current.grab,
            current.available,
        );
        // One write a frame, however often the pointer reports
        if (current.frame !== null) return;
        current.frame = requestAnimationFrame(() => {
            current.frame = null;
            applyHeight(current.height);
        });
    };
    const onPointerUp = () => {
        const current = drag.current;
        if (!current) return;
        if (current.frame !== null) cancelAnimationFrame(current.frame);
        applyHeight(current.height);
        drag.current = null;
        setAvailable(current.available);
        setTimelineHeight(current.height);
        setDragging(false);
        setLayoutResizing(false);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey
            ? TIMELINE_SPLIT_KEY_STEP * 4
            : TIMELINE_SPLIT_KEY_STEP;
        if (event.key === "Home") {
            event.preventDefault();
            setTimelineHeight(null);
            return;
        }
        const next =
            event.key === "ArrowUp"
                ? shown + step
                : event.key === "ArrowDown"
                  ? shown - step
                  : null;
        if (next === null) return;
        event.preventDefault();
        setTimelineHeight(clampTimelineHeight(next, available));
    };

    return (
        <div
            ref={paneRef}
            className="flex min-h-0 shrink-0 flex-col"
            style={
                height === null
                    ? { maxHeight: maxTimelineHeight(available) }
                    : { height }
            }
            data-testid="timeline-pane"
        >
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize timeline"
                aria-valuemin={MIN_TIMELINE_HEIGHT}
                aria-valuenow={shown}
                tabIndex={0}
                data-testid="timeline-splitter"
                className="group -mt-6 flex h-8 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => setTimelineHeight(null)}
                onKeyDown={onKeyDown}
            >
                <div className="bg-stroke group-hover:bg-accent group-focus-visible:bg-accent h-2 w-48 rounded-full transition-colors" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
                <TimelinePaneStretchContext.Provider
                    value={dragging || height !== null}
                >
                    {children}
                </TimelinePaneStretchContext.Provider>
            </div>
        </div>
    );
}
