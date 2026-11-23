import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { FieldTheme } from "@openmarch/core";
import { rgba01 } from "../fieldGeometry";
import type { FieldMarchers } from "../fieldMarchers";
import type { FieldDimming } from "../fieldDimming";
import {
    labelOpacity,
    labelWeight,
    type FieldNotDefined,
} from "../fieldNotDefined";
import { useFieldDraw } from "../fieldDrawContext";
import { labelsShown } from "../marcherLooks";
import { TextBatch, type GlyphAtlas } from "../sdfText";
import { autoLabelScale, type LabelBox } from "@/field/labelForms";
import type { LabelTags } from "@/cues/useEquipmentTags";

/**
 * A marcher label: 14 field units, its center 2.2 dot radii above the dot,
 * or (beside) its left end 1.6 dot radii right of the dot.
 */
const LABEL_SIZE = 14;
const DOT_RADIUS = 5;
const LABEL_LIFT = DOT_RADIUS * 2.2;
const LABEL_BESIDE = DOT_RADIUS * 1.6;
/** A drill number with its equipment tag after it ("G3 R"), or the number alone. */
const withTag = (label: string, tag: string | undefined) =>
    tag && label ? `${label} ${tag}` : label;

/** The baseline's offset below the label's center, in em. */
const CENTER_BASELINE = 0.35;
/**
 * How far its capitals and digits reach above the label's center, in em
 * (the baseline is {@link CENTER_BASELINE} below it).
 */
const CENTER_CAP_TOP = 0.25;

/**
 * Where a label is drawn for a marcher at `x`, `y`, in field units: its
 * middle, its width (`widthEm` of text, an em `size` across) and an em's
 * height, or with `ink` only the band its capitals and digits fill.
 */
export function labelBoxAt(
    x: number,
    y: number,
    widthEm: number,
    size: number,
    beside: boolean,
    ink = false,
): LabelBox {
    const width = widthEm * size;
    const middle = {
        x: x + (beside ? LABEL_BESIDE + width / 2 : 0),
        y: y - (beside ? 0 : LABEL_LIFT),
    };
    if (!ink) return { ...middle, width, height: size };
    return {
        x: middle.x,
        y: middle.y + ((CENTER_BASELINE - CENTER_CAP_TOP) / 2) * size,
        width,
        height: (CENTER_BASELINE + CENTER_CAP_TOP) * size,
    };
}

/** A label's size in field units at a style, before Auto shrinks it. */
export const labelSizeOf = (style: LabelStyle) => LABEL_SIZE * style.scale;

/**
 * The View tab's label form: `labels` written as given (full drill numbers,
 * or numbers only), off, or `auto`, which shrinks every label together until
 * none touch. `scale` is the label size setting.
 */
export type LabelStyle = {
    form: "fixed" | "auto" | "off";
    scale: number;
    beside: boolean;
};

const DEFAULT_STYLE: LabelStyle = { form: "fixed", scale: 1, beside: false };

/**
 * The size Auto draws the labels at, for where `marchers` stand: the style's size shrunk until no
 * two labels touch
 */
export function autoLabelSizeOf(
    style: LabelStyle,
    marchers: Pick<FieldMarchers, "ids" | "positions" | "hidden">,
    labels: ReadonlyMap<number, string>,
    atlas: GlyphAtlas,
): number {
    const fixed = labelSizeOf(style);
    const { ids, positions, hidden } = marchers;
    const widths = ids.map((id) => atlas.measure(labels.get(id) ?? ""));
    return (
        fixed *
        autoLabelScale((scale) => {
            const em = fixed * scale;
            const boxes: LabelBox[] = [];
            for (let i = 0; i < ids.length; i++) {
                if (hidden[i]) continue;
                boxes.push(
                    labelBoxAt(
                        positions[i * 2],
                        positions[i * 2 + 1],
                        widths[i],
                        em,
                        style.beside,
                    ),
                );
            }
            return boxes;
        })
    );
}

/**
 * Every marcher's label (drill number) in one instanced draw of SDF glyphs,
 * in the theme's label color. A marcher whose
 * appearance hides its label has no glyphs. The text is laid out again only
 * when the marchers, their labels or which labels show change; dimming only
 * rewrites the colors, the keyframe look only the weights, and a frame only
 * the anchors.
 */
export default function LabelsLayer({
    marchers,
    dimming,
    look,
    labels,
    theme,
    atlas,
    style = DEFAULT_STYLE,
    holdAutoSize = false,
    tags = null,
}: {
    marchers: FieldMarchers;
    /** Marchers whose labels are drawn dimmed (#201). */
    dimming: FieldDimming;
    /** Labels drawn lighter in weight off a keyframe (#324, #478); dimming wins. */
    look: FieldNotDefined;
    /** Each marcher's label text (its drill number, or the number only), by id. */
    labels: ReadonlyMap<number, string>;
    theme: FieldTheme;
    atlas: GlyphAtlas;
    /** The View tab's label form and Settings › Field's label size and position; exports keep the default. */
    style?: LabelStyle;
    /** Keeps Auto's size as it is (during playback), so labels don't change size as marchers pass. */
    holdAutoSize?: boolean;
    /**
     * A short tag by some drill numbers at the beat drawn: what a performer holds when it isn't
     * their section's usual (fork #992). Read every frame; the text is laid out again only when
     * the tags change.
     */
    tags?: LabelTags | null;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const text = useMemo(() => {
        const batch = new TextBatch(atlas);
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
        lookVersion: -1,
        labels,
        theme,
        style,
        size: labelSizeOf(style),
        shown: new Uint8Array(0) as Uint8Array,
        tagKey: "",
    });

    useEffect(() => {
        invalidate();
        return () => text.dispose();
    }, [text, invalidate]);

    // New labels, a new theme or style lay the text out again on the next frame
    useEffect(() => invalidate(), [labels, theme, style, tags, invalidate]);
    useEffect(() => {
        text.setOffset(
            style.beside ? LABEL_BESIDE : 0,
            style.beside ? 0 : -LABEL_LIFT,
        );
    }, [text, style.beside]);
    useEffect(() => look.subscribe(invalidate), [look, invalidate]);

    useFrame(() => {
        const { zoom } = draw.view.getState();
        // Labels scale with the field and fade out when they'd be too small to read
        // (`QUALITY_SETTINGS`: low-quality mode hides them sooner)
        const { labelFadeFrom, labelFadeTo } = draw.quality();
        const last = drawn.current;
        const size = labelSize(last.size);
        const opacity = Math.min(
            1,
            Math.max(
                0,
                (size * zoom - labelFadeFrom) / (labelFadeTo - labelFadeFrom),
            ),
        );
        text.opacity = opacity;
        // Hidden labels cost nothing to draw, which matters most in software GL
        text.mesh.visible = opacity > 0 && style.form !== "off";
        let shown = last.shown;
        if (
            marchers.appearanceVersion !== last.appearanceVersion ||
            marchers.idsVersion !== last.idsVersion ||
            theme !== last.theme
        ) {
            const now = labelsShown(marchers.stacks, theme);
            if (!sameBytes(now, shown)) shown = now;
        }
        const tagged = tags?.at(marchers.drawnBeat) ?? null;
        const tagKey = tagged?.key ?? "";
        const newLayout =
            tagKey !== last.tagKey ||
            marchers.idsVersion !== last.idsVersion ||
            labels !== last.labels ||
            theme !== last.theme ||
            shown !== last.shown ||
            style !== last.style ||
            size !== last.size ||
            // Dimming hides or recolors labels: laid out again
            dimming.version !== last.dimVersion;
        // The keyframe look (and each frame of its ease on Stop) only
        // changes the weights
        const weightsChanged = look.version !== last.lookVersion;
        const weightOf = (id: number) => labelWeight(dimming, look, id);
        if (newLayout) {
            const color = rgba01(theme.defaultMarcher.label);
            text.setLabels(
                marchers.ids.map((id, i) => ({
                    text:
                        shown[i] && dimming.labelShown(id)
                            ? withTag(
                                  labels.get(id) ?? "",
                                  tagged?.tags.get(id),
                              )
                            : "",
                    size,
                    align: style.beside ? "left" : "center",
                    baseline: CENTER_BASELINE,
                    color: [
                        color[0],
                        color[1],
                        color[2],
                        color[3] * labelOpacity(dimming, id),
                    ],
                    weight: weightOf(id),
                })),
            );
        } else if (weightsChanged) {
            text.setWeights((i) => weightOf(marchers.ids[i]!));
        }
        if (newLayout || marchers.version !== last.version)
            text.setAnchors(marchers.positions);
        drawn.current = {
            version: marchers.version,
            idsVersion: marchers.idsVersion,
            appearanceVersion: marchers.appearanceVersion,
            dimVersion: dimming.version,
            lookVersion: look.version,
            labels,
            theme,
            style,
            size,
            shown,
            tagKey,
        };
    });

    /**
     * The size labels are drawn at: the style's, or Auto's for where the
     * marchers stand, worked out again when they move unless it's held.
     */
    function labelSize(before: number) {
        const fixed = labelSizeOf(style);
        if (style.form !== "auto") return fixed;
        const last = drawn.current;
        const moved =
            marchers.version !== last.version ||
            marchers.idsVersion !== last.idsVersion ||
            labels !== last.labels ||
            style !== last.style;
        if (!moved || (holdAutoSize && style === last.style)) return before;
        return autoLabelSizeOf(style, marchers, labels, atlas);
    }

    return <primitive object={text.mesh} />;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((value, i) => value === b[i]);
