// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { PerspectiveCamera, Scene, SpotLight } from "three";
import {
    createEnvironment,
    setTexturePainting,
} from "@/view3d/core/environment";
import { buildHs } from "@/view3d/core/kits/hs";
import { warmLightingPresets, type ShaderCompiler } from "../warmLighting";

beforeAll(() => setTexturePainting(false));

function setup() {
    const scene = new Scene();
    const env = createEnvironment();
    const kit = buildHs({
        footprint: { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 },
        params: {
            homeColor: "#6442ff",
            awayColor: "#c23b3b",
            endZoneText: "",
            endZoneColor: "#1f2a5c",
        },
        quality: "high",
    });
    scene.add(env.root, kit.root);
    const spots: SpotLight[] = [];
    kit.root.traverse((o) => {
        if (o instanceof SpotLight) spots.push(o);
    });
    /** Which lights each compile saw on: sun, then whether the spots were. */
    const compiled: { sun: boolean; spots: boolean }[] = [];
    const gl: ShaderCompiler = {
        compileAsync: (s) => {
            expect(s).toBe(scene);
            compiled.push({
                sun: env.sun.visible,
                spots: spots.every((p) => p.visible),
            });
            return Promise.resolve(s);
        },
    };
    return { scene, env, kit, spots, compiled, gl };
}

describe("warmLightingPresets", () => {
    it("compiles the scene lit by each of the kit's other presets", async () => {
        const { scene, env, kit, compiled, gl } = setup();
        env.setLighting("day", kit.focus);
        kit.setLighting("day");

        await warmLightingPresets(gl, scene, new PerspectiveCamera(), {
            env,
            kit,
            current: "day",
        });

        // hs offers day, dusk and night: dusk lights sun and lamps, night
        // only the lamps.
        expect(compiled).toEqual([
            { sun: true, spots: true },
            { sun: false, spots: true },
        ]);
        env.dispose();
        kit.dispose();
    });

    it("puts the current preset back before the next frame", async () => {
        const { scene, env, kit, spots, gl } = setup();
        env.setLighting("night", kit.focus);
        kit.setLighting("night");
        const exposure = env.exposure;

        await warmLightingPresets(gl, scene, new PerspectiveCamera(), {
            env,
            kit,
            current: "night",
        });

        expect(env.sun.visible).toBe(false);
        expect(env.exposure).toBe(exposure);
        expect(spots.every((s) => s.visible && s.intensity > 0)).toBe(true);
        env.dispose();
        kit.dispose();
    });
});
