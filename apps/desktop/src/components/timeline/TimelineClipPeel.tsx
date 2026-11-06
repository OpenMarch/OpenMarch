import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { toast } from "sonner";
import type { TimelineTrackId } from "./TimelineViewModel";

/**
 * Dragging a move's clip up or down (docs/timeline/ui.md UI-25, _experimental_, V-330 to V-333):
 *
 * - **Drag out:** with marchers selected that are in the move, dragging its clip down into empty
 *   space below it peels them off into a new move (the same edit as **Split N selected into new
 *   move**). A ghost clip under the pointer says "Split 8 marchers".
 * - **Drag to merge:** dragging a clip onto another move's clip, or onto the page box of its page
 *   timeline, merges it there. The target is outlined while the pointer is over it, red with the
 *   reason when the merge is refused ("A marcher is in both moves, …").
 *
 * The drag locks to one axis once it moves: `PEEL_START_PX` up or down and at least twice as far
 * as sideways is this gesture; the sideways drag threshold with more sideways than half the
 * vertical travel is the clip move (re-time) as before; in between it waits. A vertical drag with nothing to split or merge shows nothing
 * and does nothing. Esc, a lost pointer or a release over nothing cancels.
 */

/** A drop target: another move's clip, or a page box. */
export type TimelinePeelTarget<Id = TimelineTrackId> =
    | { readonly trackId: Id }
    | { readonly pageId: string };

/** What a drop would do, as the preview says it; `refused` drops do nothing but say why. */
export interface TimelinePeelVerdict {
    readonly label: string;
    readonly refused?: boolean;
}

/** The app's side of the gesture, by track id inside the timeline. */
export interface TimelineClipPeel<Id = TimelineTrackId> {
    /** Dropping the clip in empty space below it, or `null` when that splits nothing (no members selected) */
    readonly split: (id: Id) => TimelinePeelVerdict | null;
    /** Dropping it on `target`, or `null` when the target takes no merge */
    readonly merge: (
        id: Id,
        target: TimelinePeelTarget<Id>,
    ) => TimelinePeelVerdict | null;
    readonly onSplit: (id: Id) => void;
    readonly onMerge: (id: Id, target: TimelinePeelTarget<Id>) => void;
}

/** How far up or down the pointer goes before a press on a clip is this gesture (V-330). */
export const PEEL_START_PX = 10;
/**
 * How far down from the press the pointer goes, below the clip's bottom edge, before a drop splits
 * (V-331). From the press, not the clip's edge: the timeline is usually fitted to its rows at the
 * bottom of the window (UI-19), so there is little room below the last row.
 */
export const PEEL_SPLIT_PX = 24;

/** Whether a drag that moved `dx`, `dy` so far is a vertical one (the axis lock, V-330). */
export const isVerticalPeel = (dx: number, dy: number): boolean =>
    Math.abs(dy) >= PEEL_START_PX && Math.abs(dy) >= 2 * Math.abs(dx);

interface Rect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

type PeelState =
    | { readonly kind: "none" }
    | {
          readonly kind: "split";
          readonly verdict: TimelinePeelVerdict;
          readonly ghost: Rect;
      }
    | {
          readonly kind: "merge";
          readonly verdict: TimelinePeelVerdict;
          readonly target: TimelinePeelTarget;
          readonly rect: Rect;
      };

const NONE: PeelState = { kind: "none" };

const sameRect = (a: Rect, b: Rect) =>
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height;

const targetKey = (target: TimelinePeelTarget) =>
    "trackId" in target ? `clip:${target.trackId}` : `page:${target.pageId}`;

/** Whether `next` draws what `prev` does (verdicts are cached per drag, so compared by identity). */
const samePeelState = (prev: PeelState, next: PeelState): boolean => {
    if (prev.kind === "none" || next.kind === "none")
        return prev.kind === next.kind;
    if (prev.kind === "split" && next.kind === "split")
        return (
            prev.verdict === next.verdict && sameRect(prev.ghost, next.ghost)
        );
    if (prev.kind === "merge" && next.kind === "merge")
        return (
            prev.verdict === next.verdict &&
            targetKey(prev.target) === targetKey(next.target) &&
            sameRect(prev.rect, next.rect)
        );
    return false;
};

const rectOf = (element: Element): Rect => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The other clip or page box under the pointer, if any. */
function targetAt(
    clientX: number,
    clientY: number,
    own: Element | null,
): { target: TimelinePeelTarget; element: Element } | null {
    const elements =
        typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(clientX, clientY)
            : [];
    for (const element of elements) {
        if (own && (element === own || own.contains(element))) continue;
        const clip = element.closest<HTMLElement>(
            '[data-testid="timeline-clip"]',
        );
        if (clip && clip !== own) {
            const trackId = clip.dataset.timelineRangeTrack;
            if (trackId !== undefined)
                return { target: { trackId }, element: clip };
        }
        const box = element.closest<HTMLElement>("[data-timeline-range-page]");
        if (box?.dataset.timelineRangePage !== undefined)
            return {
                target: { pageId: box.dataset.timelineRangePage },
                element: box,
            };
    }
    return null;
}

/**
 * The gesture for one clip: `move` while the drag is vertical, `commit` on release, `cancel` on
 * Esc or a lost pointer, and `overlay`, the ghost or the target outline, drawn over the page.
 */
export function useClipPeel({
    trackId,
    peel,
    clipRef,
}: {
    trackId: TimelineTrackId;
    peel: TimelineClipPeel | undefined;
    clipRef: { readonly current: HTMLElement | null };
}): {
    readonly active: boolean;
    /** The pointer is at `clientX`, `clientY`; the press was at `pressY` */
    move: (clientX: number, clientY: number, pressY: number) => void;
    commit: () => void;
    cancel: () => void;
    overlay: ReactNode;
} {
    const [state, setState] = useState<PeelState>(NONE);
    const latest = useRef<PeelState>(NONE);
    const [active, setActive] = useState(false);
    // Each target's verdict, worked out once per drag: the selection and the moves can't change
    // while the pointer is held, and the verdicts read every move's label
    const verdicts = useRef(new Map<string, TimelinePeelVerdict | null>());
    const verdictFor = (
        key: string,
        compute: () => TimelinePeelVerdict | null,
    ) => {
        const cache = verdicts.current;
        if (!cache.has(key)) cache.set(key, compute());
        return cache.get(key) ?? null;
    };
    const update = (next: PeelState) => {
        if (samePeelState(latest.current, next)) return;
        latest.current = next;
        setState(next);
    };
    const move = (clientX: number, clientY: number, pressY: number) => {
        if (!peel) return;
        setActive(true);
        const own = clipRef.current;
        const hit = targetAt(clientX, clientY, own);
        if (hit) {
            const target = hit.target;
            const verdict = verdictFor(targetKey(target), () =>
                peel.merge(
                    trackId,
                    "trackId" in target
                        ? { trackId: target.trackId as TimelineTrackId }
                        : target,
                ),
            );
            update(
                verdict
                    ? {
                          kind: "merge",
                          verdict,
                          target: hit.target,
                          rect: rectOf(hit.element),
                      }
                    : NONE,
            );
            return;
        }
        const clip = own ? rectOf(own) : null;
        if (
            clip &&
            clientY > clip.top + clip.height &&
            clientY - pressY >= PEEL_SPLIT_PX
        ) {
            const verdict = verdictFor("split", () => peel.split(trackId));
            const height = Math.max(clip.height, 18);
            update(
                verdict
                    ? {
                          kind: "split",
                          verdict,
                          ghost: {
                              left: clip.left,
                              width: Math.max(clip.width, 24),
                              // Kept on screen when the pointer leaves the window
                              top: Math.min(
                                  clientY - height / 2,
                                  window.innerHeight - height - 4,
                              ),
                              height,
                          },
                      }
                    : NONE,
            );
            return;
        }
        update(NONE);
    };
    const cancel = () => {
        setActive(false);
        verdicts.current.clear();
        update(NONE);
    };
    const commit = () => {
        const done = latest.current;
        cancel();
        if (!peel || done.kind === "none") return;
        if (done.verdict.refused) {
            toast.info(done.verdict.label);
            return;
        }
        if (done.kind === "split") peel.onSplit(trackId);
        else
            peel.onMerge(
                trackId,
                "trackId" in done.target
                    ? { trackId: done.target.trackId as TimelineTrackId }
                    : done.target,
            );
    };
    const overlay =
        active && state.kind !== "none" && typeof document !== "undefined"
            ? createPortal(
                  state.kind === "split" ? (
                      <div
                          data-testid="timeline-peel-ghost"
                          aria-live="polite"
                          className={clsx(
                              "rounded-4 text-sub pointer-events-none fixed z-[60] flex items-center border border-dashed px-6 font-medium whitespace-nowrap shadow-md",
                              state.verdict.refused
                                  ? "border-red bg-bg-1 text-red"
                                  : "border-accent bg-bg-1/90 text-text",
                          )}
                          style={state.ghost}
                      >
                          {state.verdict.label}
                      </div>
                  ) : (
                      <div
                          data-testid="timeline-peel-target"
                          data-refused={state.verdict.refused || undefined}
                          aria-live="polite"
                          className={clsx(
                              "rounded-4 pointer-events-none fixed z-[60] border-2",
                              state.verdict.refused
                                  ? "border-red border-dashed"
                                  : "border-accent bg-accent/10",
                          )}
                          style={state.rect}
                      >
                          <span
                              className={clsx(
                                  "rounded-4 text-sub absolute -top-20 left-0 px-4 whitespace-nowrap shadow-md",
                                  state.verdict.refused
                                      ? "bg-red text-white"
                                      : "bg-accent text-white",
                              )}
                          >
                              {state.verdict.label}
                          </span>
                      </div>
                  ),
                  document.body,
              )
            : null;
    return { active, move, commit, cancel, overlay };
}

/** A drop target by stored timeline id or page id, as `Timeline` takes the gesture. */
export type TimelineMovePeelTarget =
    | { readonly timelineId: number }
    | { readonly pageId: number };

/** `TimelineClipPeel` by stored timeline id (the clip's `linkId`), for `Timeline`'s props. */
export interface TimelineMovePeel {
    readonly split: (timelineId: number) => TimelinePeelVerdict | null;
    readonly merge: (
        timelineId: number,
        target: TimelineMovePeelTarget,
    ) => TimelinePeelVerdict | null;
    readonly onSplit: (timelineId: number) => void;
    readonly onMerge: (
        timelineId: number,
        target: TimelineMovePeelTarget,
    ) => void;
}
