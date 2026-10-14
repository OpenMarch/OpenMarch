/**
 * The template values docs/3d/props-spec.md §3 names but gives no figures
 * for: the safe area, the bleed of surfaces that are neither flags nor
 * sublimation (floors and props), and how a cut's outline is drawn. The
 * outline is also what 3D clips to, so the default policy draws the silk
 * Cut's own outline (`../sizes/silkCuts`), the one the silk renderer uses.
 *
 * `DEFAULT_TEMPLATE_POLICY` holds the owner's figures (2026-10-11, Q29 and
 * Q30; 2026-10-12, Q38 and Q42).
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { insetPolygon } from "../sizes/cutGeometry";
import { sampleCutPath } from "../sizes/silkCuts";
import { formatFeetInches, lengthOf, type Length } from "../sizes/units";
import { FIXED_BLEED, type TemplateSurface } from "./surfaces";

/** A point in meters, from the trim's top-left corner, y down. */
export type Point = readonly [x: number, y: number];

export interface Insets<L = Length> {
    readonly top: L;
    readonly right: L;
    readonly bottom: L;
    readonly left: L;
}

export interface TemplatePolicy {
    /** The safe area's inset from the trim on each side. */
    safeArea(surface: TemplateSurface): Insets;
    /** Bleed for a surface whose print process has no fixed bleed. */
    bleed(surface: TemplateSurface): Length;
    /**
     * The cut's outline, inside the trim, for any cut other than a
     * rectangle: at least three points, in order, not closed. `undefined`
     * only for a surface without an outline, which `resolveTemplate` rejects.
     */
    cutOutline(surface: TemplateSurface): readonly Point[] | undefined;
}

/** Safe area (Q29): 6 in on floors and Floor props, 1 in on everything else. */
export const SAFE_AREA: Readonly<Record<"floor" | "standard", Length>> = {
    floor: lengthOf(6, "in"),
    standard: lengthOf(1, "in"),
};

/**
 * Bleed for the processes the spec leaves open (Q30): 2 in on floors and
 * Floor props, ½ in on prop panels. Flags (⅛ in) and sublimation (½ in) keep
 * the spec's fixed bleed (`FIXED_BLEED`).
 */
export const POLICY_BLEED: Readonly<Record<"floor" | "prop", Length>> = {
    floor: lengthOf(2, "in"),
    prop: lengthOf(0.5, "in"),
};

/**
 * How small items get a safe area (Q38): when the policy's inset leaves no
 * room, every side's inset becomes this fraction of the trim's shorter side.
 */
export const SMALL_ITEM_SAFE_FRACTION = 0.25;

/** The quiet note on a template whose safe area was shrunk (Q38). */
export function safeAreaShrunkNote(insetM: number, unit: "in" | "mm"): string {
    const inset =
        unit === "in"
            ? formatFeetInches(insetM)
            : `${Math.round(insetM * 10000) / 10} mm`;
    return `Safe area reduced to ${inset} from the trim for this small size.`;
}

/** Chords per cubic when a cut outline is flattened for a template. */
export const OUTLINE_SAMPLES_PER_CURVE = 48;

/** The owner's template values (2026-10-11). */
export const DEFAULT_TEMPLATE_POLICY: TemplatePolicy = {
    safeArea: (surface) => {
        const inset =
            surface.process === "floor" ? SAFE_AREA.floor : SAFE_AREA.standard;
        return { top: inset, right: inset, bottom: inset, left: inset };
    },
    bleed: (surface) =>
        surface.process === "floor" ? POLICY_BLEED.floor : POLICY_BLEED.prop,
    cutOutline: (surface) =>
        surface.cutPath
            ? sampleCutPath(surface.cutPath, OUTLINE_SAMPLES_PER_CURVE)
            : undefined,
};

/** A surface with every value resolved to meters. */
export interface ResolvedTemplate {
    readonly surface: TemplateSurface;
    readonly trimM: { readonly width: number; readonly height: number };
    readonly bleedM: number;
    readonly safeM: Insets<number>;
    /** Present for every cut other than a rectangle. */
    readonly outlineM?: readonly Point[];
    /**
     * The safe area of a cut other than a rectangle: its outline inset by
     * the safe-area inset (the insets' largest side).
     */
    readonly safeRingM?: readonly Point[];
    /** Set when the policy's inset didn't fit and was shrunk (Q38). */
    readonly safeShrunk?: true;
}

const EPS = 1e-9;

export function resolveTemplate(
    surface: TemplateSurface,
    policy: TemplatePolicy,
): ResolvedTemplate {
    const width = surface.width.m;
    const height = surface.height.m;
    if (!(width > 0 && height > 0))
        throw new Error(`${surface.id}: size must be positive`);

    const bleedM = (FIXED_BLEED[surface.process] ?? policy.bleed(surface)).m;
    if (!(bleedM >= 0)) throw new Error(`${surface.id}: negative bleed`);

    const s = policy.safeArea(surface);
    let safeM: Insets<number> = {
        top: s.top.m,
        right: s.right.m,
        bottom: s.bottom.m,
        left: s.left.m,
    };
    if (Object.values(safeM).some((v) => !(v >= 0)))
        throw new Error(`${surface.id}: negative safe-area inset`);
    // Q38: a small item gets a quarter of its shorter side on every side.
    const shrinkTo = Math.min(width, height) * SMALL_ITEM_SAFE_FRACTION;
    const shrink = (): Insets<number> => ({
        top: shrinkTo,
        right: shrinkTo,
        bottom: shrinkTo,
        left: shrinkTo,
    });
    let safeShrunk =
        safeM.left + safeM.right >= width || safeM.top + safeM.bottom >= height;
    if (safeShrunk) safeM = shrink();

    const base = {
        surface,
        trimM: { width, height },
        bleedM,
        ...(safeShrunk ? { safeShrunk: true as const } : {}),
    };
    if (surface.cut === "rectangle") return { ...base, safeM };

    const outlineM = policy.cutOutline(surface);
    if (!outlineM) throw new Error(`${surface.id}: no cut outline`);
    if (outlineM.length < 3)
        throw new Error(`${surface.id}: cut outline needs three points`);
    for (const [x, y] of outlineM)
        if (x < -EPS || y < -EPS || x > width + EPS || y > height + EPS)
            throw new Error(`${surface.id}: cut outline leaves the trim`);

    const insetOf = (i: Insets<number>) =>
        Math.max(i.top, i.right, i.bottom, i.left);
    let safeRingM = insetPolygon(outlineM, insetOf(safeM));
    if (safeRingM.length === 0 && !safeShrunk) {
        safeShrunk = true;
        safeM = shrink();
        safeRingM = insetPolygon(outlineM, shrinkTo);
    }
    return {
        ...base,
        ...(safeShrunk ? { safeShrunk: true as const } : {}),
        safeM,
        outlineM,
        ...(safeRingM.length > 0 ? { safeRingM } : {}),
    };
}
