/**
 * Performer blocks for the 3D View (P4.2, ADR 0002 D-7, design.md §8,
 * ui.md UI-4).
 *
 * - One `InstancedMesh` of cylinders (0.3 m radius, 1.75 m tall) standing on
 *   the ground, one instance per marcher.
 * - Colors and visibility follow the selected page's appearance cascade
 *   (marcher page, tags, section, field theme), the same values the 2D
 *   canvas applies to its marchers.
 * - Selected marchers get an accent ring at their feet: a second instanced
 *   mesh, drawn only for the selected ones.
 * - Matrices update in `useFrame` from the sync store's `showMs()`. When the
 *   editor is paused, the store holds the selected page's end, so the blocks
 *   hold that page like the 2D canvas. Nothing is recomputed while the show
 *   time and the inputs stay the same.
 *
 * Meshes and buffers are rebuilt only when the marcher set changes.
 */
// cspell:ignore metalness
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import {
    Color,
    CylinderGeometry,
    DoubleSide,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedMesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    RingGeometry,
    SRGBColorSpace,
} from "three";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { marcherAppearancesQueryOptions } from "@/hooks/queries/useMarcherAppearances";
import { usePerformerTimelines } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import type { View3dSelection } from "@/view3d/sync/protocol";
import { useView3dSceneStore } from "../sceneStore";
import {
    PERFORMER_HEIGHT,
    PERFORMER_RADIUS,
    RING_INNER_RADIUS,
    RING_OUTER_RADIUS,
    buildPerformerSlots,
    readAccentColor,
    writePerformerLooks,
    writePerformerMatrices,
    writePerformerPositions,
    writeRingMatrices,
} from "./performerData";

const CYLINDER_SEGMENTS = 20;
const RING_SEGMENTS = 32;

interface PerformersProps {
    fieldProperties: FieldProperties;
}

/** Draws every marcher as a block that follows the editor's playback. */
// eslint-disable-next-line max-lines-per-function
export default function Performers({ fieldProperties }: PerformersProps) {
    const queryClient = useQueryClient();
    const quality = useView3dSceneStore((s) => s.quality);
    const selectedPageId = useView3dSyncStore(
        (s) => s.selection.selectedPageId,
    );
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { timelines } = usePerformerTimelines();
    const { data: appearances } = useQuery({
        ...marcherAppearancesQueryOptions(selectedPageId, queryClient),
        // Keep the last page's colors while the next page's load.
        placeholderData: (previous) => previous,
    });

    const marcherIdsKey = useMemo(
        () => (marchers ?? []).map((m) => m.id).join(","),
        [marchers],
    );
    const slots = useMemo(
        () =>
            buildPerformerSlots(
                marcherIdsKey ? marcherIdsKey.split(",").map(Number) : [],
                timelines,
            ),
        [marcherIdsKey, timelines],
    );
    const count = slots.ids.length;

    // Shared geometry and materials, for the component's lifetime.
    const assets = useMemo(() => {
        const body = new CylinderGeometry(
            PERFORMER_RADIUS,
            PERFORMER_RADIUS,
            PERFORMER_HEIGHT,
            CYLINDER_SEGMENTS,
        );
        // Base at the origin, so an instance at y = 0 stands on the ground.
        body.translate(0, PERFORMER_HEIGHT / 2, 0);
        const ring = new RingGeometry(
            RING_INNER_RADIUS,
            RING_OUTER_RADIUS,
            RING_SEGMENTS,
        );
        ring.rotateX(-Math.PI / 2);
        return {
            body,
            ring,
            bodyMaterial: new MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.6,
                metalness: 0,
            }),
            ringMaterial: new MeshBasicMaterial({
                color: new Color(readAccentColor()),
                side: DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2,
            }),
        };
    }, []);
    useEffect(
        () => () => {
            assets.body.dispose();
            assets.ring.dispose();
            assets.bodyMaterial.dispose();
            assets.ringMaterial.dispose();
        },
        [assets],
    );

    // Meshes and per-instance buffers, rebuilt when the marcher count changes.
    const meshes = useMemo(() => {
        if (count === 0) return null;
        const bodies = new InstancedMesh(
            assets.body,
            assets.bodyMaterial,
            count,
        );
        bodies.name = "view3d-performers";
        bodies.instanceMatrix.setUsage(DynamicDrawUsage);
        bodies.instanceColor = new InstancedBufferAttribute(
            new Float32Array(count * 3).fill(1),
            3,
        );
        // Instances move anywhere on the field; skip the stale bounds test.
        bodies.frustumCulled = false;
        const rings = new InstancedMesh(
            assets.ring,
            assets.ringMaterial,
            count,
        );
        rings.name = "view3d-selection-rings";
        rings.instanceMatrix.setUsage(DynamicDrawUsage);
        rings.frustumCulled = false;
        rings.count = 0;
        rings.renderOrder = 1;
        return {
            bodies,
            rings,
            srgb: new Float32Array(count * 3),
            visible: new Uint8Array(count),
            xz: new Float32Array(count * 2),
            placed: new Uint8Array(count),
        };
    }, [assets, count]);
    useEffect(
        () => () => {
            meshes?.bodies.dispose();
            meshes?.rings.dispose();
        },
        [meshes],
    );

    // Shadows follow the scene's quality.
    useEffect(() => {
        if (!meshes) return;
        meshes.bodies.castShadow = quality === "high";
        meshes.bodies.receiveShadow = false;
        meshes.rings.castShadow = false;
        meshes.rings.receiveShadow = false;
    }, [meshes, quality]);

    // Anything here changing forces the next frame to recompute.
    const dirtyRef = useRef(true);
    useEffect(() => {
        dirtyRef.current = true;
    }, [meshes, slots, fieldProperties, appearances]);

    // Colors and visibility, only when the looks change.
    useEffect(() => {
        if (!meshes) return;
        const { bodies, srgb, visible } = meshes;
        writePerformerLooks(
            slots,
            appearances,
            fieldProperties.theme,
            srgb,
            visible,
        );
        const color = new Color();
        const target = bodies.instanceColor!.array as Float32Array;
        for (let i = 0; i < count; i++) {
            color.setRGB(
                srgb[i * 3],
                srgb[i * 3 + 1],
                srgb[i * 3 + 2],
                SRGBColorSpace,
            );
            target[i * 3] = color.r;
            target[i * 3 + 1] = color.g;
            target[i * 3 + 2] = color.b;
        }
        bodies.instanceColor!.needsUpdate = true;
    }, [meshes, slots, appearances, fieldProperties, count]);

    const frameRef = useRef({
        lastMs: Number.NaN,
        selection: null as View3dSelection | null,
        selected: new Set<number>(),
    });
    useFrame(() => {
        if (!meshes) return;
        const sync = useView3dSyncStore.getState();
        const ms = sync.showMs();
        const frame = frameRef.current;
        const selectionChanged = sync.selection !== frame.selection;
        if (selectionChanged) {
            frame.selection = sync.selection;
            frame.selected = new Set(sync.selection.selectedMarcherIds);
        }
        const moved = dirtyRef.current || ms !== frame.lastMs;
        if (!moved && !selectionChanged) return;

        const { bodies, rings, visible, xz, placed } = meshes;
        if (moved) {
            writePerformerPositions(
                slots,
                ms,
                fieldProperties,
                visible,
                xz,
                placed,
            );
            writePerformerMatrices(
                count,
                xz,
                placed,
                bodies.instanceMatrix.array as Float32Array,
            );
            bodies.instanceMatrix.needsUpdate = true;
        }
        const ringCount = writeRingMatrices(
            slots,
            frame.selected,
            xz,
            placed,
            rings.instanceMatrix.array as Float32Array,
        );
        // With no selection there is nothing to upload (P5.1).
        if (ringCount > 0 || rings.count > 0)
            rings.instanceMatrix.needsUpdate = true;
        rings.count = ringCount;
        frame.lastMs = ms;
        dirtyRef.current = false;
    });

    if (!meshes) return null;
    return (
        <>
            <primitive object={meshes.bodies} />
            <primitive object={meshes.rings} />
        </>
    );
}
