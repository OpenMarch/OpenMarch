/**
 * The import review's 3D comparison (fork #1091): the model at the chosen level beside another
 * version of it (the Original, or the Light copy kept beside a heavier level), one at a time on
 * the same camera, to orbit and judge whether simplifying broke it. "From the stands" moves the
 * camera 30 m out, where props are mostly seen.
 *
 * Loaded on demand (`ModelImportReview` imports it lazily): it brings three.js's GLTF loader and
 * a WebGL canvas into the editor only while the comparison is open.
 */
// cspell:ignore gltf
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useBounds } from "@react-three/drei";
import {
    Box3,
    Texture,
    Vector3,
    type Material,
    type Mesh,
    type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SegmentedTextSwitch, Button } from "@openmarch/ui";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";

/** One version to show: its GLB bytes, or null while it loads */
export interface CompareVersion {
    key: string;
    label: string;
    bytes: Uint8Array | null;
    /** True when this version couldn't be made: the view says so instead of waiting */
    failed?: boolean;
    testId: string;
}

/** How far out "From the stands" puts the camera, in meters */
const STANDS_M = 30;

function disposeScene(scene: Object3D): void {
    scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials: Material[] = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
        for (const material of materials) {
            for (const value of Object.values(material))
                if (value instanceof Texture) value.dispose();
            material.dispose();
        }
    });
}

/** Parses GLB bytes into a scene, freed when the bytes change or the view closes */
function useParsed(bytes: Uint8Array | null): {
    scene: Object3D | null;
    failed: boolean;
} {
    const [scene, setScene] = useState<Object3D | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        setFailed(false);
        if (!bytes) return;
        let live = true;
        let parsed: Object3D | null = null;
        // A copy: the bytes are shared with the review
        new GLTFLoader()
            .parseAsync(bytes.slice().buffer, "")
            .then((gltf) => {
                parsed = gltf.scene;
                if (live) setScene(parsed);
                else disposeScene(parsed);
            })
            .catch(() => {
                if (!live) return;
                setScene(null);
                setFailed(true);
            });
        return () => {
            live = false;
            setScene(null);
            // After the frame that stops drawing it, so it isn't uploaded again to be drawn once
            const old = parsed;
            if (old) requestAnimationFrame(() => disposeScene(old));
        };
    }, [bytes]);
    return { scene, failed };
}

/**
 * Fits the camera to the first version once it's drawn, then leaves it alone, so switching
 * versions keeps the view; moves it to the stands and back on request.
 */
function CameraPlace({ stands, ready }: { stands: boolean; ready: boolean }) {
    const bounds = useBounds();
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as {
        target: Vector3;
        update: () => void;
    } | null;
    const fitted = useRef(false);
    useEffect(() => {
        if (!ready || fitted.current) return;
        fitted.current = true;
        bounds.refresh().clip().fit();
    }, [ready, bounds]);
    const first = useRef(true);
    useEffect(() => {
        // The first fit is the one above
        if (first.current) {
            first.current = false;
            return;
        }
        if (!stands) {
            bounds.refresh().clip().fit();
            return;
        }
        const target = controls?.target ?? new Vector3();
        const direction = camera.position.clone().sub(target).normalize();
        camera.position.copy(target).addScaledVector(direction, STANDS_M);
        camera.far = Math.max(camera.far, STANDS_M * 4);
        camera.updateProjectionMatrix();
        controls?.update();
    }, [stands, bounds, camera, controls]);
    return null;
}

function Model({ scene }: { scene: Object3D }) {
    // Centered over the origin, standing on it, as the import stores it
    const offset = useMemo(() => {
        const box = new Box3().setFromObject(scene);
        const center = box.getCenter(new Vector3());
        return [-center.x, 0, -center.z] as const;
    }, [scene]);
    return <primitive object={scene} position={offset} />;
}

export default function ModelCompareView({
    versions,
}: {
    versions: readonly CompareVersion[];
}) {
    const { t } = useTranslate();
    const [shown, setShown] = useState(versions[0]?.key ?? "");
    const [stands, setStands] = useState(false);
    const version = versions.find((v) => v.key === shown) ?? versions[0];
    const parsed = useParsed(version?.bytes ?? null);
    const scene = parsed.scene;
    const failed = parsed.failed || !!version?.failed;

    return (
        <div className="flex flex-col gap-12" data-testid="model-compare">
            <SegmentedTextSwitch
                ariaLabel={t("props.import.compare.which")}
                selected={shown}
                setSelected={setShown}
                options={versions.map((v) => ({
                    value: v.key,
                    label: v.label,
                    testId: v.testId,
                }))}
            />
            <div className="rounded-6 border-stroke relative h-[min(24rem,40vh)] w-full overflow-hidden border bg-white">
                <Canvas
                    camera={{
                        fov: 35,
                        near: 0.01,
                        far: 500,
                        position: [2, 1.5, 3],
                    }}
                    dpr={[1, 2]}
                    data-testid="model-compare-canvas"
                >
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[3, 6, 4]} intensity={2.2} />
                    <directionalLight position={[-4, 2, -3]} intensity={0.6} />
                    <Suspense fallback={null}>
                        <Bounds clip margin={1.3}>
                            {scene && <Model scene={scene} />}
                            <CameraPlace stands={stands} ready={!!scene} />
                        </Bounds>
                    </Suspense>
                    <OrbitControls makeDefault enableDamping />
                </Canvas>
                {failed && (
                    <p
                        className="text-sub text-text-subtitle absolute inset-x-16 top-1/2 -translate-y-1/2 text-center"
                        data-testid="model-compare-failed"
                    >
                        {t("props.import.compare.drawFailed")}
                    </p>
                )}
                {!scene && !failed && (
                    <SpinnerGapIcon
                        size={32}
                        className="text-text-subtitle absolute top-1/2 left-1/2 -translate-1/2 animate-spin"
                        role="img"
                        aria-label={t("props.import.working")}
                    />
                )}
            </div>
            <div className="flex items-center justify-between gap-8">
                <span className="text-sub text-text-subtitle">
                    {t("props.import.compare.hint")}
                </span>
                <Button
                    size="compact"
                    variant="secondary"
                    onClick={() => setStands((s) => !s)}
                    data-testid="model-compare-stands"
                >
                    {stands
                        ? t("props.import.compare.closeUp")
                        : t("props.import.compare.stands")}
                </Button>
            </div>
        </div>
    );
}
