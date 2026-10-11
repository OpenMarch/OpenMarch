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
import { registerPicker } from "../scenePick";
import { pickMarchers } from "../camera/inputMath";
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
import { allSectionAppearancesQueryOptions } from "@/hooks/queries/useSectionAppearances";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { marcherHeading } from "@/view3d/core/marchers/facing";
import {
    buildCountClock,
    countAt,
    msAtCount,
} from "@/view3d/core/marchers/countClock";
import { plannedClips, eventRows } from "@/view3d/core/marchers/planner";
import {
    defaultPerformerBody,
    bassOptions,
    sectionUniform,
} from "@/view3d/core/marchers/looks";
import { usePerformerTimelines } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import type { View3dSelection } from "@/view3d/sync/protocol";
import { useView3dSceneStore } from "../sceneStore";
import { requestDraw } from "../drawWake";
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
import type { MarcherSlotLook } from "./marchers/marcherBodies";
import {
    MarcherMotion,
    planShow,
    STEP_AHEAD,
    type ShowPlans,
} from "./marchers/marcherMotion";
import {
    clipName,
    useMarcherAssets,
    useMarcherBodies,
} from "./marchers/useMarcherBodies";
import { clipsToLoad, rowKey, slotHoldId } from "./marchers/marcherBodies";

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
    const hornState = useView3dSceneStore((s) => s.hornState);
    const guardEquipment = useView3dSceneStore((s) => s.guardEquipment);
    const stepOffFoot = useView3dSceneStore((s) => s.stepOffFoot);
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

    // om-pose marchers (ADR 0002 D-7); the cylinders stand in until they load.
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    // Keyed on what a look depends on (marcher IDs, sections, section fills),
    // not on the timelines: a drill edit must not rebuild every mesh.
    const looksKey = useMemo(() => {
        if (!marchers || !sectionAppearances) return null;
        const sectionById = new Map(marchers.map((m) => [m.id, m.section]));
        const fillBySection = new Map(
            sectionAppearances.map((a) => [a.section, a.fill_color]),
        );
        return JSON.stringify(
            slots.ids.map((id) => {
                const section = sectionById.get(id) ?? "";
                return [id, section, fillBySection.get(section) ?? null];
            }),
        );
    }, [marchers, sectionAppearances, slots.ids]);
    const marcherLooks = useMemo<MarcherSlotLook[] | null>(() => {
        if (!looksKey) return null;
        const rows = JSON.parse(looksKey) as [
            number,
            string,
            Parameters<typeof sectionUniform>[1],
        ][];
        const options = bassOptions(
            rows.map((r) => r[0]),
            rows.map((r) => r[1]),
        );
        return rows.map(([id, section, fill], i) => ({
            // varied heights at high quality; one height (one bake class) at low
            body: defaultPerformerBody(id, { varyHeight: quality === "high" }),
            uniform: sectionUniform(
                section,
                fill,
                hornState,
                options[i],
                guardEquipment === "section" ? undefined : guardEquipment,
            ),
        }));
    }, [looksKey, quality, hornState, guardEquipment]);
    const heightClasses = useMemo(
        () => [...new Set((marcherLooks ?? []).map((l) => l.body.heightClass))],
        [marcherLooks],
    );
    const marcherAssets = useMarcherAssets(heightClasses);
    // The count clock and every marcher's clip plan for the whole show.
    const { beats } = useTimingObjects();
    const clock = useMemo(() => buildCountClock(beats), [beats]);
    const previousPlans = useRef<ShowPlans | null>(null);
    const showPlans = useMemo(() => {
        if (!marcherAssets || !marcherLooks) return null;
        const planned = planShow(
            slots.ids,
            slots.timelines,
            marcherLooks.map((l) => l.body.heightClass),
            clock,
            fieldProperties,
            marcherAssets.manifest,
            marcherHeading(),
            previousPlans.current,
        );
        previousPlans.current = planned;
        // eslint-disable-next-line no-console -- planning time is a cost to watch at 2,000 marchers
        console.info(
            `3D View: planned ${planned.replanned} of ` +
                `${planned.plans.length} marchers over ` +
                `${clock.counts} counts in ${planned.planMs.toFixed(0)} ms`,
        );
        return planned;
    }, [marcherAssets, marcherLooks, slots, clock, fieldProperties]);
    const clipNames = useMemo(() => {
        const names = plannedClips(
            (showPlans?.plans ?? []).filter((p) => p !== null),
        );
        for (const h of heightClasses) names.add(clipName("attention", h));
        // on the right foot every row is baked from its mirrored partner
        return clipsToLoad([...names], stepOffFoot);
    }, [showPlans, heightClasses, stepOffFoot]);
    // Only the rows some marcher plays: its planned clips in its own hold,
    // and attention for its height class.
    const bakeRows = useMemo(() => {
        if (!marcherLooks) return undefined;
        const out = new Set<string>();
        marcherLooks.forEach((look, i) => {
            const hold = slotHoldId(look.uniform);
            out.add(rowKey(clipName("attention", look.body.heightClass), hold));
            const plan = showPlans?.plans[i];
            if (!plan) return;
            for (const e of plan.events)
                for (const c of eventRows(e)) if (c) out.add(rowKey(c, hold));
        });
        return [...out];
    }, [marcherLooks, showPlans]);
    const marcherBodies = useMarcherBodies(
        marcherAssets,
        clipNames,
        marcherLooks,
        quality,
        stepOffFoot,
        bakeRows,
    );
    // Meshes, bakes and plans land outside React's props: draw them.
    useEffect(() => requestDraw(1000));
    const motion = useMemo(
        () =>
            marcherBodies && showPlans && marcherAssets
                ? new MarcherMotion(
                      showPlans.plans,
                      marcherAssets.manifest,
                      marcherBodies,
                      marcherHeading(),
                  )
                : null,
        [marcherBodies, showPlans, marcherAssets],
    );
    const headings = useMemo(
        () => new Float32Array(count).fill(marcherHeading()),
        [count],
    );
    const countRef = useRef(0);

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
                transparent: true,
                opacity: 0.85,
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

    // The cursor can pick a performer to zoom toward (`scenePick.ts`).
    useEffect(() => {
        if (!meshes) return;
        return registerPicker((origin, dir) =>
            pickMarchers(origin, dir, meshes.xz, meshes.placed, count),
        );
    }, [meshes, count]);

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
    }, [meshes, slots, fieldProperties, appearances, marcherBodies, motion]);

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
    // The camera for instrument detail, and where it was when last applied.
    const cameraRef = useRef<[number, number, number]>([0, 0, 0]);
    const lodCameraRef = useRef<[number, number, number]>([NaN, NaN, NaN]);
    useFrame((state) => {
        if (!meshes) return;
        const p = state.camera.position;
        const cam = cameraRef.current;
        cam[0] = p.x;
        cam[1] = p.y;
        cam[2] = p.z;
        const sync = useView3dSyncStore.getState();
        const ms = sync.showMs();
        const frame = frameRef.current;
        const selectionChanged = sync.selection !== frame.selection;
        if (selectionChanged) {
            frame.selection = sync.selection;
            frame.selected = new Set(sync.selection.selectedMarcherIds);
        }
        const moved = dirtyRef.current || ms !== frame.lastMs;
        const lod = lodCameraRef.current;
        const cameraMoved = !(
            Math.hypot(cam[0] - lod[0], cam[1] - lod[1], cam[2] - lod[2]) < 0.5
        );
        if (!moved && !selectionChanged) {
            // a still show: only the instruments' detail follows the camera
            if (cameraMoved && marcherBodies) {
                marcherBodies.writeFrame(
                    meshes.xz,
                    headings,
                    meshes.placed,
                    countRef.current,
                    cam,
                );
                lod[0] = cam[0];
                lod[1] = cam[1];
                lod[2] = cam[2];
            }
            return;
        }

        const { bodies, rings, visible, xz, placed } = meshes;
        if (moved) {
            // the marchers run a count ahead of the clock (`STEP_AHEAD`), so
            // they're placed from the drill a count later
            const c = countAt(clock, ms, countRef.current);
            writePerformerPositions(
                slots,
                marcherBodies && motion ? msAtCount(clock, c + STEP_AHEAD) : ms,
                fieldProperties,
                visible,
                xz,
                placed,
            );
            if (marcherBodies) {
                countRef.current = c;
                motion?.update(c, xz, placed);
                marcherBodies.writeFrame(xz, headings, placed, c, cam);
                lod[0] = cam[0];
                lod[1] = cam[1];
                lod[2] = cam[2];
            } else {
                writePerformerMatrices(
                    count,
                    xz,
                    placed,
                    bodies.instanceMatrix.array as Float32Array,
                );
                bodies.instanceMatrix.needsUpdate = true;
            }
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
            {marcherBodies ? (
                <primitive object={marcherBodies.group} />
            ) : (
                <primitive object={meshes.bodies} />
            )}
            <primitive object={meshes.rings} />
        </>
    );
}
