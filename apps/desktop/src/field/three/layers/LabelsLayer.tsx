import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { FieldTheme } from "@openmarch/core";
import { rgba01 } from "../fieldGeometry";
import type { FieldMarchers } from "../fieldMarchers";
import { DIMMED_OPACITY, type FieldDimming } from "../fieldDimming";
import { useFieldDraw } from "../fieldDrawContext";
import { labelsShown } from "../marcherLooks";
import { TextBatch, type GlyphAtlas } from "../sdfText";

/** A marcher label: 14 field units, its center 2.2 dot radii above the dot. */
const LABEL_SIZE = 14;
const LABEL_LIFT = 5 * 2.2;
/** The baseline's offset below the label's center, in em. */
const CENTER_BASELINE = 0.35;

/**
 * Every marcher's label (drill number) in one instanced draw of SDF glyphs,
 * in the theme's label color. A marcher whose
 * appearance hides its label has no glyphs. The text is laid out again only
 * when the marchers, their labels or which labels show change; a frame only
 * rewrites the anchors.
 */
export default function LabelsLayer({
    marchers,
    dimming,
    labels,
    theme,
    atlas,
}: {
    marchers: FieldMarchers;
    /** Marchers whose labels are drawn dimmed (#201). */
    dimming: FieldDimming;
    /** Each marcher's drill number, by id. */
    labels: ReadonlyMap<number, string>;
    theme: FieldTheme;
    atlas: GlyphAtlas;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const text = useMemo(() => {
        const batch = new TextBatch(atlas);
        batch.setOffset(0, -LABEL_LIFT);
        // Under the dots, over the pathways: every dot covers every label, so
        // a crowded neighbor's dot hides a number rather than a number hiding
        // a dot (#208)
        batch.mesh.renderOrder = 1.9;
        return batch;
    }, [atlas]);
    const drawn = useRef({
        version: -1,
        idsVersion: -1,
        appearanceVersion: -1,
        dimVersion: -1,
        labels,
        theme,
        shown: new Uint8Array(0) as Uint8Array,
    });

    useEffect(() => {
        invalidate();
        return () => text.dispose();
    }, [text, invalidate]);

    // New labels or a new theme lay the text out again on the next frame
    useEffect(() => invalidate(), [labels, theme, invalidate]);

    useFrame(() => {
        const { zoom } = draw.view.getState();
        // Labels scale with the field and fade out when they'd be too small to read
        // (`QUALITY_SETTINGS`: low-quality mode hides them sooner)
        const { labelFadeFrom, labelFadeTo } = draw.quality();
        const opacity = Math.min(
            1,
            Math.max(
                0,
                (LABEL_SIZE * zoom - labelFadeFrom) /
                    (labelFadeTo - labelFadeFrom),
            ),
        );
        text.opacity = opacity;
        // Hidden labels cost nothing to draw, which matters most in software GL
        text.mesh.visible = opacity > 0;
        const last = drawn.current;
        let shown = last.shown;
        if (
            marchers.appearanceVersion !== last.appearanceVersion ||
            marchers.idsVersion !== last.idsVersion ||
            theme !== last.theme
        ) {
            const now = labelsShown(marchers.stacks, theme);
            if (!sameBytes(now, shown)) shown = now;
        }
        const newLayout =
            marchers.idsVersion !== last.idsVersion ||
            labels !== last.labels ||
            theme !== last.theme ||
            shown !== last.shown ||
            dimming.version !== last.dimVersion;
        if (newLayout) {
            const color = rgba01(theme.defaultMarcher.label);
            const dimmed: typeof color = [
                color[0],
                color[1],
                color[2],
                color[3] * DIMMED_OPACITY,
            ];
            text.setLabels(
                marchers.ids.map((id, i) => ({
                    text: shown[i] ? (labels.get(id) ?? "") : "",
                    size: LABEL_SIZE,
                    baseline: CENTER_BASELINE,
                    color: dimming.isDimmed(id) ? dimmed : color,
                })),
            );
        }
        if (newLayout || marchers.version !== last.version)
            text.setAnchors(marchers.positions);
        drawn.current = {
            version: marchers.version,
            idsVersion: marchers.idsVersion,
            appearanceVersion: marchers.appearanceVersion,
            dimVersion: dimming.version,
            labels,
            theme,
            shown,
        };
    });

    return <primitive object={text.mesh} />;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((value, i) => value === b[i]);
