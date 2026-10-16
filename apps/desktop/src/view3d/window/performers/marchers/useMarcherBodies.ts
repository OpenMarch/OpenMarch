/**
 * Loads, bakes and builds the 3D View's marchers for the current show
 * (ADR 0002 D-7). Returns null until they are ready; the caller keeps the
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
    loadBodies,
    loadClassClips,
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

export interface MarcherAssets {
    bodies: Map<BodyType, LoadedBody>;
    manifest: Manifest;
    /** Clips by name, for every class loaded so far. */
    clips: Map<string, AnimationClip>;
    classes: ReadonlySet<HeightClass>;
}

/** The bodies, the manifest and the clips of `classes`, once loaded. */
export function useMarcherAssets(
    classes: readonly HeightClass[],
): MarcherAssets | null {
    const key = [...new Set(classes)].sort().join(",");
    const [assets, setAssets] = useState<MarcherAssets | null>(null);
    useEffect(() => {
        let live = true;
        const wanted = key ? (key.split(",").map(Number) as HeightClass[]) : [];
        Promise.all([
            loadBodies(),
            loadManifest(),
            Promise.all(wanted.map(loadClassClips)),
        ])
            .then(([bodies, manifest, perClass]) => {
                if (!live) return;
                const clips = new Map<string, AnimationClip>();
                for (const list of perClass)
                    for (const c of list) clips.set(c.name, c);
                setAssets({
                    bodies,
                    manifest,
                    clips,
                    classes: new Set(wanted),
                });
            })
            .catch((e: unknown) => {
                // eslint-disable-next-line no-console -- the cylinders stay; say why
                console.error("3D View: could not load the marchers", e);
            });
        return () => {
            live = false;
        };
    }, [key]);
    return assets && [...assets.classes].sort().join(",") === key
        ? assets
        : null;
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
