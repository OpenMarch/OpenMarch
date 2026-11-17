/**
 * Items with a model in the 3D View: the built-ins (docs/3d/instruments.md §6: pit instruments,
 * speakers, the mixer and podiums) at real size, and imported models (fork #1000) sized to their
 * Outline, one factor for all three sides. Each draws where the item's Outline is, turned as it
 * turns. Items without a model, with one this app doesn't ship or the show doesn't have, or with
 * one that failed to load draw as blocks (`PropBlocks.tsx`); an imported one also draws as a block
 * until it has loaded.
 *
 * - Each model loads when the show first uses it, and every item drawn as it shares its geometry
 *   and materials: one `InstancedMesh` per part (at most six for a built-in), so a Large pit's six
 *   marimbas are a handful of draws. A built-in stays loaded; an imported model leaves the GPU
 *   when no item uses it any more (`libraryModelAssets.ts`).
 * - At high quality each model has two tiers, detailed near the camera and its distant version
 *   beyond (a built-in's `-low`, an imported model's `distant` part), switched with hysteresis as
 *   the instruments are (`hornSet.ts`); at low quality only the distant version draws. While one
 *   version is still loading the other draws at every distance, so a model already drawn stays
 *   drawn when the quality changes.
 * - Matrices update in `useFrame` from the sync store's `showMs()`, like the blocks, and also
 *   when the camera moves while there are two tiers. A model stands on the platform under it,
 *   from the same layout the blocks and performers use.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { itemGeometryAt, type FieldProperties } from "@openmarch/core";
import {
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedMesh,
} from "three";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
} from "@/hooks/queries/useItems";
import { showAssetsQueryOptions } from "@/hooks/queries/useShowAssets";
import {
    libraryModels,
    modelScale,
    type LibraryModel,
} from "@/showAssets/libraryModels";
import {
    beatIndexesById,
    itemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useShowProps } from "@/hooks/useShowProps";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import type { Detail } from "@/view3d/core/instruments/model";
import {
    isNearPitItem,
    modelsByMarcher,
    pitModelName,
    writePitModelMatrix,
} from "@/view3d/core/pit/pitModels";
import { propTracks, type PropTrack } from "@/view3d/core/props/propBlocks";
import { useShowPositions } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import type { WorldPoint } from "@openmarch/core";
import { useView3dSceneStore } from "../sceneStore";
import { requestDraw } from "../drawWake";
import {
    loadPitModel,
    logUnknownPitModel,
    markPitModelFailed,
    usePitModelFailures,
    type PitPart,
} from "./pitModelAssets";
import { propSolidsAt } from "./performerLift";
import {
    acquireLibraryModel,
    holdChanges,
    LibraryModelReleased,
    releaseLibraryModel,
    setDrawnLibraryModels,
} from "./libraryModelAssets";

interface PitModelsProps {
    fieldProperties: FieldProperties;
}

/** One version of a model: a mesh per part, all reading one set of instance matrices. */
interface Tier {
    meshes: InstancedMesh[];
    matrices: Float32Array;
    attribute: InstancedBufferAttribute;
}

/** Every item drawn as one model. */
interface ModelGroup {
    /** A built-in's name, or an imported model's `items.model` value */
    name: string;
    /** An imported model's real footprint, which its Outline scales; null for a built-in */
    sizeM: { width: number; depth: number } | null;
    tracks: PropTrack[];
    /** Detailed first when there are two */
    tiers: Tier[];
    /** Per marchers row: whether it drew in detail last frame */
    near: Map<number, boolean>;
}

const key = (name: string, detail: Detail) => `${name}|${detail}`;

/** Draws every item that names a model, following the editor's playback. */
export default function PitModels({ fieldProperties }: PitModelsProps) {
    const quality = useView3dSceneStore((s) => s.quality);
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: geometry } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects();
    const { positions } = useShowPositions();
    const hiddenItemIds = useView3dSyncStore((s) => s.hiddenItemIds);
    const { props: showProps } = useShowProps(hiddenItemIds);
    const stacks = useMemo(
        () => showProps.some((p) => p.surface === "platform"),
        [showProps],
    );
    const failures = usePitModelFailures();
    const { data: assets } = useQuery(showAssetsQueryOptions());
    // Kept while its models are the same, so adding artwork doesn't rebuild every model's meshes
    const libraryRef = useRef<ReadonlyMap<string, LibraryModel>>(new Map());
    const library = useMemo(() => {
        const next = libraryModels(assets);
        if (!sameLibrary(libraryRef.current, next)) libraryRef.current = next;
        return libraryRef.current;
    }, [assets]);

    const details: Detail[] = useMemo(
        () => (quality === "high" ? ["high", "low"] : ["low"]),
        [quality],
    );

    // Each item drawn as a model, by marchers row, with its Outline changes
    const byName = useMemo(() => {
        const rows = items ?? [];
        const models = modelsByMarcher(rows, failures);
        for (const item of rows) {
            if (!item.model || pitModelName(item.model) !== null) continue;
            // Until the show's assets have been read, an imported model isn't unknown
            if (!library.has(item.model)) {
                if (assets) logUnknownPitModel(item.model);
            } else if (!failures.has(item.model))
                models.set(item.marcher_id, item.model);
        }
        const hidden = new Set(
            rows
                .filter(
                    (item) =>
                        hiddenItemIds.has(item.id) ||
                        !models.has(item.marcher_id),
                )
                .map((item) => item.marcher_id),
        );
        const tracks = propTracks(
            itemOutlineChanges({
                items: rows,
                geometry: geometry ?? [],
                beatIndexes: beatIndexesById(beats),
            }),
            { hidden },
        );
        const out = new Map<string, PropTrack[]>();
        for (const track of tracks) {
            const name = models.get(track.marcherId)!;
            const list = out.get(name);
            if (list) list.push(track);
            else out.set(name, [track]);
        }
        return out;
    }, [items, geometry, beats, hiddenItemIds, failures, library, assets]);

    // The loaded versions of the models in use, by name and detail
    const [loaded, setLoaded] = useState<ReadonlyMap<string, PitPart[]>>(
        () => new Map(),
    );
    const namesKey = [...byName.keys()].sort().join("\n");
    // The imported models' parts this view holds, by `key`: each is let go when no item needs it
    const held = useRef(new Map<string, string>());
    useEffect(() => {
        const run = { live: true };
        const needed = new Map<string, string>();
        for (const name of namesKey ? namesKey.split("\n") : [])
            for (const detail of details) {
                const k = key(name, detail);
                const imported = library.get(name);
                if (imported) {
                    needed.set(
                        k,
                        detail === "high"
                            ? imported.modelHash
                            : imported.distantHash,
                    );
                    continue;
                }
                if (loaded.has(k)) continue;
                loadPitModel(name, detail).then(
                    (parts) => {
                        if (!run.live) return;
                        setLoaded((before) =>
                            new Map(before).set(key(name, detail), parts),
                        );
                        requestDraw(1000);
                    },
                    (error: unknown) => markPitModelFailed(name, error),
                );
            }
        // Hold the imported parts the items need, and let go of the rest: they leave the GPU
        const { acquire, release } = holdChanges(held.current, needed);
        const dropped: string[] = [];
        for (const [k, hash] of release) {
            held.current.delete(k);
            releaseLibraryModel(hash);
            dropped.push(k);
        }
        for (const [k, hash] of acquire) {
            const name = k.slice(0, k.lastIndexOf("|"));
            held.current.set(k, hash);
            acquireLibraryModel(hash).then(
                (parts) => {
                    // Still wanted, and this view still mounted
                    if (held.current.get(k) !== hash) return;
                    setLoaded((before) => new Map(before).set(k, parts));
                    requestDraw(1000);
                },
                (error: unknown) => {
                    if (error instanceof LibraryModelReleased) return;
                    markPitModelFailed(name, error);
                },
            );
        }
        if (dropped.length > 0)
            setLoaded((before) => {
                const next = new Map(before);
                for (const k of dropped) next.delete(k);
                return next;
            });
        return () => {
            run.live = false;
        };
        // `loaded` only skips loads already done; every load is cached anyway
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [namesKey, details, library]);
    useEffect(() => {
        const holds = held.current;
        return () => {
            for (const hash of holds.values()) releaseLibraryModel(hash);
            holds.clear();
        };
    }, []);

    // Meshes for every model whose versions have loaded
    const groups = useMemo(() => {
        const out: ModelGroup[] = [];
        for (const [name, tracks] of byName) {
            // The versions loaded so far: with one of two, it draws at every distance
            const drawn = details.filter((d) => loaded.has(key(name, d)));
            if (drawn.length === 0) continue;
            const versions = drawn.map((d) => loaded.get(key(name, d))!);
            const sizeM = library.get(name)?.sidecar.sizeM ?? null;
            const count = tracks.length;
            const tiers = versions.map((parts, k): Tier => {
                const matrices = new Float32Array(count * 16);
                const attribute = new InstancedBufferAttribute(matrices, 16);
                attribute.setUsage(DynamicDrawUsage);
                const meshes = parts!.map((part) => {
                    const mesh = new InstancedMesh(
                        part.geometry,
                        part.material,
                        count,
                    );
                    mesh.name = sizeM
                        ? `view3d-imported-${name}-${drawn[k]}`
                        : `view3d-pit-${name}-${drawn[k]}`;
                    // Every part of a version reads the same instances
                    mesh.instanceMatrix = attribute;
                    // Items stand anywhere on the field; skip the stale bounds test.
                    mesh.frustumCulled = false;
                    mesh.count = 0;
                    return mesh;
                });
                return { meshes, matrices, attribute };
            });
            out.push({ name, sizeM, tracks, tiers, near: new Map() });
        }
        return out;
    }, [byName, details, loaded, library]);
    // The geometry and materials are the cache's; only the instances are ours
    useEffect(
        () => () =>
            groups.forEach((g) =>
                g.tiers.forEach((t) => t.meshes.forEach((m) => m.dispose())),
            ),
        [groups],
    );

    // Imported models drawn now stop drawing as blocks, before the next frame draws either
    useLayoutEffect(() => {
        setDrawnLibraryModels(
            new Set(groups.filter((g) => g.sizeM).map((g) => g.name)),
        );
    }, [groups]);
    useEffect(() => () => setDrawnLibraryModels(new Set()), []);

    useEffect(() => {
        for (const g of groups)
            for (const t of g.tiers)
                for (const mesh of t.meshes) {
                    mesh.castShadow = quality === "high";
                    mesh.receiveShadow = quality === "high";
                }
    }, [groups, quality]);

    // Anything here changing forces the next frame to recompute.
    const dirtyRef = useRef(true);
    useEffect(() => {
        dirtyRef.current = true;
        requestDraw(1000);
    }, [groups, positions, fieldProperties, showProps]);

    const lastMsRef = useRef(Number.NaN);
    const lastCamera = useRef<[number, number, number]>([NaN, NaN, NaN]);
    useFrame(({ camera }) => {
        if (groups.length === 0) return;
        const ms = useView3dSyncStore.getState().showMs();
        const p = camera.position;
        const cam = lastCamera.current;
        const moved =
            details.length > 1 &&
            (p.x !== cam[0] || p.y !== cam[1] || p.z !== cam[2]);
        if (!dirtyRef.current && !moved && ms === lastMsRef.current) return;
        cam[0] = p.x;
        cam[1] = p.y;
        cam[2] = p.z;

        let liftOf: ((marcherId: number) => number) | undefined;
        if (positions && stacks) {
            const bases = new Map<number, number>();
            for (const solid of propSolidsAt({
                props: showProps,
                positions,
                ms,
                fieldProperties,
            }))
                bases.set(solid.id, solid.base);
            liftOf = (marcherId) => bases.get(marcherId) ?? 0;
        }
        const beat = positions?.beatAt(ms) ?? 0;
        for (const g of groups) {
            const counts = g.tiers.map(() => 0);
            if (positions)
                for (const track of g.tracks) {
                    const at = itemGeometryAt(track.changes, beat);
                    if (
                        !at ||
                        !positions.positionInto(
                            track.marcherId,
                            ms,
                            fieldProperties,
                            scratch,
                        )
                    )
                        continue;
                    let tier = 0;
                    if (g.tiers.length > 1) {
                        const near = isNearPitItem(
                            scratch.x,
                            scratch.z,
                            cam,
                            g.near.get(track.marcherId),
                        );
                        g.near.set(track.marcherId, near);
                        tier = near ? 0 : 1;
                    }
                    writePitModelMatrix(
                        g.tiers[tier].matrices,
                        counts[tier]++,
                        at.rotation,
                        scratch,
                        FIELD_SURFACE_Y + (liftOf?.(track.marcherId) ?? 0),
                        g.sizeM ? modelScale(at, g.sizeM) : 1,
                    );
                }
            g.tiers.forEach((t, k) => {
                t.attribute.needsUpdate = true;
                for (const mesh of t.meshes) mesh.count = counts[k];
            });
        }
        lastMsRef.current = ms;
        dirtyRef.current = false;
    });

    if (groups.length === 0) return null;
    return (
        <>
            {groups.flatMap((g) =>
                g.tiers.flatMap((t) =>
                    t.meshes.map((mesh) => (
                        <primitive key={mesh.uuid} object={mesh} />
                    )),
                ),
            )}
        </>
    );
}

const scratch: WorldPoint = { x: 0, z: 0 };

/** Whether two sets of imported models name the same parts. */
function sameLibrary(
    a: ReadonlyMap<string, LibraryModel>,
    b: ReadonlyMap<string, LibraryModel>,
): boolean {
    if (a.size !== b.size) return false;
    for (const [value, model] of b) {
        const other = a.get(value);
        if (
            !other ||
            other.modelHash !== model.modelHash ||
            other.distantHash !== model.distantHash
        )
            return false;
    }
    return true;
}
