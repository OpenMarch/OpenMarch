import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
    Box3,
    CanvasTexture,
    Color,
    DirectionalLight,
    DoubleSide,
    HemisphereLight,
    LinearFilter,
    LinearMipmapLinearFilter,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    Vector3,
    WebGLRenderTarget,
    type Texture,
    type WebGLRenderer,
} from "three";
import {
    worldToPixels,
    type FieldFootprint,
    type FieldProperties,
} from "@openmarch/core";
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import { useFieldImage } from "@/view3d/window/useFieldImage";
import {
    paintPlan,
    planField,
    textureLayout,
    venueFootprint,
    type FieldPlan,
} from "@/view3d/core/field";
import { KIT_FIELD_STYLE } from "@/view3d/core/kits/fieldStyle";
import { DEFAULT_VENUE_PARAMS } from "@/view3d/core/venueSettings";
import type { KitBuilder, VenueKitId, VenueParams } from "@/view3d/core/types";
import type {
    buildCrowd as BuildCrowd,
    defaultCrowdPalette as DefaultCrowdPalette,
} from "@/view3d/core/environment";
import { useTheme } from "@/context/ThemeContext";
import type { FieldVenueAround } from "@/stores/UiSettingsStore";
import { planBaseColor, venuePasses, type VenueLook } from "./fieldVenue";

/**
 * The show's 3D venue under the 2D grid (fork #1207). The field surface is the
 * 3D View's own plan (`planField`) painted without the markings the grid draws,
 * then washed toward the field's background in a shader. Around it: a turf
 * edge feathered into the page, or the venue kit (stands, crowd) drawn once
 * from straight above by the field's own renderer.
 *
 * Render orders: the field's background -2, stands -1.8, the venue's field
 * -1.6, the show's field image -1, lines 0.
 */
const AROUND_ORDER = -1.8;
const FIELD_ORDER = -1.6;

/** Turf around the field for the edge, in meters, feathered over its outer half. */
const EDGE = 9;
/** Texture size: a wash doesn't need the 3D View's detail, and tablets have little memory. */
const LONG_SIDE = 2048;
/** How far past the field the stands render reaches, in meters. */
const AROUND_REACH = 140;

interface Surface {
    texture: Texture;
    /** Where the texture lies, in world meters. */
    footprint: FieldFootprint;
    /** The color most of it is, for the detail boost. */
    base: [number, number, number];
    /** Its colors are linear (a render), not sRGB (a canvas). */
    linear: boolean;
    dispose(): void;
}

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    // Top row first, so v = 0 is the back of the field, where field y is smallest
    texture.flipY = false;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    return texture;
}

/** Paints the field surface a look shows, with a turf edge when asked. */
function paintSurface(
    plan: FieldPlan,
    look: VenueLook,
    edge: boolean,
    image: CanvasImageSource | null,
): Surface {
    const f = plan.footprint;
    // Markings only paints marks, never turf, so it has no edge
    const m = edge && !look.ink ? EDGE : 0;
    const footprint: FieldFootprint = {
        minX: f.minX - m,
        maxX: f.maxX + m,
        minZ: f.minZ - m,
        maxZ: f.maxZ + m,
    };
    const layout = textureLayout(footprint, LONG_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const g = canvas.getContext("2d");
    const base = planBaseColor(plan);
    if (g) {
        if (m > 0) {
            g.fillStyle = `rgb(${base.map((c) => Math.round(c * 255)).join(",")})`;
            g.fillRect(0, 0, layout.width, layout.height);
        }
        for (const pass of venuePasses(plan, look)) {
            g.globalAlpha = pass.alpha;
            paintPlan(g, { ...plan, items: pass.items }, layout, image);
        }
        g.globalAlpha = 1;
        if (m > 0) feather(g, layout.width, layout.height, m * layout.scaleX);
    }
    const texture = canvasTexture(canvas);
    return {
        texture,
        footprint,
        base,
        linear: false,
        dispose: () => texture.dispose(),
    };
}

/** Fades the canvas's outer `px` pixels to transparent on every side. */
function feather(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    px: number,
): void {
    g.globalCompositeOperation = "destination-in";
    const ramp = (x0: number, y0: number, x1: number, y1: number) => {
        const grad = g.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,1)");
        return grad;
    };
    for (const [x0, y0, x1, y1] of [
        [0, 0, px, 0],
        [w, 0, w - px, 0],
        [0, 0, 0, px],
        [0, h, 0, h - px],
    ]) {
        g.fillStyle = ramp(x0, y0, x1, y1);
        g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = "source-over";
}

/**
 * The venue kit (stands, crowd, buildings) from straight above, rendered
 * into a texture by the field's own renderer, so the field never needs a
 * second WebGL context. Kits load nothing asynchronously, so one render does.
 * The kits' code loads the first time the stands show (`loadKits`).
 */
interface KitModules {
    builders: Readonly<Record<VenueKitId, KitBuilder>>;
    buildCrowd: typeof BuildCrowd;
    defaultCrowdPalette: typeof DefaultCrowdPalette;
}

/** The venue kits, loaded only when the stands are first shown. */
async function loadKits(): Promise<KitModules> {
    const [kits, environment] = await Promise.all([
        import("@/view3d/core/kits"),
        import("@/view3d/core/environment"),
    ]);
    return {
        builders: kits.KIT_BUILDERS,
        buildCrowd: environment.buildCrowd,
        defaultCrowdPalette: environment.defaultCrowdPalette,
    };
}

function renderAround(
    { builders, buildCrowd, defaultCrowdPalette }: KitModules,
    gl: WebGLRenderer,
    kitId: VenueKitId,
    fieldProperties: FieldProperties,
    params: VenueParams,
): Surface | null {
    const fieldFootprint = venueFootprint(
        fieldProperties,
        KIT_FIELD_STYLE[kitId],
    );
    const kit = builders[kitId]({
        footprint: fieldFootprint,
        params,
        quality: "low",
        venuePodium: true,
    });
    const crowd =
        kit.seatRows.length > 0
            ? buildCrowd(kit.seatRows, {
                  density: kit.crowdDensity ?? 0.6,
                  palette: defaultCrowdPalette(params),
                  quality: "high",
              })
            : null;
    if (crowd) kit.root.add(crowd.mesh);
    const scene = new Scene();
    scene.add(kit.root, new HemisphereLight(0xffffff, 0x9a9a9a, 1.8));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(40, 120, 60);
    scene.add(sun, sun.target);
    // Roofs hide with the camera above them
    kit.onFrame?.({ cameraPosition: [0, 600, 0], dt: 0 });

    const box = new Box3().setFromObject(kit.root);
    const footprint: FieldFootprint = {
        minX: Math.max(box.min.x, fieldFootprint.minX - AROUND_REACH),
        maxX: Math.min(box.max.x, fieldFootprint.maxX + AROUND_REACH),
        minZ: Math.max(box.min.z, fieldFootprint.minZ - AROUND_REACH),
        maxZ: Math.min(box.max.z, fieldFootprint.maxZ + AROUND_REACH),
    };
    const done = () => {
        crowd?.dispose();
        kit.dispose();
    };
    if (
        !(footprint.maxX > footprint.minX) ||
        !(footprint.maxZ > footprint.minZ)
    ) {
        done();
        return null;
    }
    const layout = textureLayout(footprint, LONG_SIDE);
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;
    // Straight down, with the back of the field (min z) at the top
    const camera = new OrthographicCamera(
        footprint.minX - cx,
        footprint.maxX - cx,
        cz - footprint.minZ,
        -(footprint.maxZ - cz),
        1,
        2000,
    );
    camera.up.set(0, 0, -1);
    camera.position.set(cx, 800, cz);
    camera.lookAt(new Vector3(cx, 0, cz));
    camera.updateProjectionMatrix();

    const target = new WebGLRenderTarget(layout.width, layout.height, {
        samples: 4,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
    });
    const previous = gl.getRenderTarget();
    const clearColor = gl.getClearColor(new Color());
    const clearAlpha = gl.getClearAlpha();
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    gl.setClearColor(clearColor, clearAlpha);
    done();
    // The render's rows run bottom up: the field's back is at v = 1
    const texture = target.texture;
    texture.flipY = false;
    return {
        texture,
        footprint: { ...footprint, minZ: footprint.maxZ, maxZ: footprint.minZ },
        base: [0.5, 0.5, 0.5],
        linear: true,
        dispose: () => target.dispose(),
    };
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 bg;
uniform vec3 base;
uniform float amount;
uniform float saturation;
uniform float detail;
uniform float ink;
uniform float linearIn;
varying vec2 vUv;
vec3 saturate3(vec3 c, float s) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(l), c, s);
}
vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
    vec4 c = texture2D(map, vUv);
    if (linearIn > 0.5) c.rgb = toSrgb(c.rgb);
    if (ink > 0.5) {
        gl_FragColor = vec4(vec3(0.0), c.a * amount);
        return;
    }
    vec3 g = saturate3(c.rgb, saturation);
    vec3 washed = mix(bg, g, amount) + (g - saturate3(base, saturation)) * detail;
    gl_FragColor = vec4(clamp(washed, 0.0, 1.0), c.a);
}`;

interface Wash {
    amount: number;
    saturation: number;
    detail: number;
    ink: boolean;
    /** What the wash fades toward, 0..1 RGB. */
    background: [number, number, number];
}

/** A plane in field pixels showing `surface`, washed. */
function useSurfaceMesh(
    surface: Surface | null,
    fieldProperties: FieldProperties,
    wash: Wash | null,
    renderOrder: number,
): Mesh | null {
    const invalidate = useThree((s) => s.invalidate);
    const washKey = JSON.stringify(wash);
    const mesh = useMemo(() => {
        if (!surface || !wash) return null;
        const material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                map: { value: surface.texture },
                bg: { value: wash.background },
                base: { value: surface.base },
                amount: { value: wash.amount },
                saturation: { value: wash.saturation },
                detail: { value: wash.detail },
                ink: { value: wash.ink ? 1 : 0 },
                linearIn: { value: surface.linear ? 1 : 0 },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            // The camera's y runs down the screen, so the plane faces away from it
            side: DoubleSide,
        });
        const f = surface.footprint;
        const a = worldToPixels(fieldProperties, { x: f.minX, z: f.minZ });
        const b = worldToPixels(fieldProperties, { x: f.maxX, z: f.maxZ });
        const mesh = new Mesh(new PlaneGeometry(1, 1), material);
        mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
        mesh.scale.set(b.x - a.x, b.y - a.y, 1);
        mesh.frustumCulled = false;
        mesh.renderOrder = renderOrder;
        return mesh;
        // `washKey` stands for `wash`
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surface, fieldProperties, washKey, renderOrder]);

    useEffect(() => {
        invalidate();
        return () => {
            mesh?.geometry.dispose();
            (mesh?.material as ShaderMaterial | undefined)?.dispose();
            invalidate();
        };
    }, [mesh, invalidate]);
    return mesh;
}

/** Repaints once DM Sans is in, so end-zone lettering isn't a fallback face. */
function useFontsReady(): boolean {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let live = true;
        const fonts = document.fonts;
        if (!fonts?.load) {
            setReady(true);
            return;
        }
        void Promise.all([
            fonts.load('700 64px "DM Sans"'),
            fonts.load('600 64px "DM Sans"'),
        ])
            .catch(() => undefined)
            .then(() => {
                if (live) setReady(true);
            });
        return () => {
            live = false;
        };
    }, []);
    return ready;
}

/** The app's background, which shows around the field, 0..1 RGB. */
function pageBackground(): [number, number, number] {
    const css = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-bg-1")
        .match(/\d+(\.\d+)?/g);
    if (css && css.length >= 3)
        return [
            Number(css[0]) / 255,
            Number(css[1]) / 255,
            Number(css[2]) / 255,
        ];
    return document.documentElement.classList.contains("dark")
        ? [0.06, 0.05, 0.07]
        : [0.93, 0.92, 0.94];
}

export default function VenueUnderlayLayer({
    fieldProperties,
    look,
    around,
}: {
    fieldProperties: FieldProperties;
    /** The look's numbers, or null when the venue is off. */
    look: VenueLook | null;
    around: FieldVenueAround;
}) {
    const gl = useThree((s) => s.gl);
    const { data: venue } = useVenueSettings();
    const { image } = useFieldImage();
    const { theme: appTheme } = useTheme();
    const fontsReady = useFontsReady();
    const kitId: VenueKitId = venue?.kit ?? "hs";
    const style = KIT_FIELD_STYLE[kitId];
    const paramsKey = JSON.stringify(venue?.params ?? DEFAULT_VENUE_PARAMS);
    const lookKey = JSON.stringify(look);

    // The field surface: repainted for a new look, venue, field or image
    const [field, setField] = useState<Surface | null>(null);
    useEffect(() => {
        if (!look) {
            setField(null);
            return;
        }
        const plan = planField({
            fieldProperties,
            style,
            params: JSON.parse(paramsKey) as VenueParams,
            image,
        });
        // Only stadium turf has an edge (a gym's or arena's floor ends at its tarp), and the stands
        // bring their own ground
        const surface = paintSurface(
            plan,
            look,
            around === "edge" && style === "turf",
            image,
        );
        setField(surface);
        return () => surface.dispose();
        // `lookKey` stands for `look`
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldProperties, style, paramsKey, image, lookKey, around, fontsReady]);

    // Stands: a render, only for a new venue or field
    const [stands, setStands] = useState<Surface | null>(null);
    const wantStands = !!look && around === "stands";
    useEffect(() => {
        if (!wantStands) {
            setStands(null);
            return;
        }
        let live = true;
        void loadKits()
            .then((modules) => {
                if (!live) return;
                setStands(
                    renderAround(
                        modules,
                        gl,
                        kitId,
                        fieldProperties,
                        JSON.parse(paramsKey) as VenueParams,
                    ),
                );
            })
            .catch((error: unknown) =>
                console.warn("The venue's stands couldn't be drawn", error),
            );
        return () => {
            live = false;
        };
    }, [gl, wantStands, kitId, fieldProperties, paramsKey]);
    // A stands render is freed once the next one (or none) has replaced it on screen: the mesh
    // keeps drawing the old render target while the new one renders
    useEffect(() => () => stands?.dispose(), [stands]);

    const fieldBackground = fieldProperties.theme.background;
    const fieldMesh = useSurfaceMesh(
        field,
        fieldProperties,
        look && {
            amount: look.amount,
            saturation: look.saturation,
            detail: look.detail,
            ink: look.ink,
            background: [
                fieldBackground.r / 255,
                fieldBackground.g / 255,
                fieldBackground.b / 255,
            ],
        },
        FIELD_ORDER,
    );
    // Around the field the page shows, so the stands fade toward it (dark in dark mode)
    const page = useMemo(
        () => pageBackground(),
        // `appTheme` is what the dark class follows
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [appTheme],
    );
    const standsMesh = useSurfaceMesh(
        stands,
        fieldProperties,
        look && {
            amount: look.aroundAmount,
            saturation: look.ink ? 0 : look.saturation,
            detail: 0,
            ink: false,
            background: page,
        },
        AROUND_ORDER,
    );

    return (
        <>
            {standsMesh && <primitive object={standsMesh} />}
            {fieldMesh && <primitive object={fieldMesh} />}
        </>
    );
}
