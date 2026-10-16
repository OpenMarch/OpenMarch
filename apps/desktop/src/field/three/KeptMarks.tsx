import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFrame, useThree } from "@react-three/fiber";
import { TooltipClassName } from "@openmarch/ui";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    KEPT_MARK_BACKING,
    KEPT_MARK_BACKING_EDGE,
    KEPT_MARK_COLOR,
    KEPT_MARK_CORNER,
    KEPT_MARK_GLYPH_SHARE,
    keptMarkAt,
    keptMarkBox,
    LINK_BREAK_PATH,
    type TimelineKeptMark,
} from "@/timeline/timelineKeptMarks";
import {
    KEPT_MARK_TOOLTIP_DELAY,
    useKeptMarks,
    type KeptMarkTooltip,
    type NamedPage,
} from "@/timeline/useKeptMarks";
import type { FieldMarchers } from "./fieldMarchers";
import { useFieldViewStore, type FieldView } from "./fieldView";

/**
 * The kept marks on the field (docs/timeline/ui.md UI-18; fork #201): a broken
 * chain beside each marcher kept on the current page, in an SVG over the
 * canvas, and the tooltip of the mark the pointer rests on. They hide while
 * playing, while a scrub is down and while a move is isolated, and a hidden
 * marcher has no mark.
 *
 * React renders the marks only when they change; {@link KeptMarksPlacer}
 * (inside the Canvas) moves them in its frame hook, from the drawn marchers
 * and the one view store, so the overlay never re-renders per frame.
 */
export function useFieldKeptMarks({
    enabled,
    isPlaying,
    pages,
    pageId,
    marcherIds,
}: {
    enabled: boolean;
    isPlaying: boolean;
    pages: readonly NamedPage[];
    pageId: number | null | undefined;
    marcherIds: readonly number[] | undefined;
}): readonly TimelineKeptMark[] {
    const scrubbing = useTimelineSelectionStore((s) => s.scrubbing);
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    const marks = useKeptMarks(pages, enabled ? pageId : null, marcherIds);
    return enabled && !isPlaying && !scrubbing && !isolating ? marks : NONE;
}

const NONE: readonly TimelineKeptMark[] = [];

/** The marks' SVG elements, by marcher id, for {@link KeptMarksPlacer}. */
export type KeptMarkElements = Map<number, SVGGElement>;

/** The marks drawn over the field, at the dots' positions on the last frame. */
export function KeptMarksOverlay({
    marks,
    elements,
}: {
    marks: readonly TimelineKeptMark[];
    elements: RefObject<KeptMarkElements>;
}) {
    if (marks.length === 0) return null;
    return (
        <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-testid="field-kept-marks"
        >
            {marks.map((mark) => (
                <g
                    key={mark.marcherId}
                    // Hidden until placed
                    visibility="hidden"
                    ref={(element) => {
                        if (element)
                            elements.current?.set(mark.marcherId, element);
                        else elements.current?.delete(mark.marcherId);
                    }}
                >
                    <rect
                        width={1}
                        height={1}
                        rx={KEPT_MARK_CORNER}
                        fill={KEPT_MARK_BACKING}
                        stroke={KEPT_MARK_BACKING_EDGE}
                        className="kept-mark-backing"
                    />
                    <path
                        d={LINK_BREAK_PATH}
                        fill={KEPT_MARK_COLOR}
                        transform={`translate(${(1 - KEPT_MARK_GLYPH_SHARE) / 2} ${
                            (1 - KEPT_MARK_GLYPH_SHARE) / 2
                        }) scale(${KEPT_MARK_GLYPH_SHARE / 256})`}
                    />
                </g>
            ))}
        </svg>
    );
}

/**
 * Inside the Canvas: on each frame where the marchers or the view changed,
 * moves each mark beside its dot (`keptMarkBox`) and hides the marks of
 * hidden marchers.
 */
export function KeptMarksPlacer({
    marks,
    marchers,
    elements,
}: {
    marks: readonly TimelineKeptMark[];
    marchers: FieldMarchers;
    elements: RefObject<KeptMarkElements>;
}) {
    const placed = useRef<{
        marks: readonly TimelineKeptMark[];
        version: number;
        appearanceVersion: number;
        view: FieldView | null;
    }>({ marks: NONE, version: -1, appearanceVersion: -1, view: null });
    const invalidate = useThree((s) => s.invalidate);
    // New marks are placed on the next frame
    useEffect(() => invalidate(), [marks, invalidate]);

    useFrame(() => {
        const view = useFieldViewStore.getState();
        const last = placed.current;
        if (
            last.marks === marks &&
            last.version === marchers.version &&
            last.appearanceVersion === marchers.appearanceVersion &&
            last.view === view
        )
            return;
        placed.current = {
            marks,
            version: marchers.version,
            appearanceVersion: marchers.appearanceVersion,
            view,
        };
        const index = indexOf(marchers);
        for (const mark of marks) {
            const element = elements.current?.get(mark.marcherId);
            if (!element) continue;
            const i = index.get(mark.marcherId);
            if (i === undefined || marchers.hidden[i]) {
                element.setAttribute("visibility", "hidden");
                continue;
            }
            const box = keptMarkBox(
                {
                    x: marchers.positions[i * 2],
                    y: marchers.positions[i * 2 + 1],
                },
                view.zoom,
            );
            const size = box.size * view.zoom;
            element.setAttribute(
                "transform",
                `translate(${view.panX + box.x * view.zoom} ${
                    view.panY + box.y * view.zoom
                }) scale(${size})`,
            );
            // One CSS pixel wide at any size
            element
                .querySelector(".kept-mark-backing")
                ?.setAttribute("stroke-width", String(1 / size));
            element.setAttribute("visibility", "visible");
        }
    });

    return null;
}

/** Each marcher's index in `ids`, rebuilt when the ids change. */
const indexes = new WeakMap<readonly number[], Map<number, number>>();
function indexOf(marchers: FieldMarchers): Map<number, number> {
    let index = indexes.get(marchers.ids);
    if (!index) {
        index = new Map(marchers.ids.map((id, i) => [id, i]));
        indexes.set(marchers.ids, index);
    }
    return index;
}

/**
 * The tooltip of the mark the pointer rests on: after
 * {@link KEPT_MARK_TOOLTIP_DELAY} over a mark or its dot, gone on a press, a
 * move off it, or leaving the field. Listens on `target` (the field's element)
 * while marks show.
 */
export function useKeptMarkTooltip({
    target,
    marks,
    marchers,
}: {
    target: RefObject<HTMLElement | null>;
    marks: readonly TimelineKeptMark[];
    marchers: FieldMarchers;
}): KeptMarkTooltip | null {
    const [tooltip, setTooltip] = useState<KeptMarkTooltip | null>(null);

    useEffect(() => {
        let pending: ReturnType<typeof setTimeout> | null = null;
        const hide = () => {
            if (pending) clearTimeout(pending);
            pending = null;
            setTooltip(null);
        };
        const element = target.current;
        if (!element || marks.length === 0) {
            hide();
            return;
        }
        let over: TimelineKeptMark | null = null;
        const markUnder = (event: PointerEvent): TimelineKeptMark | null => {
            if (event.buttons > 0) return null;
            const view = useFieldViewStore.getState();
            const rect = element.getBoundingClientRect();
            const x = (event.clientX - rect.left - view.panX) / view.zoom;
            const y = (event.clientY - rect.top - view.panY) / view.zoom;
            const index = indexOf(marchers);
            const placed = marks.flatMap((mark) => {
                const i = index.get(mark.marcherId);
                if (i === undefined || marchers.hidden[i]) return [];
                return [
                    {
                        mark,
                        dot: {
                            x: marchers.positions[i * 2],
                            y: marchers.positions[i * 2 + 1],
                        },
                    },
                ];
            });
            return keptMarkAt(placed, x, y, view.zoom);
        };
        const onMove = (event: PointerEvent) => {
            const mark = markUnder(event);
            if (mark === over) return;
            over = mark;
            hide();
            if (!mark) return;
            const { clientX, clientY } = event;
            pending = setTimeout(() => {
                pending = null;
                setTooltip({ text: mark.text, clientX, clientY });
            }, KEPT_MARK_TOOLTIP_DELAY);
        };
        const onLeave = () => {
            over = null;
            hide();
        };
        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerdown", onLeave);
        element.addEventListener("pointerleave", onLeave);
        return () => {
            element.removeEventListener("pointermove", onMove);
            element.removeEventListener("pointerdown", onLeave);
            element.removeEventListener("pointerleave", onLeave);
            hide();
        };
    }, [target, marks, marchers]);

    return tooltip;
}

/** A kept mark's tooltip. */
export function KeptMarkTooltipView({
    tooltip,
}: {
    tooltip: KeptMarkTooltip | null;
}) {
    if (!tooltip) return null;
    return createPortal(
        <div
            role="tooltip"
            data-testid="timeline-kept-mark-tooltip"
            className={`${TooltipClassName} pointer-events-none fixed`}
            style={{ left: tooltip.clientX + 12, top: tooltip.clientY + 16 }}
        >
            <span className="block text-[12px]">{tooltip.text}</span>
        </div>,
        document.body,
    );
}
