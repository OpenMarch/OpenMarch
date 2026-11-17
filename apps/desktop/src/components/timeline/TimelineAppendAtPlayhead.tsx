import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PlusIcon } from "@phosphor-icons/react";
import { beatToX, TIMELINE_PAGE_ROW_TOP } from "./TimelineGeometry";
import { useScrubFollow } from "./TimelinePrimitives";
import type { TimelineLiveValue } from "./timelineLiveValue";
import type { TimelineAppendAtPlayhead as AppendAtPlayhead } from "./TimelineViewModel";

/**
 * **+ Add N-Count Page** beside the paused playhead past the last page (UI-9, owner 2026-10-20):
 * one click adds the page from the last flag to the playhead. Hovering or focusing it shades that
 * range, unless the window (start flag to playhead) already covers exactly it. With Shift held it
 * reads **+ Add N-Count Subset** and adds the page as a subset. Like the playhead,
 * a scrub carries it along. Where it wouldn't fit before the scroller's visible right edge, it
 * sits on the playhead's left.
 */
export function TimelineAppendAtPlayhead({
    append,
    positionBeat,
    lastFlagBeat,
    pixelsPerBeat,
    height,
    windowShowsPage,
    scrubLine,
}: {
    append: AppendAtPlayhead;
    positionBeat: number;
    /** The last page's flag, where the new page starts (view beats) */
    lastFlagBeat: number;
    pixelsPerBeat: number;
    height: number;
    /** The window already shades the new page's range: the start flag is on the last flag */
    windowShowsPage: boolean;
    scrubLine?: TimelineLiveValue<number | null>;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [previewing, setPreviewing] = useState(false);
    const shift = useShiftHeld();
    const shown = shift && append.subset ? append.subset : append;
    const playheadX = Math.round(beatToX(positionBeat, pixelsPerBeat));
    useScrubFollow(ref, scrubLine, playheadX, pixelsPerBeat);
    // Room for it on the playhead's right, else on its left; scrolling or a new spot re-measures
    const [flipped, setFlipped] = useState(false);
    useLayoutEffect(() => {
        const anchor = ref.current;
        const button = buttonRef.current;
        // The scroller it sits in; found in the DOM, since its ref isn't set yet on the first
        // layout effect (React attaches a parent's ref after its children's layout effects)
        const viewport = anchor?.closest<HTMLElement>(
            "[data-testid=timeline-viewport]",
        );
        if (!viewport || !anchor || !button) return;
        const place = () => {
            const edge = viewport.getBoundingClientRect();
            // Not laid out (no width): leave it on the right
            setFlipped(
                edge.width > 0 &&
                    anchor.getBoundingClientRect().left +
                        8 +
                        button.offsetWidth >
                        edge.right,
            );
        };
        place();
        viewport.addEventListener("scroll", place, { passive: true });
        return () => viewport.removeEventListener("scroll", place);
    }, [playheadX, shown.label]);
    const startX = beatToX(lastFlagBeat, pixelsPerBeat);
    return (
        <>
            {previewing && !windowShowsPage && (
                <div
                    data-testid="timeline-append-preview"
                    aria-hidden="true"
                    className="bg-accent/15 border-accent pointer-events-none absolute z-30 border-x"
                    style={{
                        left: startX,
                        width: Math.max(0, playheadX - startX),
                        top: TIMELINE_PAGE_ROW_TOP,
                        height: Math.max(0, height - TIMELINE_PAGE_ROW_TOP),
                    }}
                />
            )}
            <div
                ref={ref}
                className="pointer-events-none absolute z-[60]"
                style={{ left: playheadX, top: TIMELINE_PAGE_ROW_TOP + 6 }}
            >
                <button
                    ref={buttonRef}
                    type="button"
                    data-testid="timeline-append-at-playhead"
                    data-timeline-interactive="true"
                    data-subset={shown !== append || undefined}
                    aria-label={shown.title}
                    title={shown.title}
                    onPointerDown={(event) => event.stopPropagation()}
                    // The click's own Shift decides, in case a key event was missed
                    onClick={(event) =>
                        (event.shiftKey && append.subset
                            ? append.subset
                            : append
                        ).onAppend()
                    }
                    onPointerEnter={() => setPreviewing(true)}
                    onPointerLeave={() => setPreviewing(false)}
                    onFocus={() => setPreviewing(true)}
                    onBlur={() => setPreviewing(false)}
                    // In the touch layout the button is a 44px-tall finger target centered on
                    // the pill, which stays drawn at 16px (tablet parity, section 3)
                    className={clsx(
                        "group touch:-top-14 touch:h-44 pointer-events-auto absolute top-0 flex h-16 items-center border-0 bg-transparent p-0 outline-hidden",
                        flipped ? "right-8" : "left-8",
                    )}
                >
                    <span className="border-accent text-accent bg-bg-1 group-hover:bg-accent group-hover:text-text-invert group-focus-visible:ring-accent text-micro flex h-16 items-center gap-2 rounded-full border px-6 leading-none font-medium whitespace-nowrap group-focus-visible:ring-2">
                        <PlusIcon size={9} weight="bold" />
                        {shown.label}
                    </span>
                </button>
            </div>
        </>
    );
}

/** Whether Shift is held, from key events anywhere; leaving the window lets go of it */
function useShiftHeld() {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        const read = (event: KeyboardEvent) => setHeld(event.shiftKey);
        const release = () => setHeld(false);
        window.addEventListener("keydown", read);
        window.addEventListener("keyup", read);
        window.addEventListener("blur", release);
        return () => {
            window.removeEventListener("keydown", read);
            window.removeEventListener("keyup", read);
            window.removeEventListener("blur", release);
        };
    }, []);
    return held;
}
