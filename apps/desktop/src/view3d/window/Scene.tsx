/**
 * The 3D View scene (P3.1, design.md sections 4 to 6 and 9).
 *
 * Reads the show's venue settings, field properties and field image through
 * the window's query client, and assembles the field surface, the venue kit
 * (from the registry in `view3d/core/kits`), the shared environment and one
 * crowd. Each piece is built in its own effect, keyed only on the inputs it
 * uses, and is removed and disposed when those inputs change:
 *
 * - environment: quality;
 * - kit: kit id, field footprint, venue params, quality;
 * - field surface: field properties, the kit's surface style, venue params,
 *   field image, renderer limits;
 * - crowd: kit, crowd toggle, team colors, quality;
 * - lighting: applied to the environment and the kit, never rebuilds.
 *
 * Quality starts `high`. After 3 seconds below 30 fps the scene switches to
 * `low` once and logs it (`qualityFallback.ts`, P5.1).
 *
 * What it built is published in `useView3dSceneStore` (`sceneStore.ts`) for
 * the camera rig and the overlay. The camera rig (`camera/CameraRig.tsx`,
 * P3.2) places and moves the camera.
 */
// cspell:ignore frameloop
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { fieldFootprint, type FieldProperties } from "@openmarch/core";
import {
    ACESFilmicToneMapping,
    PCFShadowMap,
    PerspectiveCamera,
    SRGBColorSpace,
    Vector3,
    type Camera,
    type Vector3Tuple,
} from "three";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import {
    buildCrowd,
    createEnvironment,
    defaultCrowdPalette,
    type Environment,
} from "@/view3d/core/environment";
import { buildFieldSurface } from "@/view3d/core/field";
import {
    DEFAULT_CROWD_DENSITY,
    KIT_BUILDERS,
    KIT_FIELD_STYLE,
} from "@/view3d/core/kits";
import type {
    CameraSeat,
    FieldFootprint,
    KitResult,
    VenueParams,
} from "@/view3d/core/types";
import type { VenueSettings } from "@/view3d/core/venueSettings";
import CameraRig from "./camera/CameraRig";
import { CROWD_CLEAR_RADIUS, useView3dSceneStore } from "./sceneStore";
import { useFieldImage } from "./useFieldImage";
import {
    FALLBACK_LOG_MESSAGE,
    createQualityFallbackState,
    stepQualityFallback,
} from "./qualityFallback";
import Performers from "./performers/Performers";

/** Default vertical field of view, as in the reference demo. */
export const DEFAULT_FOV_DEG = 45;
/** Must exceed the sky dome's radius (`SKY_RADIUS`, 1524 m). */
export const CAMERA_FAR = 3000;
export const CAMERA_NEAR = 0.3;
/**
 * Passed to `kit.onFrame` as `dt` once after a kit or lighting change when
 * the viewer prefers reduced motion, so animated parts (the pro roof) snap.
 */
export const SNAP_DT = 1e4;

function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

/** Puts the camera at a seat, looking at its target. No animation. */
export function placeCamera(camera: Camera, seat: CameraSeat): void {
    camera.position.set(...seat.position);
    camera.lookAt(...seat.target);
    if (camera instanceof PerspectiveCamera) {
        camera.fov = seat.fovDeg ?? DEFAULT_FOV_DEG;
        camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
}

/**
 * Keeps one object identity for values whose `key` is unchanged, so effects
 * keyed on it don't rerun when a refetch returns an equal value.
 */
function useStable<T>(value: T, key: string): T {
    const ref = useRef<{ key: string; value: T } | null>(null);
    if (!ref.current || ref.current.key !== key) ref.current = { key, value };
    return ref.current.value;
}

/** The 3D View canvas, filling its parent. */
export default function Scene() {
    const venue = useVenueSettings();
    const field = useQuery(fieldPropertiesQueryOptions());
    const fieldImage = useFieldImage();
    const kitId = useView3dSceneStore((s) => s.kitId);
    const lighting = useView3dSceneStore((s) => s.lighting);

    const ready = venue.data && field.data && fieldImage.loaded;
    return (
        <div
            className="absolute inset-0"
            data-testid="view3d-scene"
            data-kit={kitId ?? ""}
            data-lighting={lighting ?? ""}
        >
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{
                    fov: DEFAULT_FOV_DEG,
                    near: CAMERA_NEAR,
                    far: CAMERA_FAR,
                    position: [0, 60, 90],
                }}
                onCreated={({ gl }) => {
                    gl.toneMapping = ACESFilmicToneMapping;
                    gl.outputColorSpace = SRGBColorSpace;
                }}
            >
                {ready && (
                    <SceneContents
                        settings={venue.data!}
                        fieldProperties={field.data!}
                        image={fieldImage.image}
                    />
                )}
                {ready && <CameraRig />}
            </Canvas>
        </div>
    );
}

interface SceneContentsProps {
    settings: VenueSettings;
    fieldProperties: FieldProperties;
    image: ImageBitmap | null;
}

// eslint-disable-next-line max-lines-per-function
function SceneContents({
    settings,
    fieldProperties: fieldPropertiesIn,
    image,
}: SceneContentsProps) {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const quality = useView3dSceneStore((s) => s.quality);
    const kit = useView3dSceneStore((s) => s.kit);
    const [env, setEnv] = useState<Environment | null>(null);
    const snapRef = useRef(false);
    const litKitRef = useRef<KitResult | null>(null);

    const fieldProperties = useStable(
        fieldPropertiesIn,
        JSON.stringify(fieldPropertiesIn),
    );
    const footprintKey = useMemo(
        () => JSON.stringify(fieldFootprint(fieldProperties)),
        [fieldProperties],
    );
    const paramsKey = JSON.stringify(settings.params);
    const params = useStable<VenueParams>(settings.params, paramsKey);
    const kitId = settings.kit;
    const fieldStyle = KIT_FIELD_STYLE[kitId];
    const { homeColor, awayColor } = params;

    // Renderer settings that follow quality. Kits and the crowd rebuild on a
    // quality change, so their materials pick the new shadow setting up.
    useEffect(() => {
        gl.shadowMap.enabled = quality === "high";
        gl.shadowMap.type = PCFShadowMap;
        gl.shadowMap.needsUpdate = true;
    }, [gl, quality]);

    // Environment: sky, hemisphere light, sun and fog.
    useEffect(() => {
        const environment = createEnvironment({ quality });
        scene.add(environment.root);
        scene.fog = environment.fog;
        setEnv(environment);
        return () => {
            scene.remove(environment.root);
            if (scene.fog === environment.fog) scene.fog = null;
            environment.dispose();
            setEnv(null);
        };
    }, [scene, quality]);

    // Kit: rebuilt only for a new kit id, footprint, params or quality.
    useEffect(() => {
        const footprint = JSON.parse(footprintKey) as FieldFootprint;
        const built = KIT_BUILDERS[kitId]({ footprint, params, quality });
        scene.add(built.root);
        useView3dSceneStore.getState()._setKit(kitId, built);
        return () => {
            scene.remove(built.root);
            const store = useView3dSceneStore.getState();
            if (store.kit === built) store._setKit(null, null);
            built.dispose();
        };
    }, [scene, kitId, footprintKey, params, quality]);

    // Field surface.
    useEffect(() => {
        const surface = buildFieldSurface({
            fieldProperties,
            theme: fieldProperties.theme,
            style: fieldStyle,
            params,
            image,
            maxTextureSize: gl.capabilities.maxTextureSize,
            anisotropy: gl.capabilities.getMaxAnisotropy(),
        });
        scene.add(surface.mesh);
        return () => {
            scene.remove(surface.mesh);
            surface.dispose();
        };
    }, [scene, gl, fieldProperties, fieldStyle, params, image]);

    // Crowd: one instanced mesh from the kit's seat rows.
    useEffect(() => {
        if (!kit || !settings.crowd || kit.seatRows.length === 0) return;
        const crowd = buildCrowd(kit.seatRows, {
            density: kit.crowdDensity ?? DEFAULT_CROWD_DENSITY,
            palette: defaultCrowdPalette({ homeColor, awayColor }),
            quality,
        });
        // Seat rows are in kit-root space, so the crowd lives under the root.
        kit.root.add(crowd.mesh);
        clearAroundCamera(crowd, kit, camera);
        useView3dSceneStore.getState()._setCrowd(crowd);
        return () => {
            kit.root.remove(crowd.mesh);
            const store = useView3dSceneStore.getState();
            if (store.crowd === crowd) store._setCrowd(null);
            crowd.dispose();
        };
    }, [camera, kit, settings.crowd, homeColor, awayColor, quality]);

    // Lighting: drives the environment and the kit's own lights.
    useEffect(() => {
        if (!env || !kit) return;
        const preset = kit.lightingPresets.includes(settings.lighting)
            ? settings.lighting
            : kit.defaultLighting;
        env.setLighting(preset, kit.focus);
        gl.toneMappingExposure = env.exposure;
        kit.setLighting(preset);
        // A new kit shows its lighting state at once (the pro roof doesn't
        // slide on load). Later changes animate unless the viewer prefers
        // reduced motion.
        if (kit !== litKitRef.current || prefersReducedMotion())
            snapRef.current = true;
        litKitRef.current = kit;
        useView3dSceneStore.getState()._setLighting(preset);
    }, [gl, env, kit, settings.lighting]);

    // Clear the store when the scene goes away.
    useEffect(
        () => () => useView3dSceneStore.getState()._setLighting(null),
        [],
    );

    // Automatic fallback (design.md §9): 3 s below 30 fps switches to low
    // quality once. It never switches back on its own.
    const fallbackRef = useRef(createQualityFallbackState());
    useFrame((_, dt) => {
        const store = useView3dSceneStore.getState();
        if (store.quality !== "high") return;
        if (stepQualityFallback(fallbackRef.current, dt)) {
            // eslint-disable-next-line no-console -- design.md §9 asks for a log line
            console.info(FALLBACK_LOG_MESSAGE);
            store.setQuality("low");
        }
    });

    const cameraTuple = useRef<Vector3Tuple>([0, 0, 0]);
    useFrame((state, dt) => {
        const current = useView3dSceneStore.getState().kit;
        if (!current?.onFrame) return;
        const p = state.camera.position;
        const tuple = cameraTuple.current;
        tuple[0] = p.x;
        tuple[1] = p.y;
        tuple[2] = p.z;
        current.onFrame({
            cameraPosition: tuple,
            dt: snapRef.current ? SNAP_DT : dt,
        });
        snapRef.current = false;
    });

    return <Performers fieldProperties={fieldProperties} />;
}

const scratch = new Vector3();

/** Hides the people nearest the camera, in the crowd's (kit-root) frame. */
function clearAroundCamera(
    crowd: { clearAround(point: Vector3Tuple, radius: number): number },
    kit: KitResult,
    camera: Camera,
): void {
    kit.root.updateMatrixWorld();
    kit.root.worldToLocal(scratch.copy(camera.position));
    crowd.clearAround([scratch.x, scratch.y, scratch.z], CROWD_CLEAR_RADIUS);
}
