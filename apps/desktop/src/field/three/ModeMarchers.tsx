import { useEffect, useRef, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import type { FieldModeDrawing } from "@/field/editor/fieldEditor";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import { followPreviewProgress } from "@/pathways/followDrag";
import type { FieldMarchers } from "./fieldMarchers";

/**
 * Draws the real marchers where a mode's drawing puts them (`marchersAt`, pathways step 4c): the
 * Follow tool's line at its end spots, full size, or looping its walk with ▶ Preview (DL-16,
 * DL-17). Positions only: nothing is saved, and the marchers go back to where the show has them
 * when the drawing stops naming them. With the system's reduced motion on, the walk isn't played.
 */
export function ModeMarchers({
    editor,
    marchers,
}: {
    editor: {
        subscribe(listener: () => void): () => void;
        modeDrawing(): FieldModeDrawing | null;
    };
    marchers: FieldMarchers;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const drawing = useSyncExternalStore(
        (listener) => editor.subscribe(listener),
        () => editor.modeDrawing(),
    );
    const at = drawing?.marchersAt ?? null;
    // The loop keeps its time while the drawing changes under it (the pointer moves)
    const startedAt = useRef<number | null>(null);
    const walking = !!at?.walk && !prefersReducedMotion();

    useEffect(() => {
        if (!at) {
            startedAt.current = null;
            return;
        }
        const show = (points: readonly { x: number; y: number }[]) => {
            marchers.setOverrides(
                new Map(at.ids.map((id, i) => [id, points[i]!] as const)),
            );
            invalidate();
        };
        let frame = 0;
        if (!walking) startedAt.current = null;
        if (walking && at.walk) {
            const walk = at.walk;
            const tick = (now: number) => {
                startedAt.current ??= now;
                show(walk(followPreviewProgress(now - startedAt.current)));
                frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
        } else show(at.spots);
        return () => cancelAnimationFrame(frame);
    }, [at, walking, marchers, invalidate]);
    // Back where the show has them once the drawing stops naming them (not on every change of it)
    const shown = at !== null;
    useEffect(() => {
        if (!shown) return;
        return () => {
            marchers.setOverrides(null);
            invalidate();
        };
    }, [shown, marchers, invalidate]);

    return null;
}
