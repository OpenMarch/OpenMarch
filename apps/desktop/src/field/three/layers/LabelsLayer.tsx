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
import { labelsShown, writeMarcherLooks } from "../marcherLooks";
import { dotSizes } from "../selectionRing";
import { TextBatch, type GlyphAtlas } from "../sdfText";
import { autoLabelScale, type LabelBox } from "@/field/labelForms";
import type { LabelIcons } from "@/cues/useEquipmentIcons";
import type {
    EquipmentIconKey,
    EquipmentIconPlace,
} from "@/cues/equipmentIcons";
import { IconBatch, useIconAtlas, type FieldIcon } from "../iconBatch";

/**
 * A marcher label: 14 field units, its center 2.2 dot radii above the dot,
 * or (beside) its left end 1.6 dot radii right of the dot.
 */
const LABEL_SIZE = 14;
const DOT_RADIUS = 5;
const LABEL_LIFT = DOT_RADIUS * 2.2;
const LABEL_BESIDE = DOT_RADIUS * 1.6;
/**
 * An equipment icon's box, and the gap before it after the drill number, in em. The drawings fill
 * about two thirds of their box, so 1.6 em draws them a little taller than the digits.
 */
const ICON_EM = 1.6;
const ICON_GAP_EM = 0.1;
/** An icon in place of a dot: its box in field units (the drawing fills about two thirds). */
const DOT_ICON = DOT_RADIUS * 4.4;
/** How much wider an icon makes a label, in em (for Auto's spacing). */
const ICON_WIDTH_EM = ICON_EM + ICON_GAP_EM;

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
    /** Marchers with an equipment icon after their label, which makes it wider */
    icons?: ReadonlyMap<number, unknown>,
): number {
    const fixed = labelSizeOf(style);
    const { ids, positions, hidden } = marchers;
    const widths = ids.map(
        (id) =>
            atlas.measure(labels.get(id) ?? "") +
            (icons?.has(id) ? ICON_WIDTH_EM : 0),
    );
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
    icons = null,
    iconPlace = "beside",
    hovered = null,
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
     * An icon after some drill numbers at the beat drawn: what a performer holds (fork #992), for
     * whom the Equipment icons setting says. Read every frame; laid out again only when the icons
     * change.
     */
    icons?: LabelIcons | null;
    /** Where the icons go: after the drill number, in place of the dot, or of the number */
    iconPlace?: EquipmentIconPlace;
    /**
     * The marcher the pointer rests on, read every frame, and when it changes: in place of the
     * number, an icon gives way to the number while its marcher is hovered or selected
     */
    hovered?: {
        get(): number | null;
        subscribe(changed: () => void): () => void;
    } | null;
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
    // The icons' atlas is drawn once, the first time a field has an icon to show
    const iconAtlas = useIconAtlas(icons !== null);
    const iconBatch = useMemo(() => {
        if (!iconAtlas) return null;
        const batch = new IconBatch(iconAtlas);
        batch.mesh.renderOrder = 1.9;
        return batch;
    }, [iconAtlas]);
    useEffect(() => {
        invalidate();
        return () => iconBatch?.dispose();
    }, [iconBatch, invalidate]);
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
        iconKey: "",
        iconBatch: null as IconBatch | null,
        iconPlace,
        hoveredId: null as number | null,
        selectionVersion: -1,
    });

    useEffect(() => {
        invalidate();
        return () => text.dispose();
    }, [text, invalidate]);

    // New labels, a new theme or style lay the text out again on the next frame
    useEffect(
        () => invalidate(),
        [labels, theme, style, icons, iconPlace, invalidate],
    );
    useEffect(() => hovered?.subscribe(invalidate), [hovered, invalidate]);
    // The icons carry the label's offset themselves: one in place of a dot has none
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
        const iconsNow = icons?.at(marchers.drawnBeat) ?? null;
        const iconKey = iconsNow?.key ?? "";
        const size = labelSize(last.size, iconsNow?.icons, iconKey);
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
        const onDots = iconPlace === "dot";
        if (iconBatch) {
            // In place of a dot it's drawn as the dot is: never faded, and as large when zoomed out
            iconBatch.opacity = onDots ? 1 : opacity;
            iconBatch.dotScale = dotSizes(zoom).scale;
            iconBatch.mesh.visible = iconKey !== "" && (onDots || opacity > 0);
        }
        const hoveredId = hovered?.get() ?? null;
        // In place of the number, who's hovered or selected decides which numbers show
        const byNumber = iconPlace === "label" && iconKey !== "";
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
            iconKey !== last.iconKey ||
            iconBatch !== last.iconBatch ||
            iconPlace !== last.iconPlace ||
            (byNumber &&
                (hoveredId !== last.hoveredId ||
                    marchers.selectionVersion !== last.selectionVersion)) ||
            // The dots' colors
            (onDots && marchers.appearanceVersion !== last.appearanceVersion) ||
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
                        shown[i] &&
                        dimming.labelShown(id) &&
                        !(
                            byNumber &&
                            iconsNow?.icons.has(id) &&
                            !revealed(id, i, hoveredId)
                        )
                            ? (labels.get(id) ?? "")
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
            iconBatch?.setIcons(
                iconsOf(iconsNow?.icons, shown, size, color, hoveredId),
            );
        } else if (weightsChanged) {
            text.setWeights((i) => weightOf(marchers.ids[i]!));
        }
        if (newLayout || marchers.version !== last.version) {
            text.setAnchors(marchers.positions);
            iconBatch?.setAnchors(marchers.positions);
        }
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
            iconKey,
            iconBatch,
            iconPlace,
            hoveredId,
            selectionVersion: marchers.selectionVersion,
        };
    });

    /** Whether a marcher's drill number shows in place of its icon: hovered or selected. */
    function revealed(id: number, i: number, hoveredId: number | null) {
        return hoveredId === id || marchers.selected[i] === 1;
    }

    /**
     * Each marcher's icon, where `iconPlace` says. After the drill number (or where the label would
     * be when it's off or empty) and in place of the number, it's drawn like the label: its size,
     * color and dimming. In place of the dot it's centered on the marcher's spot in the dot's
     * color, about the dot's size.
     */
    function iconsOf(
        byId: ReadonlyMap<number, EquipmentIconKey> | undefined,
        shown: Uint8Array,
        size: number,
        color: readonly number[],
        hoveredId: number | null,
    ): FieldIcon[] {
        if (!byId || byId.size === 0) return [];
        if (iconPlace === "dot") return iconsOnDots(byId);
        const out: FieldIcon[] = [];
        const iconSize = ICON_EM * size;
        // The label's offset from the dot, and the middle of its capitals and digits
        const ox = style.beside ? LABEL_BESIDE : 0;
        const y =
            (style.beside ? 0 : -LABEL_LIFT) +
            ((CENTER_BASELINE - CENTER_CAP_TOP) / 2) * size;
        marchers.ids.forEach((id, i) => {
            const icon = byId.get(id);
            if (!icon || !shown[i] || !dimming.labelShown(id)) return;
            const numberShows =
                iconPlace === "beside" || revealed(id, i, hoveredId);
            const text =
                style.form === "off" || !numberShows
                    ? ""
                    : (labels.get(id) ?? "");
            const width = atlas.measure(text) * size;
            const after = text ? ICON_GAP_EM * size + iconSize / 2 : 0;
            out.push({
                icon,
                owner: i,
                x:
                    ox +
                    (style.beside
                        ? width + (text ? after : iconSize / 2)
                        : width / 2 + after),
                y,
                size: iconSize,
                color: [
                    color[0],
                    color[1],
                    color[2],
                    color[3] * labelOpacity(dimming, id),
                ],
            });
        });
        return out;
    }

    /** Icons in place of the dots, in each dot's color, faded as a dimmed dot is. */
    function iconsOnDots(
        byId: ReadonlyMap<number, EquipmentIconKey>,
    ): FieldIcon[] {
        const n = marchers.ids.length;
        const fill = new Float32Array(n * 4);
        writeMarcherLooks(marchers.stacks, theme, {
            fill,
            outline: new Float32Array(n * 4),
            shape: new Float32Array(n),
        });
        const out: FieldIcon[] = [];
        marchers.ids.forEach((id, i) => {
            const icon = byId.get(id);
            const alpha = fill[i * 4 + 3];
            if (!icon || marchers.isItem[i] || alpha === 0) return;
            out.push({
                icon,
                owner: i,
                x: 0,
                y: 0,
                size: DOT_ICON,
                scaled: true,
                color: [
                    fill[i * 4],
                    fill[i * 4 + 1],
                    fill[i * 4 + 2],
                    alpha * dimming.opacityOf(id),
                ],
            });
        });
        return out;
    }

    /**
     * The size labels are drawn at: the style's, or Auto's for where the
     * marchers stand, worked out again when they move unless it's held.
     */
    function labelSize(
        before: number,
        withIcons: ReadonlyMap<number, unknown> | undefined,
        iconKey: string,
    ) {
        const fixed = labelSizeOf(style);
        if (style.form !== "auto") return fixed;
        const last = drawn.current;
        const moved =
            marchers.version !== last.version ||
            marchers.idsVersion !== last.idsVersion ||
            labels !== last.labels ||
            style !== last.style ||
            iconKey !== last.iconKey ||
            iconPlace !== last.iconPlace;
        if (!moved || (holdAutoSize && style === last.style)) return before;
        // Only after the number does an icon make a label wider
        return autoLabelSizeOf(
            style,
            marchers,
            labels,
            atlas,
            iconPlace === "beside" ? withIcons : undefined,
        );
    }

    return (
        <>
            <primitive object={text.mesh} />
            {iconBatch && <primitive object={iconBatch.mesh} />}
        </>
    );
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((value, i) => value === b[i]);
