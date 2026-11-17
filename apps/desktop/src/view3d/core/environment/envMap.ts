// cspell:ignore tonemap
/**
 * An environment map for reflective surfaces (docs/3d/instruments.md §4,
 * fidelity.md "sky-baked environment lighting"): the lighting preset's
 * procedural sky over its ground (turf outdoors, a room's floor indoors),
 * with what makes polished metal read as metal: something dark to reflect
 * (the stands round the horizon), something far brighter than the sky (the
 * sun, the light towers, a gym's ceiling panels), and soft bright shapes
 * between (clouds). Rendered to a PMREM. Brass, silver and anything glossy
 * reflects it. The scene builder is pure three and testable;
 * `createEnvironmentMap` needs a renderer.
 */
import {
    BackSide,
    BoxGeometry,
    CircleGeometry,
    Color,
    CylinderGeometry,
    Mesh,
    MeshBasicMaterial,
    PMREMGenerator,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    Vector3,
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

/** The stands and tree line round the field, as a horn sees them: a dark band. */
const STANDS = 0x23262b;

/** A plain surface that lights nothing but the map: `scale` may exceed 1. */
const glow = (color: number, scale: number) =>
    new MeshBasicMaterial({ color: new Color(color).multiplyScalar(scale) });

/**
 * The scene the environment map is rendered from: sky dome and ground, a
 * dark ring of stands at the horizon, and the preset's bright sources.
 */
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

    // the stands: a dark band from the ground to a little above the horizon
    const stands = new Mesh(
        new CylinderGeometry(34, 34, 7, 48, 1, true),
        new MeshBasicMaterial({
            color: new Color(STANDS).multiplyScalar(
                0.35 + 0.65 * Math.min(1, v.hemisphere.intensity),
            ),
            side: BackSide,
        }),
    );
    stands.name = "env-stands";
    stands.position.y = -1.6 + 3.5;
    scene.add(stands);

    const moonlit = v.sky.moon > 0; // at night the sun slot holds the moon
    if (v.sun.intensity > 0 && !moonlit) {
        // the sun: small and many times brighter than the sky
        const sun = new Mesh(
            new SphereGeometry(2.2, 16, 8),
            glow(v.sun.color, 16 * v.sun.intensity),
        );
        sun.name = "env-sun";
        sun.position.copy(
            new Vector3(...v.sun.offset).normalize().multiplyScalar(44),
        );
        scene.add(sun);
        if (v.skyVisible) {
            // clouds: broad soft shapes a little brighter than the sky
            const clouds: [number, number, number, number][] = [
                [-20, 24, -30, 11],
                [26, 30, 10, 13],
                [-8, 34, 28, 10],
            ];
            for (const [x, y, z, size] of clouds) {
                const cloud = new Mesh(
                    new SphereGeometry(size, 16, 8),
                    glow(0xffffff, 0.75 * v.hemisphere.intensity + 0.5),
                );
                cloud.name = "env-cloud";
                cloud.scale.y = 0.28;
                cloud.position.set(x, y, z);
                scene.add(cloud);
            }
        }
    }
    if (v.kit.lampsOn) {
        // light towers at the field's corners
        for (const [x, z] of [
            [-1, -0.6],
            [1, -0.6],
            [-1, 0.6],
            [1, 0.6],
        ]) {
            const lamp = new Mesh(
                new BoxGeometry(4.5, 2.2, 0.4),
                glow(0xfff4dc, 26 * v.kit.lampScale),
            );
            lamp.name = "env-lamp";
            lamp.position.set(x * 30, 13, z * 30);
            lamp.lookAt(0, 0, 0);
            scene.add(lamp);
        }
    }
    const overhead =
        v.kit.panelEmissive * 4 +
        v.kit.barEmissive +
        v.kit.showSpotIntensity * 3;
    if (
        overhead > 0 &&
        (!v.skyVisible || !v.kit.roofOpen || v.sun.intensity === 0 || moonlit)
    ) {
        // a hall's ceiling panels, a dome's light bars, a show's spots
        for (const x of [-12, 0, 12])
            for (const z of [-7, 7]) {
                const panel = new Mesh(
                    new BoxGeometry(5, 0.3, 3),
                    glow(0xfff1dc, overhead),
                );
                panel.name = "env-panel";
                panel.position.set(x, 16, z);
                scene.add(panel);
            }
    }
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
