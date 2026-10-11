import { describe, expect, it } from "vitest";
import { Mesh, type ShaderMaterial } from "three";
import { disposeEnvironmentScene, environmentScene, lightingValues } from "..";

describe("environmentScene", () => {
    it("builds a sky in the preset's gradient over a ground plane", () => {
        const scene = environmentScene("day");
        const sky = scene.getObjectByName("env-sky") as Mesh;
        const ground = scene.getObjectByName("env-ground") as Mesh;
        expect(sky).toBeInstanceOf(Mesh);
        expect(ground).toBeInstanceOf(Mesh);
        const u = (sky.material as ShaderMaterial).uniforms;
        const day = lightingValues("day");
        expect(u.top.value.getHex()).toBe(day.skyTop);
        expect(u.bottom.value.getHex()).toBe(day.skyBottom);
        expect(ground.position.y).toBeLessThan(0);
    });

    it("follows the preset", () => {
        const night = environmentScene("night");
        const u = (night.getObjectByName("env-sky") as Mesh)
            .material as ShaderMaterial;
        expect(u.uniforms.top.value.getHex()).toBe(
            lightingValues("night").skyTop,
        );
    });

    it("disposes its own geometry and materials", () => {
        const scene = environmentScene("day");
        let disposed = 0;
        scene.traverse((o) => {
            if (o instanceof Mesh) {
                o.geometry.dispose = () => void disposed++;
                (o.material as ShaderMaterial).dispose = () => void disposed++;
            }
        });
        disposeEnvironmentScene(scene);
        expect(disposed).toBe(4);
    });
});
