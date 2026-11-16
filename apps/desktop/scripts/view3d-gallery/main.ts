/**
 * Venue gallery: renders one venue kit with the same pieces the 3D View
 * scene uses (`window/Scene.tsx`), without React, the database or Electron.
 * `shoot.mjs` drives it through `window.gallery`. See README.md.
 */
import {
    ACESFilmicToneMapping,
    BufferAttribute,
    Color,
    CylinderGeometry,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PCFShadowMap,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
let fieldBox: ReturnType<typeof fieldFootprint> | null = null;
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
    fieldBox = fieldFootprint(fp);

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
    // Optional so the gallery also runs on older core code, for comparisons.
    current.env.setSurroundings?.(kit.surroundings !== false);
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
    view:
        | string
        | { position: number[]; target: number[]; fov?: number; near?: number },
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
    // A pose may set the near plane, like the app's close-ups (0.05 m).
    camera.near = (typeof view !== "string" && view.near) || 0.5;
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

/** Where a model stands: meters right of the 50, and in front of the front sideline. */
export interface ModelPlacement {
    url: string;
    x: number;
    front: number;
    turnDeg?: number;
}

const gltf = new GLTFLoader();
const modelCache = new Map<string, Promise<Group>>();
let models: Group | null = null;

/** One mesh for the whole model, its part colors baked into the vertices. */
function mergedModel(source: Group): Mesh {
    source.updateMatrixWorld(true);
    const parts: Mesh["geometry"][] = [];
    source.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        for (const name of Object.keys(g.attributes))
            if (name !== "position" && name !== "normal")
                g.deleteAttribute(name);
        const c =
            (mesh.material as MeshStandardMaterial).color ?? new Color(1, 1, 1);
        const tint = (mesh.material as MeshStandardMaterial).map
            ? new Color(0.25, 0.08, 0.04)
            : c;
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3)
            colors.set([tint.r, tint.g, tint.b], i);
        g.setAttribute("color", new BufferAttribute(colors, 3));
        parts.push(g);
    });
    return new Mesh(
        mergeGeometries(parts),
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    );
}

/**
 * Stands glTF models in front of the field, for looking at props and
 * equipment in the 3D View's own lighting. `merge` draws each model as one
 * mesh with vertex colors, to compare draw-call costs.
 */
async function addModels(
    list: ModelPlacement[],
    options: { shadows?: boolean; merge?: boolean } = {},
): Promise<void> {
    clearModels();
    if (!fieldBox) throw new Error("load a kit first");
    const group = new Group();
    const cx = (fieldBox.minX + fieldBox.maxX) / 2;
    const merged = new Map<string, Mesh>();
    for (const item of list) {
        let loading = modelCache.get(item.url);
        if (!loading)
            modelCache.set(
                item.url,
                (loading = gltf.loadAsync(item.url).then((g) => g.scene)),
            );
        const source = await loading;
        let object;
        if (options.merge) {
            let one = merged.get(item.url);
            if (!one) merged.set(item.url, (one = mergedModel(source)));
            object = one.clone();
        } else object = source.clone();
        object.position.set(cx + item.x, 0.02, fieldBox.maxZ + item.front);
        object.rotation.y = ((item.turnDeg ?? 0) * Math.PI) / 180;
        object.traverse((o) => {
            o.castShadow = options.shadows !== false;
            o.receiveShadow = options.shadows !== false;
        });
        group.add(object);
    }
    models = group;
    scene.add(group);
    renderer.shadowMap.needsUpdate = true;
}

function clearModels(): void {
    if (models) scene.remove(models);
    models = null;
}

/** Milliseconds per frame over `frames` draws of the current view, GPU work included. */
function bench(frames = 60): number {
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
        renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    return (performance.now() - start) / frames;
}

declare global {
    interface Window {
        gallery: {
            load: typeof load;
            setLighting: typeof setLighting;
            shot: typeof shot;
            addModels: typeof addModels;
            clearModels: typeof clearModels;
            bench: typeof bench;
            front(): { x: number; z: number };
            gpu(): string;
            info(): {
                programs: number;
                calls: number;
                triangles: number;
                textures: number;
                textureMB: number;
            };
        };
    }
}

window.gallery = {
    load,
    setLighting,
    shot,
    addModels,
    clearModels,
    bench,
    front: () => ({
        x: fieldBox ? (fieldBox.minX + fieldBox.maxX) / 2 : 0,
        z: fieldBox?.maxZ ?? 0,
    }),
    gpu: () => {
        const gl = renderer.getContext();
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext
            ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
            : "unknown";
    },
    info: () => ({
        programs: renderer.info.programs?.length ?? 0,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        /** Texture memory (MB): every map's pixels, with mipmaps. */
        textureMB: (() => {
            const seen = new Set<unknown>();
            let bytes = 0;
            scene.traverse((o) => {
                const mats = (o as { material?: unknown }).material;
                for (const m of ([] as unknown[]).concat(mats ?? [])) {
                    for (const v of Object.values(m as object)) {
                        const t = v as {
                            isTexture?: boolean;
                            image?: { width?: number; height?: number };
                        };
                        if (!t?.isTexture || seen.has(t)) continue;
                        seen.add(t);
                        const w = t.image?.width ?? 0;
                        const h = t.image?.height ?? 0;
                        bytes += w * h * 4 * 1.33;
                    }
                }
            });
            return Math.round(bytes / 1e5) / 10;
        })(),
    }),
};
document.title = "gallery-ready";
