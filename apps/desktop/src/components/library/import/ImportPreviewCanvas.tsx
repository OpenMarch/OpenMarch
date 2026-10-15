/**
 * The import preview's three.js canvas (package C1.10; ADR 0002 D-13): the
 * in-editor preview `docs/3d/ui.md` reserved. Code-split: the stage loads
 * this module with `import()`, so the editor bundle only pays for it when an
 * import opens.
 *
 * Built from the 3D View's `core/` builders: the shared lighting rig
 * (`createEnvironment`) and its environment map, with a 1.8 m reference
 * performer (`CLASS_HEIGHT_M`) beside the model. The GLB is the normalized
 * one main reviewed, loaded with bare `GLTFLoader` from a `blob:` URL
 * (D-15): no decoders, as in the 3D View.
 *
 * Clicking the model while `picking` reports the point in the normalized
 * GLB's meters, which is what the grip choice takes. `highlightMaterial`
 * lights one material, by its index in the GLB (`MaterialInfo.outputIndex`),
 * for the artwork surface choice (Q67).
 */
// cspell:ignore frameloop
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
    ACESFilmicToneMapping,
    Box3,
    CapsuleGeometry,
    Color,
    GridHelper,
    Group,
    LineBasicMaterial,
    Mesh,
    MeshStandardMaterial,
    SphereGeometry,
    SRGBColorSpace,
    type Object3D,
    type PerspectiveCamera,
    type Scene,
    type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
    createEnvironment,
    createEnvironmentMap,
} from "@/view3d/core/environment";
import { CLASS_HEIGHT_M } from "@/view3d/core/marchers/looks";
import {
    boundsSize,
    gridFor,
    placementOffset,
    thumbnailSize,
    viewCamera,
    type Bounds,
    type PreviewView,
    type Vec3,
} from "./previewMath";
import { highlightMaterials, tagMaterials } from "./previewMaterials";

export interface ImportPreviewCanvasProps {
    url: string;
    /** Shown instead of `url` when `showBefore` (simplify's before). */
    beforeUrl: string | null;
    showBefore: boolean;
    /** The grip, in the normalized GLB's meters. */
    grip: Vec3 | null;
    /** A material of the GLB, by index, to light (the artwork surface). */
    highlightMaterial?: number | null;
    picking: boolean;
    view: PreviewView;
    /** Bumped to fly back to `view` after orbiting. */
    viewNonce: number;
    onPick: (point: Vec3) => void;
    onBounds?: (bounds: Bounds | null) => void;
    /** Receives a function that captures a 256 px PNG of the canvas (Q50). */
    onCaptureReady?: (
        capture: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null,
    ) => void;
    onError?: () => void;
    /** The before model failed to load; the after model stays. */
    onBeforeError?: () => void;
}

const FIGURE_RADIUS = 0.18;

function cssColor(name: string, fallback: string): Color {
    const value =
        typeof document !== "undefined"
            ? getComputedStyle(document.documentElement)
                  .getPropertyValue(name)
                  .trim()
            : "";
    // Tokens may carry alpha (`#rrggbbaa`); three.js colors take none.
    const hex = /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value;
    try {
        return new Color(hex || fallback);
    } catch {
        return new Color(fallback);
    }
}

/** Loads a GLB from a URL; disposes what it loaded when the URL changes. */
function useGltf(url: string | null, onError?: () => void): Object3D | null {
    const [scene, setScene] = useState<Object3D | null>(null);
    useEffect(() => {
        if (!url) {
            setScene(null);
            return;
        }
        let cancelled = false;
        let loaded: Object3D | null = null;
        new GLTFLoader()
            .loadAsync(url)
            .then((gltf) => {
                if (cancelled) return;
                loaded = gltf.scene;
                tagMaterials(gltf.scene, gltf.parser.associations);
                // Measured now, before it joins the placed group: measuring
                // later would include the previous model's offset.
                gltf.scene.userData.importBounds = measure(gltf.scene);
                setScene(gltf.scene);
            })
            .catch((error) => {
                console.error("Import preview: GLB failed to load", error);
                if (!cancelled) onError?.();
            });
        return () => {
            cancelled = true;
            loaded?.traverse((o) => {
                const mesh = o as Mesh;
                if (!mesh.isMesh) return;
                mesh.geometry.dispose();
                const materials = Array.isArray(mesh.material)
                    ? mesh.material
                    : [mesh.material];
                for (const m of materials) {
                    for (const value of Object.values(m)) {
                        if (
                            value &&
                            typeof value === "object" &&
                            "isTexture" in value
                        ) {
                            (value as { dispose(): void }).dispose();
                        }
                    }
                    m.dispose();
                }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);
    return scene;
}

function measure(object: Object3D): Bounds | null {
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    return { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
}

function Lighting() {
    const { gl, scene, invalidate } = useThree();
    useEffect(() => {
        const env = createEnvironment({ quality: "low" });
        env.sky.mesh.visible = false;
        env.setLighting("day");
        scene.add(env.root);
        const map = createEnvironmentMap(gl, "day");
        scene.environment = map.texture;
        gl.toneMappingExposure = env.exposure;
        invalidate();
        return () => {
            scene.remove(env.root);
            scene.environment = null;
            map.dispose();
            env.dispose();
        };
    }, [gl, scene, invalidate]);
    return null;
}

function Floor({ size }: { size: Vec3 }) {
    const grid = useMemo(() => {
        const { size: extent, divisions } = gridFor(size);
        const helper = new GridHelper(
            extent,
            divisions,
            cssColor("--color-text-subtitle", "#888888"),
            cssColor("--color-stroke", "#444444"),
        );
        const material = helper.material as LineBasicMaterial;
        material.transparent = true;
        material.opacity = 0.5;
        helper.userData.previewHelper = true;
        return helper;
    }, [size]);
    useEffect(
        () => () => {
            grid.geometry.dispose();
            (grid.material as LineBasicMaterial).dispose();
        },
        [grid],
    );
    return <primitive object={grid} />;
}

/** A 1.8 m stand-in performer beside the model, for scale. */
function ReferenceFigure({ x }: { x: number }) {
    const parts = useMemo(() => {
        const material = new MeshStandardMaterial({
            color: cssColor("--color-text-subtitle", "#9a9a9a"),
            roughness: 0.9,
            transparent: true,
            opacity: 0.55,
        });
        const body = new CapsuleGeometry(
            FIGURE_RADIUS,
            CLASS_HEIGHT_M * 0.78 - FIGURE_RADIUS * 2,
            4,
            12,
        );
        const head = new SphereGeometry(0.11, 16, 12);
        return { material, body, head };
    }, []);
    useEffect(
        () => () => {
            parts.material.dispose();
            parts.body.dispose();
            parts.head.dispose();
        },
        [parts],
    );
    const bodyHeight = CLASS_HEIGHT_M * 0.78;
    return (
        <group
            position={[x, 0, 0]}
            name="reference-figure"
            userData={{ previewHelper: true }}
        >
            <mesh
                geometry={parts.body}
                material={parts.material}
                position={[0, bodyHeight / 2, 0]}
            />
            <mesh
                geometry={parts.head}
                material={parts.material}
                position={[0, CLASS_HEIGHT_M - 0.11, 0]}
            />
        </group>
    );
}

function GripMarker({ position }: { position: Vec3 }) {
    const parts = useMemo(() => {
        const material = new MeshStandardMaterial({
            color: cssColor("--color-accent", "#967eff"),
            emissive: cssColor("--color-accent", "#967eff"),
            emissiveIntensity: 0.6,
            depthTest: false,
            transparent: true,
        });
        const geometry = new SphereGeometry(0.025, 16, 12);
        return { material, geometry };
    }, []);
    useEffect(
        () => () => {
            parts.material.dispose();
            parts.geometry.dispose();
        },
        [parts],
    );
    return (
        <mesh
            name="grip-marker"
            userData={{ previewHelper: true }}
            geometry={parts.geometry}
            material={parts.material}
            position={position}
            renderOrder={10}
        />
    );
}

function Controls({
    center,
    size,
    view,
    viewNonce,
}: {
    center: Vec3;
    size: Vec3;
    view: PreviewView;
    viewNonce: number;
}) {
    const { camera, gl, invalidate, size: viewport } = useThree();
    const sizeKey = size.join(",");
    const controls = useMemo(
        () => new OrbitControls(camera, gl.domElement),
        [camera, gl],
    );
    useEffect(() => {
        // StrictMode replays effects on the same memoized controls, and the
        // cleanup's dispose() disconnects them: connect again on every run.
        controls.connect(gl.domElement);
        controls.enableDamping = false;
        controls.maxPolarAngle = Math.PI / 2 - 0.01;
        const change = () => invalidate();
        controls.addEventListener("change", change);
        return () => {
            controls.removeEventListener("change", change);
            controls.dispose();
        };
    }, [controls, gl, invalidate]);
    useEffect(() => {
        const cam = camera as PerspectiveCamera;
        const placed = viewCamera(
            size,
            center,
            view,
            cam.fov,
            viewport.width / Math.max(1, viewport.height),
        );
        cam.up.set(...placed.up);
        cam.position.set(...placed.position);
        const radius = Math.hypot(...size);
        cam.near = Math.max(0.01, radius / 200);
        cam.far = Math.max(100, radius * 20);
        cam.updateProjectionMatrix();
        controls.target.set(...placed.target);
        // Top view keeps its own up; orbiting from it is still allowed.
        controls.maxPolarAngle = view === "top" ? Math.PI : Math.PI / 2 - 0.01;
        controls.update();
        invalidate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, viewNonce, sizeKey, viewport.width, viewport.height]);
    return null;
}

/** What a thumbnail capture shows, read when the capture runs. */
interface CaptureState {
    after: Object3D | null;
    shown: Object3D | null;
    holder: Group | null;
    highlight: number | null;
    size: Vec3 | null;
}

/**
 * Draws the Library thumbnail (Q50) into a 2D canvas: the after model alone,
 * unlit by the surface highlight and framed from the front, whatever the
 * stage shows. The grid, reference figure and grip marker are hidden for
 * that one frame, then everything is put back.
 */
function drawThumbnail(
    gl: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    state: CaptureState,
    accent: Color,
): HTMLCanvasElement | null {
    const { after, shown, holder, highlight, size } = state;
    if (!after || !shown || !holder || !size) return null;
    const hidden: Object3D[] = [];
    scene.traverse((o) => {
        if (o.userData.previewHelper && o.visible) {
            o.visible = false;
            hidden.push(o);
        }
    });
    const swapped = shown !== after;
    if (swapped) {
        shown.visible = false;
        holder.add(after);
    }
    highlightMaterials(after, null, accent);
    const saved = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        up: camera.up.clone(),
    };
    const source = gl.domElement;
    try {
        const placed = viewCamera(
            size,
            [0, size[1] / 2, 0],
            "front",
            camera.fov,
            source.width / Math.max(1, source.height),
        );
        camera.up.set(...placed.up);
        camera.position.set(...placed.position);
        camera.lookAt(...placed.target);
        camera.updateMatrixWorld();
        gl.render(scene, camera);
        const target = thumbnailSize(source.width, source.height, 256);
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(source, 0, 0, target.width, target.height);
        return canvas;
    } finally {
        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        camera.up.copy(saved.up);
        camera.updateMatrixWorld();
        if (swapped) {
            holder.remove(after);
            shown.visible = true;
        }
        for (const o of hidden) o.visible = true;
        highlightMaterials(shown, highlight, accent);
        gl.render(scene, camera);
    }
}

function PreviewScene(props: ImportPreviewCanvasProps) {
    const { invalidate, gl, scene, camera } = useThree();
    const after = useGltf(props.url, props.onError);
    const before = useGltf(props.beforeUrl, props.onBeforeError);
    const shown = props.showBefore && before ? before : after;
    const [bounds, setBounds] = useState<Bounds | null>(null);
    const holder = useRef<Group>(null);

    useEffect(() => {
        // Measure the after model; before shares its placement.
        const b = after
            ? ((after.userData.importBounds as Bounds | null) ?? null)
            : null;
        setBounds(b);
        props.onBounds?.(b);
        invalidate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [after]);

    useEffect(() => invalidate(), [shown, props.grip, invalidate]);

    const highlight = props.highlightMaterial ?? null;
    const accent = useMemo(() => cssColor("--color-accent", "#967eff"), []);
    useEffect(() => {
        if (!shown) return;
        highlightMaterials(shown, highlight, accent);
        invalidate();
    }, [shown, highlight, accent, invalidate]);

    const captureState = useRef<CaptureState>({
        after: null,
        shown: null,
        holder: null,
        highlight: null,
        size: null,
    });
    captureState.current = {
        after,
        shown,
        holder: holder.current,
        highlight,
        size: bounds ? boundsSize(bounds) : null,
    };
    const { onCaptureReady } = props;
    useEffect(() => {
        if (!onCaptureReady) return;
        onCaptureReady(async () => {
            const canvas = drawThumbnail(
                gl,
                scene,
                camera as PerspectiveCamera,
                // The holder mounts after the first render: read it now.
                { ...captureState.current, holder: holder.current },
                accent,
            );
            if (!canvas) return null;
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png"),
            );
            return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        });
        return () => onCaptureReady(null);
    }, [gl, scene, camera, accent, onCaptureReady]);

    if (!shown || !bounds) return null;
    const offset = placementOffset(bounds);
    const size = boundsSize(bounds);
    const figureX = size[0] / 2 + FIGURE_RADIUS + Math.max(0.3, size[0] * 0.15);
    // The model spans ±size/2 in x; the figure stands to its right.
    const left = -size[0] / 2;
    const right = figureX + FIGURE_RADIUS;
    const sceneSize: Vec3 = [
        right - left,
        Math.max(size[1], CLASS_HEIGHT_M),
        Math.max(size[2], FIGURE_RADIUS * 2),
    ];
    const center: Vec3 = [(left + right) / 2, sceneSize[1] / 2, 0];

    const click = (event: ThreeEvent<MouseEvent>) => {
        if (!props.picking || event.delta > 4) return;
        event.stopPropagation();
        const p = event.point;
        props.onPick([p.x - offset[0], p.y - offset[1], p.z - offset[2]]);
    };

    return (
        <>
            <Floor size={sceneSize} />
            <ReferenceFigure x={figureX} />
            <group ref={holder} position={offset} onClick={click}>
                <primitive object={shown} />
                {props.grip && <GripMarker position={props.grip} />}
            </group>
            <Controls
                center={center}
                size={sceneSize}
                view={props.view}
                viewNonce={props.viewNonce}
            />
        </>
    );
}

export default function ImportPreviewCanvas(props: ImportPreviewCanvasProps) {
    return (
        <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            data-testid="import-preview-canvas"
            camera={{ fov: 35, near: 0.01, far: 1000, position: [0, 1, 4] }}
            gl={{ preserveDrawingBuffer: true, alpha: true }}
            onCreated={({ gl }) => {
                gl.toneMapping = ACESFilmicToneMapping;
                gl.outputColorSpace = SRGBColorSpace;
                gl.setClearColor(0x000000, 0);
            }}
            style={{ cursor: props.picking ? "crosshair" : "grab" }}
        >
            <Lighting />
            <PreviewScene {...props} />
        </Canvas>
    );
}
