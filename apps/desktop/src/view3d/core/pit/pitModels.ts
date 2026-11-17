/**
 * The front ensemble's built-in models in the 3D View (docs/3d/instruments.md §6): which asset
 * an item's `items.model` names, which models are podiums and how high a drum major stands on
 * one, and where a model instance goes.
 *
 * - A model id is `pit/<name>`, `<name>` a key of `assets/pit/manifest.json`; the detailed file
 *   is `<name>.glb` and the distant one `<name>-low.glb`. Anything else draws as a block.
 * - Models are in meters, +Y up, origin on the ground at the middle of the footprint, +Z toward
 *   the audience and +X the player's left. They draw at real size: the item's Outline gives the
 *   position and the turn, not the size.
 * - A podium (an id naming a podium, tower, scaffold or stepladder) is stood on: at the
 *   manifest's `standAtM` on its footprint, on its deck at `standTopM`, facing the band across
 *   the field. Every podium the manifest lists has both; one without is a bug in the manifest.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`.
 */
import type { Detail } from "@/view3d/core/instruments/model";
import manifestJson from "@/view3d/assets/pit/manifest.json";

/** One model's size in meters. */
interface PitSize {
    width: number;
    depth: number;
    height: number;
}

/** What the 3D View reads of a model's manifest entry. */
export interface PitManifestEntry {
    high: { sizeM: PitSize };
    low: { sizeM: PitSize };
    /** A podium's standing height (m), where the drum major's feet go */
    standTopM?: number;
    /** Where on a podium's footprint the drum major stands: [x, z] in the model's axes (m) */
    standAtM?: readonly number[];
}

export type PitManifest = Readonly<Record<string, PitManifestEntry>>;

/** The shipped manifest, keyed by model name. */
export const PIT_MANIFEST: PitManifest = manifestJson as PitManifest;

/** Built-in pit model ids start with this. */
export const PIT_MODEL_PREFIX = "pit/";

/**
 * The asset name an item's model id names, such as `marimba-5.0` for `pit/marimba-5.0`, or null
 * when it names no model the manifest lists (none, another library, or one this app doesn't
 * ship): such an item draws as a block.
 */
export function pitModelName(
    modelId: string | null | undefined,
    manifest: PitManifest = PIT_MANIFEST,
): string | null {
    if (!modelId?.startsWith(PIT_MODEL_PREFIX)) return null;
    const name = modelId.slice(PIT_MODEL_PREFIX.length);
    return Object.hasOwn(manifest, name) ? name : null;
}

/** The file of a model's detailed or distant version. */
export const pitAssetFile = (name: string, detail: Detail): string =>
    detail === "high" ? `${name}.glb` : `${name}-low.glb`;

const PODIUM_WORDS = /podium|tower|scaffold|stepladder/;

/** Whether a model id is a podium: one a performer stands on. */
export const isPodiumModel = (modelId: string | null | undefined): boolean =>
    !!modelId?.startsWith(PIT_MODEL_PREFIX) &&
    PODIUM_WORDS.test(modelId.slice(PIT_MODEL_PREFIX.length));

/** A podium model's manifest entry, or null for a model that isn't a podium or isn't listed. */
function podiumEntry(
    modelId: string | null | undefined,
    manifest: PitManifest,
): PitManifestEntry | null {
    if (!isPodiumModel(modelId)) return null;
    const name = pitModelName(modelId, manifest);
    return name === null ? null : manifest[name];
}

/**
 * How high a performer stands on a podium model (m): the top of its deck, `standTopM`. Null for
 * a model that isn't a podium or isn't listed, or (a manifest bug) has no `standTopM`.
 */
export function podiumStandTop(
    modelId: string | null | undefined,
    manifest: PitManifest = PIT_MANIFEST,
): number | null {
    return podiumEntry(modelId, manifest)?.standTopM ?? null;
}

/**
 * Where on a podium model's footprint a performer stands, in the model's axes (m, before the
 * item's turn): its `standAtM`, else the middle. Null for a model that isn't a podium or isn't
 * listed.
 */
export function podiumStandAt(
    modelId: string | null | undefined,
    manifest: PitManifest = PIT_MANIFEST,
): { x: number; z: number } | null {
    const entry = podiumEntry(modelId, manifest);
    if (!entry) return null;
    const [x, z] = entry.standAtM ?? [0, 0];
    return { x, z };
}

/**
 * The items drawn as models, by marchers row, with their model's name: those whose model id
 * names a listed model that hasn't failed to load (`failed`, by name). Every other item draws as
 * a block.
 */
export function modelsByMarcher(
    items: readonly { marcher_id: number; model: string | null }[],
    failed: ReadonlySet<string>,
    manifest: PitManifest = PIT_MANIFEST,
): Map<number, string> {
    const out = new Map<number, string>();
    for (const item of items) {
        const name = pitModelName(item.model, manifest);
        if (name !== null && !failed.has(name)) out.set(item.marcher_id, name);
    }
    return out;
}

/** What {@link hidesVenuePodium} reads of an item. */
interface ItemModel {
    id: number;
    model: string | null;
    /** Where its center stands front to back (world meters, +Z toward the audience), if known */
    z: number | null;
}

/** Whether a podium centered at `z` stands in front of the field: on the audience side of its center line. */
export const isFrontPodium = (z: number, fieldCenterZ: number): boolean =>
    z > fieldCenterZ;

/**
 * The heading (radians about +Y, 0 facing +Z) of a performer standing on a podium centered at
 * `z`: across the field toward the band (docs/3d/instruments.md §6), straight, whatever the
 * drill's facing. A podium in front of the field faces the back sideline (-Z); one behind it
 * faces the audience.
 */
export const podiumHeading = (z: number, fieldCenterZ: number): number =>
    isFrontPodium(z, fieldCenterZ) ? Math.PI : 0;

/**
 * Whether the venue's own podium (`hs`, `bighs`) hides: the show has a podium item the 3D View
 * draws in front of the field, where the venue's stands, and not hidden on the field (`hidden`,
 * by item id). A podium behind the field leaves the venue's in place.
 *
 * @param fieldCenterZ the field's front-to-back midpoint, in world meters
 */
export function hidesVenuePodium(
    items: readonly ItemModel[],
    hidden: ReadonlySet<number>,
    fieldCenterZ: number,
    manifest: PitManifest = PIT_MANIFEST,
): boolean {
    return items.some(
        (item) =>
            !hidden.has(item.id) &&
            item.z !== null &&
            isFrontPodium(item.z, fieldCenterZ) &&
            podiumStandTop(item.model, manifest) !== null,
    );
}

/** Closer than this (m) a model switches to its detailed version... */
export const PIT_NEAR_M = 30;
/** ...and farther than this it switches back to its distant one. */
export const PIT_FAR_M = 38;

/**
 * Whether a model at (`x`, `z`) draws in detail, from its distance to the camera at about
 * keyboard height and whether it did last frame (`was`): the gap between {@link PIT_NEAR_M} and
 * {@link PIT_FAR_M} keeps one at the edge from flickering, as instruments do (`hornSet.ts`).
 */
export function isNearPitItem(
    x: number,
    z: number,
    camera: readonly [number, number, number],
    was: boolean | undefined,
): boolean {
    const d = Math.hypot(x - camera[0], camera[1] - 1, z - camera[2]);
    if (was === undefined) return d < (PIT_NEAR_M + PIT_FAR_M) / 2;
    return was ? d < PIT_FAR_M : d < PIT_NEAR_M;
}

/**
 * Writes a model instance's matrix (column-major, as three stores it): real size, turned by the
 * item's 2D turn (degrees, clockwise on screen, so +X turns toward +Z) and standing at `center`
 * on `baseY`.
 */
export function writePitModelMatrix(
    out: Float32Array,
    index: number,
    rotationDeg: number,
    center: { x: number; z: number },
    baseY: number,
): void {
    const radians = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const o = index * 16;
    out[o] = cos;
    out[o + 1] = 0;
    out[o + 2] = sin;
    out[o + 3] = 0;
    out[o + 4] = 0;
    out[o + 5] = 1;
    out[o + 6] = 0;
    out[o + 7] = 0;
    out[o + 8] = -sin;
    out[o + 9] = 0;
    out[o + 10] = cos;
    out[o + 11] = 0;
    out[o + 12] = center.x;
    out[o + 13] = baseY;
    out[o + 14] = center.z;
    out[o + 15] = 1;
}
