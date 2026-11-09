// cspell:ignore tonemap
/**
 * An environment map for reflective surfaces (docs/3d/instruments.md §4,
 * fidelity.md "sky-baked environment lighting"): the lighting preset's
 * procedural sky over its ground (turf outdoors, a room's floor indoors),
 * rendered to a PMREM. Brass, chrome and anything glossy reflects it. The
 * scene builder is pure three and testable; `createEnvironmentMap` needs a
 * renderer.
 */
import {
    BackSide,
    CircleGeometry,
    Color,
    Mesh,
    MeshBasicMaterial,
    PMREMGenerator,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    type Texture,
    type WebGLRenderer,
} from "three";
import type { LightingPreset } from "../types";
import { lightingValues } from "./lighting";
import {
    applySkyPreset,
    createSkyUniforms,
    SKY_VERTEX,
    skyFragmentShader,
} from "./skyShader";

/** The procedural sky (`skyShader.ts`), untouched by tone mapping, on a small sphere. */
function skyMaterial(preset: LightingPreset): ShaderMaterial {
    const uniforms = createSkyUniforms();
    applySkyPreset(uniforms, preset);
    return new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: skyFragmentShader({
            octaves: 3,
            cloudLighting: false,
            tonemap: false,
            landBand: false,
        }),
    });
}

/** The scene the environment map is rendered from: sky dome and ground. */
export function environmentScene(preset: LightingPreset): Scene {
    const v = lightingValues(preset);
    const scene = new Scene();
    const sky = new Mesh(new SphereGeometry(50, 32, 16), skyMaterial(preset));
    sky.name = "env-sky";
    const ground = new Mesh(
        new CircleGeometry(60, 32),
        new MeshBasicMaterial({
            color: new Color(v.envGround).multiplyScalar(
                v.hemisphere.intensity,
            ),
        }),
    );
    ground.name = "env-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.6; // the map is taken at a standing eye's height
    scene.add(sky, ground);
    return scene;
}

export function disposeEnvironmentScene(scene: Scene): void {
    scene.traverse((o) => {
        if (o instanceof Mesh) {
            o.geometry.dispose();
            (o.material as ShaderMaterial | MeshBasicMaterial).dispose();
        }
    });
}

/**
 * The preset's environment map. The caller sets `scene.environment` to
 * `texture` and calls `dispose` when done. Each call builds and throws away
 * a PMREM generator, which compiles its shaders again: fine per preset change.
 */
export interface EnvironmentMap {
    texture: Texture;
    /** Frees the render target behind the texture. */
    dispose(): void;
}

export function createEnvironmentMap(
    renderer: WebGLRenderer,
    preset: LightingPreset,
): EnvironmentMap {
    const scene = environmentScene(preset);
    const generator = new PMREMGenerator(renderer);
    const target = generator.fromScene(scene, 0.04);
    generator.dispose();
    disposeEnvironmentScene(scene);
    return { texture: target.texture, dispose: () => target.dispose() };
}
