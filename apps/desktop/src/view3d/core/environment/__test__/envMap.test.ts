// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Mesh, type MeshBasicMaterial, type ShaderMaterial } from "three";
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

    it("gives metal something dark and something bright to reflect", () => {
        const day = environmentScene("day");
        // the stands ring the horizon, darker than the sky above them
        expect(day.getObjectByName("env-stands")).toBeInstanceOf(Mesh);
        // the sun is many times brighter than white
        const sun = day.getObjectByName("env-sun") as Mesh;
        expect((sun.material as MeshBasicMaterial).color.r).toBeGreaterThan(8);
        expect(day.getObjectByName("env-cloud")).toBeInstanceOf(Mesh);
        expect(day.getObjectByName("env-lamp")).toBeUndefined();

        // at night the light towers stand in for the sun
        const night = environmentScene("night");
        expect(night.getObjectByName("env-sun")).toBeUndefined();
        const lamp = night.getObjectByName("env-lamp") as Mesh;
        expect((lamp.material as MeshBasicMaterial).color.r).toBeGreaterThan(8);

        // a hall has neither: its ceiling panels light the horns
        const house = environmentScene("house");
        expect(house.getObjectByName("env-sun")).toBeUndefined();
        expect(house.getObjectByName("env-panel")).toBeInstanceOf(Mesh);
    });

    it("disposes its own geometry and materials", () => {
        const scene = environmentScene("day");
        let meshes = 0;
        let disposed = 0;
        scene.traverse((o) => {
            if (o instanceof Mesh) {
                meshes++;
                o.geometry.dispose = () => void disposed++;
                (o.material as ShaderMaterial).dispose = () => void disposed++;
            }
        });
        disposeEnvironmentScene(scene);
        expect(meshes).toBeGreaterThan(2);
        expect(disposed).toBe(meshes * 2);
    });
});
