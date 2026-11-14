/**
 * Performer blocks for the 3D View (P4.2, ADR 0010 D-7, design.md §8,
 * ui.md UI-4).
 *
 * - One `InstancedMesh` of cylinders (0.3 m radius, 1.75 m tall) standing on
 *   the ground, one instance per marcher.
 * - Colors and visibility follow the selected page's appearance cascade
 *   (tags, section, field theme), the same values the 2D
 *   canvas applies to its marchers.
 * - Selected marchers get an accent ring at their feet: a second instanced
 *   mesh, drawn only for the selected ones.
 * - Matrices update in `useFrame` from the sync store's `showMs()`. When the
 *   editor is paused, the store holds the selected page's end, so the blocks
 *   hold that page like the 2D canvas. Nothing is recomputed while the show
 *   time and the inputs stay the same.
 * - Paused, the om-pose marchers stand in the closed position (at attention,
 *   feet together, on their dots) unless the viewer chose the actual step
 *   (`pausedPose.ts`); playing always shows the actual motion.
 *
 * Meshes and buffers are rebuilt only when the marcher set changes.
 */
// cspell:ignore metalness
import { registerPicker } from "../scenePick";
import { pickMarchers } from "../camera/inputMath";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CueSection, FieldProperties, RgbaColor } from "@openmarch/core";
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
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import { brassFinishOf, tubaModelOf } from "@/view3d/core/venueSettings";
import { cueSectionsOf } from "./cueSections";
import {
    guardUniformPresetOf,
    uniformPresetOf,
} from "@/view3d/core/marchers/uniformPresets";
import { GROUND_LAYER, setGroundLayer } from "@/view3d/core/environment";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { performerDefaults } from "@/view3d/core/performerDefaults";
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
    fillToNumber,
    sectionUniform,
} from "@/view3d/core/marchers/looks";
import { useShowPositions } from "@/view3d/positions";
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
    bandMovingCounts,
    compileWindowCues,
    MarcherMotion,
    planShow,
    STEP_AHEAD,
    type HornSlot,
    type ShowPlans,
} from "./marchers/marcherMotion";
import {
    clipName,
    useMarcherAssets,
    useMarcherBodies,
} from "./marchers/useMarcherBodies";
import { clipsToLoad } from "./marchers/marcherBodies";
import { hornRowsOf } from "./marchers/hornRows";
import { sectionCueCarry } from "@/view3d/core/marchers/hornChannel";
import { DEFAULT_HOLD, windowHornEvents } from "./windowHorn";
import { SilkMotion } from "./marchers/silkMotion";

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
    const { positions } = useShowPositions();
    const { data: appearances } = useQuery({
        ...marcherAppearancesQueryOptions(selectedPageId, queryClient),
        // Keep the last page's colors while the next page's load.
        placeholderData: (previous) => previous,
    });

    const marcherIdsKey = useMemo(
        // Performers (the marchers query has no items): items get no figure
        () => (marchers ?? []).map((m) => m.id).join(","),
        [marchers],
    );
    const slots = useMemo(
        () =>
            buildPerformerSlots(
                marcherIdsKey ? marcherIdsKey.split(",").map(Number) : [],
                positions,
            ),
        [marcherIdsKey, positions],
    );
    const count = slots.ids.length;

    // the show's band and guard uniform presets, from its venue settings
    // (ADR 0010 D-18)
    const { data: venue } = useVenueSettings();
    const uniformPreset = uniformPresetOf(venue?.uniforms);
    const guardUniformPreset = guardUniformPresetOf(venue?.guardUniforms);
    // the brass line's finish and the tubas' horn, from the same settings
    const brassFinish = brassFinishOf(venue?.brassFinish);
    const tuba = tubaModelOf(venue?.tuba);
    // om-pose marchers (ADR 0010 D-7); the cylinders stand in until they load.
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    // Keyed on what a look depends on (marcher IDs, sections, section fills),
    // not on the positions: a drill edit must not rebuild every mesh. The
    // uniform ignores the fill (it comes from the show's preset); only what a
    // section carries, its drum shells and flag silks, takes the fill.
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
            RgbaColor | null,
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
                DEFAULT_HOLD,
                options[i],
                fill ? fillToNumber(fill) : undefined,
                undefined,
                uniformPreset,
                guardUniformPreset,
                { finish: brassFinish, tuba },
            ),
            // no Silk cues yet: the silks take the uniform's carry (the
            // section's 2D fill, else the preset's color and pattern)
        }));
    }, [
        looksKey,
        quality,
        uniformPreset,
        guardUniformPreset,
        brassFinish,
        tuba,
    ]);
    const heightClasses = useMemo(
        () => [...new Set((marcherLooks ?? []).map((l) => l.body.heightClass))],
        [marcherLooks],
    );
    const marcherAssets = useMarcherAssets(heightClasses);
    // The count clock and every marcher's clip plan for the whole show.
    const { beats } = useTimingObjects();
    const clock = useMemo(() => buildCountClock(beats), [beats]);
    // How marchers move where no cue says otherwise: the show's performer
    // defaults (Show settings), field by field so an unrelated settings
    // change keeps every plan.
    const defaults = performerDefaults(
        useQuery(workspaceSettingsQueryOptions()).data?.performerDefaults,
    );
    const { stepOffFoot, dotMode, directionChange, holdWhileBandMoves } =
        defaults;
    // What each marcher carries, for the Horn/Equipment default: their
    // section's usual equipment, as in the editor. Keyed on the carry alone,
    // so a quality change doesn't recompile.
    const carriesKey = useMemo(
        () =>
            marchers
                ? JSON.stringify(
                      marchers.map((m) => [m.id, sectionCueCarry(m.section)]),
                  )
                : null,
        [marchers],
    );
    // Each flag section's usual flag, for the Carry default; keyed on the
    // sections' flags alone, like the carries.
    const cueSectionsKey = useMemo(() => {
        if (!marchers || !marcherLooks) return null;
        const sectionById = new Map(marchers.map((m) => [m.id, m.section]));
        return JSON.stringify(
            cueSectionsOf(
                slots.ids.map((id, i) => ({
                    section: sectionById.get(id) ?? "",
                    family:
                        marcherLooks[i]?.uniform.options.carry?.family ?? null,
                })),
            ),
        );
    }, [marchers, marcherLooks, slots.ids]);
    // Which counts anyone travels on, for the Feet default (marchers mark
    // time while the band moves). Keyed on its content, so a drill edit that
    // keeps the band's moving counts doesn't recompile and replan everyone.
    const bandMovingKey = useMemo(
        () =>
            bandMovingCounts(
                slots.ids,
                slots.positions,
                clock,
                fieldProperties,
            ).join(""),
        [slots, clock, fieldProperties],
    );
    // The show defaults compiled for every marcher (no cues are stored): the
    // Show settings' hold while the band moves (mark time unless changed),
    // else stand; face the front; horns up; the Show settings' step-off foot. `carries` decides each marcher's Horn/Equipment
    // default.
    const cues = useMemo(() => {
        if (!marchers || !carriesKey || !cueSectionsKey) return null;
        const carries = new Map(
            JSON.parse(carriesKey) as [
                number,
                ReturnType<typeof sectionCueCarry>,
            ][],
        );
        return compileWindowCues(marchers, beats, stepOffFoot, {
            sections: JSON.parse(cueSectionsKey) as CueSection[],
            bandMoving: Array.from(bandMovingKey, Number),
            holdWhileBandMoves,
            carries: (id) => carries.get(id) ?? "none",
        });
    }, [
        marchers,
        beats,
        carriesKey,
        cueSectionsKey,
        bandMovingKey,
        stepOffFoot,
        holdWhileBandMoves,
    ]);
    const previousPlans = useRef<ShowPlans | null>(null);
    const showPlans = useMemo(() => {
        if (!marcherAssets || !marcherLooks || !cues) return null;
        const planned = planShow(
            slots.ids,
            slots.positions,
            marcherLooks.map((l) => l.body.heightClass),
            clock,
            fieldProperties,
            marcherAssets.manifest,
            cues,
            previousPlans.current,
            dotMode,
            directionChange,
        );
        previousPlans.current = planned;
        // eslint-disable-next-line no-console -- planning time is a cost to watch at 2,000 marchers
        console.info(
            `3D View: planned ${planned.replanned} of ` +
                `${planned.plans.length} marchers over ` +
                `${clock.counts} counts in ${planned.planMs.toFixed(0)} ms`,
        );
        return planned;
    }, [
        marcherAssets,
        marcherLooks,
        slots,
        clock,
        fieldProperties,
        cues,
        dotMode,
        directionChange,
    ]);
    const clipNames = useMemo(() => {
        const names = plannedClips(
            (showPlans?.plans ?? []).filter((p) => p !== null),
        );
        for (const h of heightClasses) names.add(clipName("attention", h));
        // a right-foot move's rows are baked from their mirrored partners
        return clipsToLoad([...names], "left");
    }, [showPlans, heightClasses]);
    // Only the Feet rows some marcher plays: its planned clips, and
    // attention for its height class.
    const bakeRows = useMemo(() => {
        if (!marcherLooks) return undefined;
        const out = new Set<string>();
        marcherLooks.forEach((look, i) => {
            out.add(clipName("attention", look.body.heightClass));
            const plan = showPlans?.plans[i];
            if (!plan) return;
            for (const e of plan.events)
                for (const c of eventRows(e)) if (c) out.add(c);
        });
        return [...out];
    }, [marcherLooks, showPlans]);
    // Each carrier's Horn/Equipment channel over the show: horns up, then
    // whatever the cues say.
    const hornSlots = useMemo<(HornSlot | null)[] | null>(() => {
        if (!marcherLooks || !cues) return null;
        const secondsPerCount = (k: number) =>
            60 / (clock.bpm[Math.min(k, clock.bpm.length - 1)] || 120);
        return marcherLooks.map((look, i) => {
            const carry = look.uniform.options.carry;
            if (!carry) return null;
            return {
                family: carry.family,
                events: windowHornEvents(
                    cues.segments(slots.ids[i], "horn_equipment"),
                    { secondsPerCount },
                ),
            };
        });
    }, [marcherLooks, cues, clock, slots.ids]);
    const hornRows = useMemo(() => {
        const out = new Set<string>();
        for (const h of hornSlots ?? [])
            if (h) for (const r of hornRowsOf(h.events, h.family)) out.add(r);
        return [...out];
    }, [hornSlots]);
    const marcherBodies = useMarcherBodies(
        marcherAssets,
        clipNames,
        marcherLooks,
        quality,
        "left",
        bakeRows,
        hornRows,
    );
    // Meshes, bakes and plans land outside React's props: draw them.
    useEffect(() => requestDraw(1000));
    const motion = useMemo(
        () =>
            marcherBodies && showPlans && marcherAssets && marcherLooks
                ? new MarcherMotion(
                      showPlans.plans,
                      marcherAssets.manifest,
                      marcherBodies,
                      hornSlots ?? [],
                      marcherLooks.map((l) =>
                          clipName("attention", l.body.heightClass),
                      ),
                  )
                : null,
        [marcherBodies, showPlans, marcherAssets, hornSlots, marcherLooks],
    );
    const silkMotion = useMemo(
        () =>
            marcherBodies && showPlans && marcherBodies.silkSlots.length > 0
                ? new SilkMotion(showPlans, clock, marcherBodies.silkSlots)
                : null,
        [marcherBodies, showPlans, clock],
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
            // Over the field and the marchers' shadows, at any distance.
            ringMaterial: setGroundLayer(
                new MeshBasicMaterial({
                    color: new Color(readAccentColor()),
                    side: DoubleSide,
                    transparent: true,
                    opacity: 0.85,
                    depthWrite: false,
                }),
                GROUND_LAYER.selection,
            ),
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
    }, [
        meshes,
        slots,
        fieldProperties,
        appearances,
        marcherBodies,
        motion,
        silkMotion,
    ]);

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
        /** Whether the last frame drew the closed position. */
        closed: false,
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
        // paused, the marchers close unless the viewer asked for the step
        const closed =
            !sync.clock?.playing &&
            useView3dSceneStore.getState().pausedPose === "closed";
        const moved =
            dirtyRef.current || ms !== frame.lastMs || closed !== frame.closed;
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
                marcherBodies.compose(state.gl);
                lod[0] = cam[0];
                lod[1] = cam[1];
                lod[2] = cam[2];
            }
            return;
        }

        const { bodies, rings, visible, xz, placed } = meshes;
        if (moved) {
            // the marchers run a count ahead of the clock (`STEP_AHEAD`), so
            // they're placed from the drill a count later; closed, they stand
            // on the dot at the show time itself
            const c = countAt(clock, ms, countRef.current);
            writePerformerPositions(
                slots,
                marcherBodies && motion && !closed
                    ? msAtCount(clock, c + STEP_AHEAD)
                    : ms,
                fieldProperties,
                visible,
                xz,
                placed,
            );
            if (marcherBodies) {
                countRef.current = c;
                if (closed) motion?.updateClosed(c, headings);
                else motion?.update(c, xz, placed, headings);
                marcherBodies.writeFrame(
                    xz,
                    headings,
                    placed,
                    c,
                    cam,
                    silkMotion?.update(c, closed) ?? null,
                );
                marcherBodies.compose(state.gl);
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
        frame.closed = closed;
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
