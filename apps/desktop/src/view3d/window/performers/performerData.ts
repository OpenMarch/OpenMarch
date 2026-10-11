/**
 * The pure parts of the 3D View performer blocks (P4.2, ADR 0002 D-7,
 * design.md §8): instance colors, instance matrices and the selection ring
 * set. `Performers.tsx` owns the meshes and calls these from `useFrame`.
 *
 * Every function writes into arrays the caller allocated once per show, so
 * the per-frame path allocates nothing here.
 */
import type { FieldProperties, FieldTheme, RgbaColor } from "@openmarch/core";
import {
    appearanceIsHidden,
    type AppearanceComponentOptional,
} from "@/entity-components/appearance";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import { positionAtInto } from "@/view3d/positions";

/** Cylinder radius in meters (0.6 m across, ADR 0002 D-7). */
export const PERFORMER_RADIUS = 0.3;
/** Cylinder height in meters. */
export const PERFORMER_HEIGHT = 1.75;
/**
 * The selection ring's inner and outer radius, in meters: one ring per
 * performer even in a block at two-step (1.14 m) intervals.
 */
export const RING_INNER_RADIUS = 0.34;
export const RING_OUTER_RADIUS = 0.46;
/** Just above the field surface, so the ring doesn't z-fight with it. */
export const RING_Y = FIELD_SURFACE_Y + 0.01;
/** The accent when the page has no `--color-accent` (dark theme value). */
export const FALLBACK_ACCENT = "rgb(150, 126, 255)";

/** The performers in instance order, with what each instance needs. */
export interface PerformerSlots {
    /** Marcher ID per instance. */
    ids: number[];
    /** Timeline per instance; null when the marcher has no positions yet. */
    timelines: (MarcherTimeline | null)[];
    /** Instance index by marcher ID. */
    indexById: Map<number, number>;
}

/**
 * Orders the performers by marcher ID and pairs each with its timeline. The
 * instance count is the marcher count, so a marcher without positions keeps
 * its slot and is hidden.
 */
export function buildPerformerSlots(
    marcherIds: readonly number[],
    timelines: ReadonlyMap<number, MarcherTimeline>,
): PerformerSlots {
    const ids = [...marcherIds].sort((a, b) => a - b);
    const indexById = new Map<number, number>();
    ids.forEach((id, i) => indexById.set(id, i));
    return {
        ids,
        timelines: ids.map((id) => timelines.get(id) ?? null),
        indexById,
    };
}

/** A performer's look, resolved like the 2D canvas's `CanvasMarcher`. */
export interface PerformerLook {
    fill: RgbaColor;
    visible: boolean;
}

/**
 * Resolves one marcher's appearance cascade (marcher page, tags, section,
 * field theme; highest priority first) the way `CanvasMarcher.setAppearance`
 * does: the first non-null fill wins, and visibility follows
 * `appearanceIsHidden`.
 */
export function resolvePerformerLook(
    appearances: readonly AppearanceComponentOptional[] | undefined,
    theme: FieldTheme,
): PerformerLook {
    if (!appearances || appearances.length === 0)
        return { fill: theme.defaultMarcher.fill, visible: true };
    let fill: RgbaColor | null = null;
    for (const appearance of appearances) {
        if (appearance.fill_color != null) {
            fill = appearance.fill_color;
            break;
        }
    }
    return {
        fill: fill ?? theme.defaultMarcher.fill,
        visible: !appearanceIsHidden([...appearances]),
    };
}

/**
 * Writes each instance's fill as sRGB in [0, 1] (`rgb`, three floats per
 * instance) and its visibility (`visible`, 1 or 0). Alpha is ignored: the
 * blocks are opaque.
 */
export function writePerformerLooks(
    slots: PerformerSlots,
    appearancesById:
        | Readonly<Record<number, AppearanceComponentOptional[]>>
        | undefined,
    theme: FieldTheme,
    rgb: Float32Array,
    visible: Uint8Array,
): void {
    for (let i = 0; i < slots.ids.length; i++) {
        const look = resolvePerformerLook(
            appearancesById?.[slots.ids[i]],
            theme,
        );
        rgb[i * 3] = look.fill.r / 255;
        rgb[i * 3 + 1] = look.fill.g / 255;
        rgb[i * 3 + 2] = look.fill.b / 255;
        visible[i] = look.visible ? 1 : 0;
    }
}

/** Reused by {@link writePerformerPositions}, so it allocates nothing. */
const scratchPoint = { x: 0, z: 0 };

/**
 * Writes every performer's ground position at `ms` into `xz` (two floats per
 * instance) and whether it is placed into `placed` (1 or 0). A performer is
 * placed when it has a position and is visible.
 */
export function writePerformerPositions(
    slots: PerformerSlots,
    ms: number,
    fieldProperties: FieldProperties,
    visible: Uint8Array,
    xz: Float32Array,
    placed: Uint8Array,
): void {
    const point = scratchPoint;
    for (let i = 0; i < slots.ids.length; i++) {
        const timeline = slots.timelines[i];
        if (
            timeline &&
            visible[i] &&
            positionAtInto(timeline, ms, fieldProperties, point)
        ) {
            xz[i * 2] = point.x;
            xz[i * 2 + 1] = point.z;
            placed[i] = 1;
        } else {
            placed[i] = 0;
        }
    }
}

/** Writes a translation matrix (column-major, as three stores it). */
function writeTranslation(
    out: Float32Array,
    index: number,
    x: number,
    y: number,
    z: number,
): void {
    const o = index * 16;
    out.fill(0, o, o + 16);
    out[o] = 1;
    out[o + 5] = 1;
    out[o + 10] = 1;
    out[o + 12] = x;
    out[o + 13] = y;
    out[o + 14] = z;
    out[o + 15] = 1;
}

/**
 * Writes the block matrices: a translation to the performer's spot for a
 * placed performer, and a zero matrix (nothing drawn) otherwise. The
 * cylinder geometry has its base at its origin, so blocks stand at y = 0.
 */
export function writePerformerMatrices(
    count: number,
    xz: Float32Array,
    placed: Uint8Array,
    matrices: Float32Array,
): void {
    for (let i = 0; i < count; i++) {
        if (placed[i])
            writeTranslation(matrices, i, xz[i * 2], 0, xz[i * 2 + 1]);
        else matrices.fill(0, i * 16, i * 16 + 16);
    }
}

/**
 * Writes one ring matrix per selected, placed performer, packed from index
 * 0 in instance order.
 *
 * @returns how many rings to draw
 */
export function writeRingMatrices(
    slots: PerformerSlots,
    selected: ReadonlySet<number>,
    xz: Float32Array,
    placed: Uint8Array,
    matrices: Float32Array,
): number {
    let count = 0;
    if (selected.size === 0) return 0;
    for (let i = 0; i < slots.ids.length; i++) {
        if (!placed[i] || !selected.has(slots.ids[i])) continue;
        writeTranslation(matrices, count, xz[i * 2], RING_Y, xz[i * 2 + 1]);
        count++;
    }
    return count;
}

/** Reads the theme's accent color from the page, for the selection ring. */
export function readAccentColor(root?: Element): string {
    if (typeof window === "undefined" || typeof getComputedStyle !== "function")
        return FALLBACK_ACCENT;
    const element = root ?? document.documentElement;
    const value = getComputedStyle(element)
        .getPropertyValue("--color-accent")
        .trim();
    return value || FALLBACK_ACCENT;
}
