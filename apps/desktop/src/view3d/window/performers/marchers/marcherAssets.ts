/**
 * Loads om-pose's marcher assets in the 3D View window (ADR 0002 D-7).
 *
 * Vite emits each GLB and the manifest as its own file (`?url`), so they stay
 * out of the JavaScript bundle and nothing is fetched until a show needs it.
 * The window loads them from the app's files (`file://` in the packaged app),
 * never from the network. Each load is cached for the window's lifetime.
 */
// cspell:ignore gltf
import type { AnimationClip, Group, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import manifestUrl from "@/view3d/assets/om-pose/manifest.json?url";
import type { Manifest } from "@/view3d/vendor/om-pose/step-blend.js";
import {
    BODY_TYPES,
    classTag,
    type BodyType,
    type HeightClass,
} from "@/view3d/core/marchers/looks";

const bodyUrls = import.meta.glob<string>(
    "../../../assets/om-pose/bodies/*.glb",
    { query: "?url", import: "default", eager: true },
);
const clipUrls = import.meta.glob<string>(
    "../../../assets/om-pose/clips/*.glb",
    { query: "?url", import: "default", eager: true },
);

const urlFor = (urls: Record<string, string>, file: string) => {
    const key = Object.keys(urls).find((k) => k.endsWith(`/${file}`));
    if (!key) throw new Error(`3D View: no bundled asset ${file}`);
    return urls[key];
};

export interface LoadedBody {
    scene: Group;
    mesh: SkinnedMesh;
}

let manifestPromise: Promise<Manifest> | null = null;
let bodiesPromise: Promise<Map<BodyType, LoadedBody>> | null = null;
const classPromises = new Map<HeightClass, Promise<AnimationClip[]>>();

/** The clip manifest (what each clip is, how far it travels). */
export function loadManifest(): Promise<Manifest> {
    manifestPromise ??= fetch(manifestUrl).then((r) => {
        if (!r.ok) throw new Error(`3D View: manifest ${r.status}`);
        return r.json() as Promise<Manifest>;
    });
    return manifestPromise;
}

async function loadBody(type: BodyType): Promise<LoadedBody> {
    const gltf = await new GLTFLoader().loadAsync(
        urlFor(bodyUrls, `${type}.glb`),
    );
    let mesh: SkinnedMesh | null = null;
    gltf.scene.traverse((o) => {
        if (!mesh && (o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
    });
    if (!mesh) throw new Error(`3D View: body ${type} has no skinned mesh`);
    return { scene: gltf.scene, mesh };
}

/** All seven bodies (about 1.7 MB). */
export function loadBodies(): Promise<Map<BodyType, LoadedBody>> {
    bodiesPromise ??= Promise.all(BODY_TYPES.map(loadBody)).then(
        (bodies) => new Map(BODY_TYPES.map((t, i) => [t, bodies[i]])),
    );
    return bodiesPromise;
}

/** Every clip of one height class (one packed GLB, about 5.9 MB). */
export function loadClassClips(h: HeightClass): Promise<AnimationClip[]> {
    let p = classPromises.get(h);
    if (!p) {
        p = new GLTFLoader()
            .loadAsync(urlFor(clipUrls, `clips-${classTag(h)}.glb`))
            .then((gltf) => gltf.animations);
        classPromises.set(h, p);
    }
    return p;
}
