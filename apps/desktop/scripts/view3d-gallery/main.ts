/**
 * Venue gallery: renders one venue kit with the same pieces the 3D View
 * scene uses (`window/Scene.tsx`), without React, the database or Electron.
 * `shoot.mjs` drives it through `window.gallery`. See README.md.
 */
import {
    ACESFilmicToneMapping,
    CylinderGeometry,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    PCFShadowMap,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
} from "three";
import { fieldFootprint, type FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    brandArtReady,
    buildCrowd,
    createEnvironment,
    createEnvironmentMap,
    defaultCrowdPalette,
} from "@/view3d/core/environment";
import { buildFieldSurface, venueFootprint } from "@/view3d/core/field";
import {
    DEFAULT_CROWD_DENSITY,
    KIT_BUILDERS,
    KIT_FIELD_STYLE,
} from "@/view3d/core/kits";
import { defaultVenueForKit } from "@/view3d/core/venueSettings";
import type {
    CameraSeat,
    KitResult,
    LightingPreset,
    ShowCredits,
    VenueKitId,
} from "@/view3d/core/types";

const FIELDS: Record<string, FieldProperties> = {
    football:
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
    footballNoEndZones:
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
    college: FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES,
    collegeNoEndZones:
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    pro: FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
    indoor: FieldPropertiesTemplates.INDOOR_50x80_8to5,
};

/** Which field a kit is shown on unless `field` is given. */
const KIT_FIELD: Record<string, keyof typeof FIELDS> = {
    hs: "football",
    bighs: "football",
    college: "college",
    pro: "pro",
    gym: "indoor",
    arena: "indoor",
    blank: "football",
};

const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.type = PCFShadowMap;
document.body.appendChild(renderer.domElement);
const camera = new PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.5,
    3000,
);

let scene = new Scene();
let kit: KitResult | null = null;
let cleanup: (() => void) | null = null;

/** A block of plain performers for scale: 8 x 6 at 2-step intervals. */
function performers(fp: FieldProperties) {
    const geometry = new CylinderGeometry(0.25, 0.25, 1.75, 12);
    geometry.translate(0, 0.875 + 0.02, 0);
    const material = new MeshStandardMaterial({ color: 0x1b1b2a });
    const mesh = new InstancedMesh(geometry, material, 48);
    const fpr = fieldFootprint(fp);
    const cx = (fpr.minX + fpr.maxX) / 2;
    const cz = (fpr.minZ + fpr.maxZ) / 2;
    const m = new Matrix4();
    let i = 0;
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 8; c++)
            mesh.setMatrixAt(
                i++,
                m.makeTranslation(
                    cx + (c - 3.5) * 1.5,
                    0,
                    cz + (r - 2.5) * 1.5,
                ),
            );
    mesh.castShadow = true;
    return {
        mesh,
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

const SAMPLE_CREDITS: ShowCredits = {
    title: "Spring Show 2026",
    designer: "Sam Rivera",
    client: "Lincoln High School",
};

export interface LoadOptions {
    kit: VenueKitId;
    field?: keyof typeof FIELDS;
    quality?: "low" | "high";
    crowd?: boolean;
    /** Credits for the kit's video boards; a sample show by default. */
    credits?: ShowCredits;
}

export interface LoadResult {
    cameras: Pick<CameraSeat, "id" | "kind">[];
    lightingPresets: LightingPreset[];
    defaultLighting: LightingPreset;
}

async function load(options: LoadOptions): Promise<LoadResult> {
    cleanup?.();
    scene = new Scene();
    const quality = options.quality ?? "high";
    const fp = FIELDS[options.field ?? KIT_FIELD[options.kit] ?? "football"];
    const params = defaultVenueForKit(options.kit).params;
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.needsUpdate = true;

    const env = createEnvironment({ quality });
    scene.add(env.root);
    scene.fog = env.fog;
    const built = KIT_BUILDERS[options.kit]({
        footprint: venueFootprint(fp, KIT_FIELD_STYLE[options.kit]),
        params,
        quality,
    });
    kit = built;
    built.setShowCredits?.(options.credits ?? SAMPLE_CREDITS);
    await brandArtReady();
    scene.add(built.root);
    const surface = buildFieldSurface({
        fieldProperties: fp,
        theme: fp.theme,
        style: KIT_FIELD_STYLE[options.kit],
        params,
        image: null,
        maxTextureSize: renderer.capabilities.maxTextureSize,
        anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    scene.add(surface.mesh);
    await surface.ready.catch(() => undefined);
    const crowd =
        options.crowd === false || built.seatRows.length === 0
            ? null
            : buildCrowd(built.seatRows, {
                  density: built.crowdDensity ?? DEFAULT_CROWD_DENSITY,
                  palette: defaultCrowdPalette(params),
                  quality,
              });
    if (crowd) built.root.add(crowd.mesh);
    const block = performers(fp);
    scene.add(block.mesh);

    let envMap: ReturnType<typeof createEnvironmentMap> | null = null;
    current = { env, crowd, setEnvMap: (m) => (envMap = m) };
    cleanup = () => {
        envMap?.dispose();
        block.dispose();
        crowd?.dispose();
        surface.dispose();
        built.dispose();
        env.dispose();
        kit = null;
    };
    return {
        cameras: built.cameras.map(({ id, kind }) => ({ id, kind })),
        lightingPresets: built.lightingPresets,
        defaultLighting: built.defaultLighting,
    };
}

let current: {
    env: ReturnType<typeof createEnvironment>;
    crowd: ReturnType<typeof buildCrowd> | null;
    setEnvMap(m: ReturnType<typeof createEnvironmentMap>): void;
} | null = null;

function setLighting(preset: LightingPreset): void {
    if (!kit || !current) return;
    current.env.setLighting(preset, kit.focus);
    renderer.toneMappingExposure = current.env.exposure;
    kit.setLighting(preset);
    if (renderer.capabilities.isWebGL2) {
        const map = createEnvironmentMap(renderer, preset);
        scene.environment = map.texture;
        scene.environmentIntensity = 0.6;
        current.setEnvMap(map);
    }
}

/**
 * Renders from a kit camera (by id) or an explicit pose. Steps `onFrame`
 * with a large dt first so animated parts (the pro roof) settle.
 */
function shot(
    view: string | { position: number[]; target: number[]; fov?: number },
): void {
    if (!kit) throw new Error("load a kit first");
    const seat =
        typeof view === "string"
            ? kit.cameras.find((c) => c.id === view)
            : {
                  position: view.position,
                  target: view.target,
                  fovDeg: view.fov,
              };
    if (!seat) throw new Error(`no camera ${String(view)}`);
    camera.position.set(...(seat.position as [number, number, number]));
    camera.lookAt(...(seat.target as [number, number, number]));
    camera.fov = seat.fovDeg ?? 45;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const p = camera.position;
    for (let i = 0; i < 3; i++)
        kit.onFrame?.({ cameraPosition: [p.x, p.y, p.z], dt: 1e4 });
    if (current?.crowd) {
        current.crowd.reset();
        kit.root.updateMatrixWorld();
        const local = kit.root.worldToLocal(p.clone());
        current.crowd.clearAround([local.x, local.y, local.z], 6);
    }
    renderer.render(scene, camera);
    const hud = document.getElementById("hud");
    if (hud) hud.textContent = typeof view === "string" ? view : "custom";
}

declare global {
    interface Window {
        gallery: {
            load: typeof load;
            setLighting: typeof setLighting;
            shot: typeof shot;
            info(): { programs: number; calls: number; triangles: number };
        };
    }
}

window.gallery = {
    load,
    setLighting,
    shot,
    info: () => ({
        programs: renderer.info.programs?.length ?? 0,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
    }),
};
document.title = "gallery-ready";
