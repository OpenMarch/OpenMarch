import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import type { OverlayPlan } from "@/field/timelineOverlays";
import { useFieldDraw } from "../fieldDrawContext";
import { DotBatch, StrokeBatch } from "../overlayBatches";
import { TextBatch, type GlyphAtlas } from "../sdfText";

/** The baseline's offset below a label's center, in em (as `LabelsLayer`). */
const CENTER_BASELINE = 0.35;

/**
 * One timeline overlay (fork #201): a plan's strokes, then its dots over them,
 * then its labels, in three instanced draws at `renderOrder`. The plan is
 * written into the batches' persistent buffers when it changes; a frame only
 * sets the zoom. Nothing here re-renders React per frame.
 */
export default function OverlayLayer({
    plan,
    renderOrder,
    atlas,
}: {
    /** What to draw; null draws nothing. */
    plan: OverlayPlan | null;
    renderOrder: number;
    /** The labels' font, for a plan with labels. */
    atlas?: GlyphAtlas;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const batches = useMemo(() => {
        const strokes = new StrokeBatch();
        const dots = new DotBatch();
        const text = atlas ? new TextBatch(atlas) : null;
        const group = new Group();
        strokes.mesh.renderOrder = renderOrder;
        dots.mesh.renderOrder = renderOrder + 0.01;
        group.add(strokes.mesh, dots.mesh);
        if (text) {
            text.mesh.renderOrder = renderOrder + 0.02;
            group.add(text.mesh);
        }
        return { strokes, dots, text, group };
    }, [atlas, renderOrder]);
    const drawn = useRef<OverlayPlan | null | undefined>(undefined);

    useEffect(
        () => () => {
            batches.strokes.dispose();
            batches.dots.dispose();
            batches.text?.dispose();
        },
        [batches],
    );
    useEffect(() => {
        drawn.current = undefined;
        invalidate();
    }, [plan, batches, invalidate]);

    useFrame(({ gl }) => {
        const { zoom } = draw.view.getState();
        const unit = plan?.units === "screen" ? 1 / zoom : 1;
        const pixel = 1 / (zoom * gl.getPixelRatio());
        batches.strokes.setScale(unit, pixel);
        batches.dots.setScale(unit, pixel);
        if (drawn.current === plan) return;
        drawn.current = plan;
        batches.strokes.set(plan?.strokes ?? []);
        batches.dots.set(plan?.dots ?? []);
        if (batches.text) {
            const labels = plan?.labels ?? [];
            batches.text.setLabels(
                labels.map((label) => ({
                    text: label.text,
                    size: label.size,
                    baseline: CENTER_BASELINE,
                    color: label.color,
                })),
            );
            batches.text.setAnchors(labels.flatMap((l) => [l.x, l.y]));
        }
    });

    return <primitive object={batches.group} />;
}
