/**
 * Props in the 3D View as plain blocks (convergence P4, inventory row 6a):
 * each prop's Outline footprint extruded to its height, matte, in its color
 * (`items.color`) or a neutral grey, at its timeline position and turn. No
 * textures or artwork. A prop hidden on the field in the editor (the Props
 * panel's "Hide on the field", relayed on `view3d:hidden-props`) isn't drawn,
 * nor is an item drawn as its built-in model (`PitModels.tsx`).
 *
 * - One `InstancedMesh` per footprint the show uses (`propShapes`): every
 *   rectangle prop shares one, every circle another, each custom outline its
 *   own. A show with a handful of props costs a handful of draws.
 * - Matrices update in `useFrame` from the sync store's `showMs()`, at the
 *   same show time and beat the 2D field draws, so props move and turn with
 *   the timeline while playing and scrubbing. Nothing is recomputed while the
 *   show time and the inputs stay the same.
 * - Shadows follow the scene's quality, like the performers.
 * - A platform or obstacle stands on the platform under its center (C4.5,
 *   `propLayout.ts`), from the same layout the performers stand on.
 *
 * Meshes are rebuilt only when the set of footprints or the prop count
 * changes; an Outline edit that keeps them only refreshes the matrices.
 */
// cspell:ignore metalness
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import {
    Color,
    DynamicDrawUsage,
    ExtrudeGeometry,
    InstancedBufferAttribute,
    InstancedMesh,
    MeshStandardMaterial,
    SRGBColorSpace,
    Shape,
    Vector2,
} from "three";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
} from "@/hooks/queries/useItems";
import {
    beatIndexesById,
    itemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useShowProps } from "@/hooks/useShowProps";
import { propColorsByMarcher } from "@/items/propColor";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import {
    cachedShapeKey,
    createPropBlockFrame,
    placePropBlocks,
    PROP_BLOCK_COLOR,
    propShapes,
    propTracks,
    type BlockRgb,
    type PropShape,
} from "@/view3d/core/props/propBlocks";
import { useShowPositions } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { useView3dSceneStore } from "../sceneStore";
import { requestDraw } from "../drawWake";
import { propSolidsAt } from "./performerLift";
import { modelsByMarcher } from "@/view3d/core/pit/pitModels";
import { usePitModelFailures } from "./pitModelAssets";

/**
 * A unit footprint extruded 1 m up, base on y = 0. The shape is drawn in
 * (x, -field y) so that turning it upright puts field y on +Z.
 */
function footprintGeometry(shape: PropShape): ExtrudeGeometry {
    const outline = new Shape(
        shape.footprint.map((p) => new Vector2(p.x, -p.y)),
    );
    const geometry = new ExtrudeGeometry(outline, {
        depth: 1,
        bevelEnabled: false,
        curveSegments: 1,
    });
    // Extruded along +Z: stand it up so the extrusion is +Y
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

/** sRGB 0–255 to the linear floats three's instance colors take. */
function linearRgb(r: number, g: number, b: number): BlockRgb {
    const color = new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
    return [color.r, color.g, color.b];
}

const GREY = new Color(PROP_BLOCK_COLOR);
const DEFAULT_RGB: BlockRgb = [GREY.r, GREY.g, GREY.b];

interface PropBlocksProps {
    fieldProperties: FieldProperties;
}

/** Draws every prop as a block that follows the editor's playback. */
export default function PropBlocks({ fieldProperties }: PropBlocksProps) {
    const quality = useView3dSceneStore((s) => s.quality);
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: geometry } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects();
    const { positions } = useShowPositions();
    const hiddenItemIds = useView3dSyncStore((s) => s.hiddenItemIds);
    // The props as stood, for the platform each block stands on (C4.5)
    const { props: showProps } = useShowProps(hiddenItemIds);
    const stacks = useMemo(
        () => showProps.some((p) => p.surface === "platform"),
        [showProps],
    );

    const failures = usePitModelFailures();

    const tracks = useMemo(() => {
        const rows = items ?? [];
        const colors = propColorsByMarcher(rows);
        // Items with a built-in model draw as it instead (`PitModels.tsx`)
        const models = modelsByMarcher(rows, failures);
        return propTracks(
            itemOutlineChanges({
                items: rows,
                geometry: geometry ?? [],
                beatIndexes: beatIndexesById(beats),
            }),
            {
                hidden: new Set(
                    rows
                        .filter(
                            (item) =>
                                hiddenItemIds.has(item.id) ||
                                models.has(item.marcher_id),
                        )
                        .map((item) => item.marcher_id),
                ),
                colorOf: (marcherId) => {
                    const color = colors.get(marcherId);
                    return color ? linearRgb(color.r, color.g, color.b) : null;
                },
            },
        );
    }, [items, geometry, beats, hiddenItemIds, failures]);
    const shapes = useMemo(() => propShapes(tracks), [tracks]);
    // Keyed by the parsed outline objects, which every refetch replaces, so a
    // fresh cache per tracks keeps the old ones from piling up.
    const keyOf = useMemo(() => {
        void tracks;
        return cachedShapeKey();
    }, [tracks]);
    const shapesKey = shapes.map((s) => s.key).join("\n");
    const propCount = tracks.length;

    const material = useMemo(
        () =>
            new MeshStandardMaterial({
                // Each instance's color is the whole color
                color: 0xffffff,
                roughness: 0.9,
                metalness: 0,
            }),
        [],
    );
    useEffect(() => () => material.dispose(), [material]);

    // Meshes and buffers, rebuilt when the footprints or prop count change.
    const meshes = useMemo(() => {
        if (propCount === 0 || shapes.length === 0) return null;
        const frame = createPropBlockFrame(
            shapes.map((s) => s.key),
            propCount,
            DEFAULT_RGB,
        );
        const list = shapes.map((shape, k) => {
            const mesh = new InstancedMesh(
                footprintGeometry(shape),
                material,
                propCount,
            );
            mesh.name = "view3d-props";
            // The frame writes straight into the instance matrices
            mesh.instanceMatrix = new InstancedBufferAttribute(
                frame.matrices[k],
                16,
            );
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.instanceColor = new InstancedBufferAttribute(
                frame.colors[k],
                3,
            );
            mesh.instanceColor.setUsage(DynamicDrawUsage);
            // Props move anywhere on the field; skip the stale bounds test.
            mesh.frustumCulled = false;
            mesh.count = 0;
            return mesh;
        });
        return { frame, list };
        // shapesKey stands for shapes: same footprints, same meshes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shapesKey, propCount, material]);
    useEffect(
        () => () =>
            meshes?.list.forEach((mesh) => {
                mesh.geometry.dispose();
                mesh.dispose();
            }),
        [meshes],
    );

    useEffect(() => {
        meshes?.list.forEach((mesh) => {
            mesh.castShadow = quality === "high";
            mesh.receiveShadow = quality === "high";
        });
    }, [meshes, quality]);

    // Anything here changing forces the next frame to recompute.
    const dirtyRef = useRef(true);
    useEffect(() => {
        dirtyRef.current = true;
        requestDraw(1000);
    }, [meshes, tracks, positions, fieldProperties, showProps]);

    const lastMsRef = useRef(Number.NaN);
    useFrame(() => {
        if (!meshes) return;
        const ms = useView3dSyncStore.getState().showMs();
        if (!dirtyRef.current && ms === lastMsRef.current) return;
        const { frame, list } = meshes;
        if (positions) {
            let liftOf: ((marcherId: number) => number) | undefined;
            if (stacks) {
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
            placePropBlocks(
                tracks,
                positions.beatAt(ms),
                (marcherId, out) =>
                    positions.positionInto(marcherId, ms, fieldProperties, out),
                frame,
                keyOf,
                FIELD_SURFACE_Y,
                liftOf,
            );
        } else frame.counts.fill(0);
        list.forEach((mesh, k) => {
            const count = frame.counts[k];
            if (count > 0 || mesh.count > 0) {
                mesh.instanceMatrix.needsUpdate = true;
                mesh.instanceColor!.needsUpdate = true;
            }
            mesh.count = count;
        });
        lastMsRef.current = ms;
        dirtyRef.current = false;
    });

    if (!meshes) return null;
    return (
        <>
            {meshes.list.map((mesh) => (
                <primitive key={mesh.uuid} object={mesh} />
            ))}
        </>
    );
}
