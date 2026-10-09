import { snapEdgeBeat, stepOffForbidden } from "./timelineEdgeSnap";
import clsx from "clsx";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    memo,
    useEffect,
    useRef,
} from "react";
import { beatToX, clamp, isPageSnapDisabled } from "./TimelineGeometry";
import type {
    BeatPosition,
    TimelineBeatRange,
    TimelinePageFlagLimits,
    TimelinePageFlagMove,
    TimelinePageMarker,
} from "./TimelineViewModel";

/**
 * Page flag grips (docs/timeline/research/move-page-flag): dragging one moves that page's flag, a
 * roll edit where the page gains what the next one loses. Beats here are view beats.
 *
 * - **Where it's grabbed** (case 13): the page line through the whole page-box row, 12px wide
 *   (less on a narrow box, `gripWidth`). Below the row the line isn't a grip.
 * - **Click or drag:** a press that moves less than `FLAG_DRAG_PX` is a click and selects the page
 *   box on that side of the flag, as a click on the box does. A drag shows the flag, the two boxes
 *   and their counts where it would land, and writes once, on release.
 * - **Limits** (cases 1, 4, 6, 9, 10): the flag stops at the beats `pageFlagMove.limits` allows,
 *   asked when the drag starts; until they arrive, at the neighboring flags. It passes over a hole
 *   (a beat it can't land on) and lands just before it. The readout names what stops it.
 * - **Snapping** (case 12; UI-15's edge rule, without page lines, `flagSnapBeat`): the playhead
 *   within 12px, the measures' downbeats within 6px, else whole beats. Alt turns that off.
 * - **Cancel** (cases 19, 20): Esc, a cancelled pointer or a lost capture put it back and write
 *   nothing; so does a drag released where it started.
 * - **Keys** (case 18): ← and → move a focused grip one beat, as one edit each.
 */

/**
 * Where a dragged flag lands for a pointer at `beat`: UI-15's edge rule without page lines. A flag
 * stops a count short of every other flag (case 1), so a page line would only pull it toward a
 * beat it can't take, and zoomed out the clamp would then leave counts next to a neighbor
 * unreachable. Its own line would snap it back. So the playhead within 12px, the measures'
 * downbeats within 6px, else a whole beat; Alt keeps only the whole beat.
 */
export function flagSnapBeat({
    beat,
    downbeats,
    playheadBeat,
    pixelsPerBeat,
    snapDisabled,
    from,
}: {
    beat: number;
    /** The flag's beat before the drag: never a snap target */
    from?: number;
    /** The measures' downbeats only, not the page lines */
    downbeats: readonly number[];
    playheadBeat: number | null;
    pixelsPerBeat: number;
    snapDisabled: boolean;
}): number {
    return snapEdgeBeat({
        beat,
        pageBeats: [],
        downbeats,
        playheadBeat,
        pixelsPerBeat,
        snapDisabled,
        from,
    });
}

/** How far, in pixels, a press on a grip must move to drag the flag */
export const FLAG_DRAG_PX = 4;
/** The grip's widest, in pixels; narrow boxes get a narrower one (`gripWidth`) */
const GRIP_WIDTH = 12;
/**
 * The grip is the page line through the whole 28px page-box row (owner, 2026-10-08: "just the line
 * at the top in the page boxes"), above the playhead's head and the start pennant there; those are
 * grabbed in the measure row, and a page box's click puts the playhead on its flag
 */
const GRIP_TOP = 0;
const GRIP_HEIGHT = 28;

/** A flag being dragged: where it would land, and why it stopped there, if it did */
export interface TimelinePageFlagPreview {
    readonly pageId: string | number;
    /** The flag's beat before the drag */
    readonly from: BeatPosition;
    readonly beat: BeatPosition;
    /** What stopped the flag, when the pointer is past where it may go */
    readonly blocked: string | null;
}

/** A page box on the ruler, in show order, with its range (`TimelineRuler`) */
export interface TimelineFlagBox {
    readonly page: TimelinePageMarker;
    readonly range: TimelineBeatRange | null;
}

/**
 * `pages` with a dragged flag drawn where it would land: its page ends there, and the page after
 * it starts there.
 */
export function previewPagesForFlag(
    pages: readonly TimelinePageMarker[],
    preview: TimelinePageFlagPreview | null,
): readonly TimelinePageMarker[] {
    if (!preview || preview.beat === preview.from) return pages;
    return pages.map((page) =>
        page.id === preview.pageId
            ? { ...page, endBeat: preview.beat }
            : !page.isInitial && page.atBeat === preview.from
              ? { ...page, atBeat: preview.beat }
              : page,
    );
}

/** The neighbors' limits, used until `pageFlagMove.limits` answers */
const neighborLimits = (
    boxes: readonly TimelineFlagBox[],
    index: number,
    beatCount: number,
    homeLabel: string | undefined,
): TimelinePageFlagLimits | null => {
    const box = boxes[index];
    if (!box?.range) return null;
    const next = boxes[index + 1];
    const previous = boxes[index - 1];
    return {
        flag: box.range.endBeatIndex,
        min: box.range.startBeatIndex + 1,
        max: next?.range ? next.range.endBeatIndex - 1 : beatCount,
        minReason: previous
            ? `Page ${previous.page.label}'s flag`
            : homeLabel
              ? `Page ${homeLabel}'s flag`
              : "The start of the show",
        maxReason: next
            ? `Page ${next.page.label}'s flag`
            : "The end of the show",
    };
};

/**
 * A landing on a hole (a beat the flag passes over but can't land on) moves back toward where the
 * flag started, to the nearest beat it can land on, and says why.
 */
const landOutsideHoles = (
    limits: TimelinePageFlagLimits,
    preview: TimelinePageFlagPreview,
): TimelinePageFlagPreview => {
    const holes = limits.holes ?? [];
    const hole = holes.find((h) => h.beat === preview.beat);
    if (!hole) return preview;
    const beat = stepOffForbidden(
        preview.beat,
        preview.from,
        new Set(holes.map((h) => h.beat)),
    );
    return { ...preview, beat, blocked: hole.reason };
};

const counts = (range: TimelineBeatRange | null) =>
    range ? range.endBeatIndex - range.startBeatIndex : 0;

/**
 * A grip's width: 12px, but at most a third of the narrower box beside it (at least 4px), so
 * zoomed out a press on a box still mostly scrubs or selects it instead of grabbing a flag
 */
const gripWidth = (
    left: TimelineBeatRange,
    right: TimelineBeatRange | null,
    pixelsPerBeat: number,
) => {
    const narrowest = Math.min(counts(left), right ? counts(right) : Infinity);
    return Math.max(
        4,
        Math.min(GRIP_WIDTH, Math.floor((narrowest * pixelsPerBeat) / 3)),
    );
};

const countsText = (n: number) => (n === 1 ? "1 count" : `${n} counts`);

/**
 * What the drag readout says: each page's counts, before and after ("Page 2: 8 → 10 counts"), and
 * what stopped the flag.
 */
export function describeFlagPreview(
    boxes: readonly TimelineFlagBox[],
    preview: TimelinePageFlagPreview,
): { pages: string[]; blocked: string | null } {
    const index = boxes.findIndex((b) => b.page.id === preview.pageId);
    const box = boxes[index];
    const next = boxes[index + 1];
    const delta = preview.beat - preview.from;
    const pages: string[] = [];
    if (box) {
        const before = counts(box.range);
        pages.push(
            `Page ${box.page.label}: ${before} → ${countsText(before + delta)}`,
        );
    }
    if (next) {
        const before = counts(next.range);
        pages.push(
            `Page ${next.page.label}: ${before} → ${countsText(before - delta)}`,
        );
    }
    return { pages, blocked: preview.blocked };
}

export const TimelinePageFlagGrips = memo(function TimelinePageFlagGrips({
    boxes,
    homeLabel,
    beatCount,
    pixelsPerBeat,
    height,
    snapBeats,
    snapPlayhead,
    pageFlagMove,
    preview,
    onPreviewChange,
    onSelectPage,
}: {
    /** The page boxes as they are, without the preview */
    boxes: readonly TimelineFlagBox[];
    /** Home's page label, for "Page 0's flag" */
    homeLabel: string | undefined;
    beatCount: number;
    pixelsPerBeat: number;
    /** The timeline's height, for the dragged flag's line */
    height: number;
    /** The measures' downbeats (not the page lines): where a dragged flag lands when near */
    snapBeats: readonly number[];
    /** The playhead, which a dragged flag lands on when near too */
    snapPlayhead?: () => BeatPosition;
    pageFlagMove: TimelinePageFlagMove;
    preview: TimelinePageFlagPreview | null;
    onPreviewChange: (preview: TimelinePageFlagPreview | null) => void;
    onSelectPage: (page: TimelinePageMarker) => void;
}) {
    const drag = useRef<{
        pointerId: number;
        pageId: string | number;
        index: number;
        startClientX: number;
        surface: Element;
        /** The playhead when the drag started, which the flag lands on when near */
        playhead: number | null;
        moved: boolean;
        limits: TimelinePageFlagLimits;
        /** Set once `pageFlagMove.limits` answers */
        checked: boolean;
        last: TimelinePageFlagPreview;
    } | null>(null);
    const keySteps = useRef<Promise<void>>(Promise.resolve());
    // A drag that ends unmounted (the grips hide when playback starts) writes nothing
    useEffect(
        () => () => {
            drag.current = null;
        },
        [],
    );

    const landing = (
        clientX: number,
        altKey: boolean,
    ): TimelinePageFlagPreview | null => {
        const current = drag.current;
        if (!current) return null;
        const left = current.surface.getBoundingClientRect().left;
        const raw = clamp((clientX - left) / pixelsPerBeat, 0, beatCount);
        // The edge rule (UI-15): page lines and the playhead within 12px, downbeats within 6px
        const snapped = flagSnapBeat({
            beat: raw,
            downbeats: snapBeats,
            playheadBeat: current.playhead,
            pixelsPerBeat,
            snapDisabled: isPageSnapDisabled({ altKey }),
            from: current.limits.flag,
        });
        const { min, max, minReason, maxReason } = current.limits;
        return landOutsideHoles(current.limits, {
            pageId: current.pageId,
            from: current.limits.flag,
            beat: clamp(snapped, min, max),
            blocked:
                snapped < min ? minReason : snapped > max ? maxReason : null,
        });
    };

    const cancel = (element?: Element | null) => {
        const current = drag.current;
        if (!current) return false;
        drag.current = null;
        if (element?.hasPointerCapture?.(current.pointerId))
            element.releasePointerCapture(current.pointerId);
        onPreviewChange(null);
        return true;
    };

    const onPointerDown = (
        event: ReactPointerEvent<HTMLElement>,
        index: number,
    ) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
        // The press is the grip's: no scrub, no range
        event.stopPropagation();
        const box = boxes[index];
        const limits = neighborLimits(boxes, index, beatCount, homeLabel);
        const surface = event.currentTarget.closest(
            '[data-testid="timeline-pointer-surface"]',
        );
        if (!box || !limits || !surface) return;
        const started: NonNullable<typeof drag.current> = {
            pointerId: event.pointerId,
            pageId: box.page.id,
            index,
            startClientX: event.clientX,
            surface,
            playhead: snapPlayhead ? Math.round(snapPlayhead()) : null,
            moved: false,
            limits,
            checked: false,
            last: {
                pageId: box.page.id,
                from: limits.flag,
                beat: limits.flag,
                blocked: null,
            },
        };
        drag.current = started;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        void pageFlagMove.limits(box.page.id).then(
            (checked) => {
                if (drag.current !== started) return;
                if (!checked) {
                    // The flag can't move after all (say, the show changed under the press)
                    drag.current = null;
                    onPreviewChange(null);
                    return;
                }
                started.limits = checked;
                started.checked = true;
                if (!started.moved) return;
                const beat = clamp(started.last.beat, checked.min, checked.max);
                started.last = landOutsideHoles(checked, {
                    ...started.last,
                    beat,
                    blocked:
                        beat !== started.last.beat
                            ? beat < started.last.beat
                                ? checked.maxReason
                                : checked.minReason
                            : started.last.blocked,
                });
                onPreviewChange(started.last);
            },
            () => {
                if (drag.current === started) cancel();
            },
        );
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (
            !current.moved &&
            Math.abs(event.clientX - current.startClientX) < FLAG_DRAG_PX
        )
            return;
        current.moved = true;
        const next = landing(event.clientX, event.altKey);
        if (
            !next ||
            (next.beat === current.last.beat &&
                next.blocked === current.last.blocked &&
                preview !== null)
        )
            return;
        current.last = next;
        onPreviewChange(next);
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const element = event.currentTarget;
        if (current.moved) {
            const next = landing(event.clientX, event.altKey) ?? current.last;
            cancel(element);
            // A drop where it started writes nothing (case 20)
            if (next.beat === next.from) return;
            // The flag stays drawn where it was dropped until the pages reload, so it doesn't
            // jump back for a moment. A drop before the limits answered keeps to the neighbors,
            // and the write refuses anything else with a toast.
            const settling = { ...next, blocked: null };
            onPreviewChange(settling);
            void Promise.resolve(
                pageFlagMove.commit(current.pageId, next.beat),
            ).finally(() => {
                if (!drag.current) onPreviewChange(null);
            });
            return;
        }
        cancel(element);
        // A click: the box on the side of the flag that was pressed
        const box = boxes[current.index];
        const after = boxes[current.index + 1];
        const flagX =
            element.getBoundingClientRect().left +
            element.getBoundingClientRect().width / 2;
        onSelectPage(event.clientX >= flagX && after ? after.page : box!.page);
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
        // The arrow moves the flag, not the selected marchers (the window's nudge keys)
        event.preventDefault();
        event.stopPropagation();
        if (drag.current) return;
        const box = boxes[index];
        if (!box) return;
        // One press at a time, each from where the last one left the flag
        keySteps.current = keySteps.current
            .then(() => pageFlagMove.limits(box.page.id))
            .then((limits) => {
                if (!limits) return;
                // A hole is stepped over, as a drag passes over it
                const holeBeats = new Set(limits.holes?.map((h) => h.beat));
                let beat = limits.flag + delta;
                while (holeBeats.has(beat)) beat += delta;
                if (beat < limits.min || beat > limits.max) return;
                return pageFlagMove.commit(box.page.id, beat);
            })
            .catch(() => {});
    };

    const shownPreview =
        preview && preview.beat !== preview.from ? preview : null;
    const readout = preview ? describeFlagPreview(boxes, preview) : null;
    return (
        <>
            {boxes.map(({ page, range }, index) => {
                if (!range) return null;
                const dragging = preview?.pageId === page.id;
                const beat = dragging ? preview.beat : range.endBeatIndex;
                return (
                    <button
                        key={page.id}
                        type="button"
                        data-testid="timeline-page-flag-grip"
                        data-page-id={page.id}
                        data-timeline-interactive="true"
                        // Its arrow keys move the flag, not the selected marchers (UI-14's marker)
                        data-timeline-own-keys="true"
                        aria-label={`Page ${page.label}'s flag, after ${countsText(counts(range))}. Drag, or use the arrow keys, to move it`}
                        title={`Page ${page.label}'s flag: drag to move it. Page ${page.label} gains what the next page loses; other flags stay.`}
                        onPointerDown={(event) => onPointerDown(event, index)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={(event) => cancel(event.currentTarget)}
                        onLostPointerCapture={() => {
                            if (drag.current) cancel();
                        }}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        // The click is the pointer's (`onPointerUp`); a keyboard Enter selects too
                        onClick={(event) => {
                            if (event.detail === 0) onSelectPage(page);
                        }}
                        // `!`: the shared `button { cursor: pointer }` sits outside any CSS layer, so it beats any
                        // cursor utility on a button without it
                        className="group focus-visible:ring-accent pointer-events-auto absolute z-[56] -translate-x-1/2 cursor-ew-resize! touch-none border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2"
                        style={{
                            width: gripWidth(
                                range,
                                boxes[index + 1]?.range ?? null,
                                pixelsPerBeat,
                            ),
                            left: Math.round(beatToX(beat, pixelsPerBeat)),
                            top: GRIP_TOP,
                            height: GRIP_HEIGHT,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                "bg-text absolute inset-y-[3px] left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-opacity",
                                dragging
                                    ? "opacity-90"
                                    : "opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70",
                            )}
                        />
                    </button>
                );
            })}
            {shownPreview && (
                <span
                    aria-hidden="true"
                    data-testid="timeline-page-flag-drag-line"
                    className={clsx(
                        "pointer-events-none absolute top-0 z-[57] w-px",
                        shownPreview.blocked ? "bg-red" : "bg-text",
                    )}
                    style={{
                        left: Math.round(
                            beatToX(shownPreview.beat, pixelsPerBeat),
                        ),
                        height,
                    }}
                />
            )}
            {preview && readout && drag.current?.moved && (
                <div
                    role="status"
                    data-testid="timeline-page-flag-readout"
                    className="bg-bg-1 border-stroke rounded-6 text-text pointer-events-none absolute top-30 z-[60] flex flex-col gap-2 border px-6 py-4 font-mono text-[11px] leading-tight whitespace-nowrap shadow-sm"
                    style={{
                        left:
                            Math.round(beatToX(preview.beat, pixelsPerBeat)) +
                            8,
                    }}
                >
                    {readout.pages.map((line) => (
                        <span key={line}>{line}</span>
                    ))}
                    {readout.blocked && (
                        <span className="text-red">{readout.blocked}</span>
                    )}
                </div>
            )}
        </>
    );
});
