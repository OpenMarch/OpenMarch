/**
 * Loads, bakes and builds the 3D View's marchers for the current show
 * (ADR 0010 D-7). Returns null until they are ready; the caller keeps the
 * cylinders until then.
 */
import { prepBase } from "./platformClip";
import { plainRow } from "@/view3d/core/marchers/planner";
import { useEffect, useMemo, useState } from "react";
import type { AnimationClip } from "three";
import type { Manifest } from "@/view3d/render/step-blend.js";
import type { ChannelBake } from "@/view3d/render/channelBake";
import {
    classSuffix,
    type BodyType,
    type HeightClass,
} from "@/view3d/core/marchers/looks";
import {
    joinManifests,
    loadBodies,
    loadClassClips,
    loadCrabClips,
    loadCrabManifest,
    loadManifest,
    type LoadedBody,
} from "./marcherAssets";
import {
    MarcherBodies,
    bakeForBodies,
    type MarcherQuality,
    type MarcherSlotLook,
    type StepOffFoot,
} from "./marcherBodies";
import { hornRowSpec } from "./hornRows";
import { mirrorClip, shiftLoop, stillClip } from "./mirrorClip";

/**
 * Clips by name, with the ones a manifest marks `mirror_of` or `still_of`
 * made the first time they're asked for: crab right's loops and halts are
 * crab left's mirrored, the loops a count on (`shift`), so they ship once,
 * and a stop-and-go's still count holds its stop's last pose.
 */
export class ClipSet extends Map<string, AnimationClip> {
    private readonly mirrors = new Map<string, { of: string; shift: number }>();
    private readonly stills = new Map<string, string>();

    constructor(clips: Iterable<AnimationClip>, manifest: Manifest | null) {
        super();
        for (const c of clips) this.set(c.name, c);
        const entries = manifest
            ? Array.isArray(manifest)
                ? manifest
                : manifest.clips
            : [];
        for (const e of entries)
            if (typeof e.mirror_of === "string")
                this.mirrors.set(e.name, {
                    of: e.mirror_of,
                    shift: typeof e.shift === "number" ? e.shift : 0,
                });
            else if (typeof e.still_of === "string")
                this.stills.set(e.name, e.still_of);
    }

    override get(name: string): AnimationClip | undefined {
        const have = super.get(name);
        if (have) return have;
        const still = this.stills.get(name);
        if (still !== undefined) {
            const source = this.get(still);
            if (!source) return undefined;
            const clip = stillClip(source, name);
            this.set(name, clip);
            return clip;
        }
        const mirror = this.mirrors.get(name);
        const source = mirror && super.get(mirror.of);
        if (!mirror || !source) return undefined;
        const mirrored = mirrorClip(source, name);
        const clip = mirror.shift ? shiftLoop(mirrored, name) : mirrored;
        this.set(name, clip);
        return clip;
    }
}

export interface MarcherAssets {
    bodies: Map<BodyType, LoadedBody>;
    manifest: Manifest;
    /** Clips by name, for every class loaded so far. */
    clips: Map<string, AnimationClip>;
    classes: ReadonlySet<HeightClass>;
    /** Which request these assets answer: the classes, and whether the crab clips came too. */
    key: string;
}

/**
 * The bodies, the manifest and the clips of `classes`, once loaded. `crab`
 * adds the crab step's clips, for a show with percussion.
 */
export function useMarcherAssets(
    classes: readonly HeightClass[],
    crab = false,
): MarcherAssets | null {
    const classKey = [...new Set(classes)].sort().join(",");
    const key = `${classKey}|${crab ? "crab" : ""}`;
    const [assets, setAssets] = useState<MarcherAssets | null>(null);
    useEffect(() => {
        let live = true;
        const wanted = classKey
            ? (classKey.split(",").map(Number) as HeightClass[])
            : [];
        Promise.all([
            loadBodies(),
            loadManifest(),
            Promise.all(wanted.map(loadClassClips)),
            crab ? loadCrabManifest() : null,
            crab ? Promise.all(wanted.map(loadCrabClips)) : [],
        ])
            .then(([bodies, manifest, perClass, crabManifest, crabClips]) => {
                if (!live) return;
                const clips = new ClipSet(
                    [...perClass, ...crabClips].flat(),
                    crabManifest,
                );
                setAssets({
                    bodies,
                    manifest: joinManifests(manifest, crabManifest),
                    clips,
                    classes: new Set(wanted),
                    key,
                });
            })
            .catch((e: unknown) => {
                // eslint-disable-next-line no-console -- the cylinders stay; say why
                console.error("3D View: could not load the marchers", e);
            });
        return () => {
            live = false;
        };
    }, [key, classKey, crab]);
    return assets?.key === key ? assets : null;
}

/** A clip of a height class by its base name, e.g. ("attention", 1.05). */
export const clipName = (base: string, h: HeightClass) =>
    `${base}${classSuffix(h)}`;

/**
 * Bakes `names` (clip names with their class suffix) as Feet rows and
 * `hornRows` (hold and transition rows, `hornRows.ts`) as Horn/Equipment
 * rows, and builds the meshes. Rebuilt when the assets, rows, looks or
 * quality change; the previous set and its bake texture are disposed.
 */
export function useMarcherBodies(
    assets: MarcherAssets | null,
    names: readonly string[],
    looks: readonly MarcherSlotLook[] | null,
    quality: MarcherQuality,
    foot: StepOffFoot = "left",
    /** The Feet rows marchers play; only these are baked. All when omitted. */
    rows?: readonly string[],
    /** The Horn/Equipment rows marchers play. */
    hornRows: readonly string[] = [],
): MarcherBodies | null {
    const namesKey = [...new Set(names)].sort().join(",");
    const rowsKey = rows ? [...new Set(rows)].sort().join("|") : null;
    const hornKey = [...new Set(hornRows)].sort().join("|");
    const bake = useMemo<ChannelBake | null>(() => {
        if (!assets || !namesKey) return null;
        const clips: Record<string, AnimationClip> = {};
        for (const n of namesKey.split(",")) {
            // a prep or right-foot row bakes from its base clip
            // (`clipForBake` lifts or mirrors it)
            const clip = assets.clips.get(prepBase(plainRow(n).row));
            if (!clip) throw new Error(`3D View: clip ${n} isn't loaded`);
            clips[n] = clip;
        }
        const skeleton = assets.bodies.values().next().value?.mesh.skeleton;
        const horn = skeleton
            ? (hornKey ? hornKey.split("|") : [])
                  .map((name) => hornRowSpec(name, skeleton))
                  .filter((r) => r !== null)
            : [];
        const t0 = performance.now();
        const baked = bakeForBodies(
            assets.bodies,
            clips,
            foot,
            horn,
            rowsKey === null ? undefined : new Set(rowsKey.split("|")),
        );
        const { feet, horn: hornCh } = baked.layout.channels;
        // eslint-disable-next-line no-console -- the bake size and time are the main cost to watch
        console.info(
            `3D View: baked ${Object.keys(baked.rows).length} rows ` +
                `(Feet ${feet.rows} texture rows, Horn ${hornCh.rows}), ` +
                `${baked.layout.width} texels wide, ` +
                `${(baked.bytes / 1e6).toFixed(1)} MB, in ` +
                `${(performance.now() - t0).toFixed(0)} ms`,
        );
        return baked;
    }, [assets, namesKey, foot, rowsKey, hornKey]);
    useEffect(() => () => bake?.texture.dispose(), [bake]);

    const bodies = useMemo(() => {
        if (!assets || !bake || !looks || looks.length === 0) return null;
        return new MarcherBodies(assets.bodies, bake, looks, quality);
    }, [assets, bake, looks, quality]);
    useEffect(() => () => bodies?.dispose(), [bodies]);
    return bodies;
}
