// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MeshBasicMaterial } from "three";
import { createEnvironment, GROUND_LAYER, setGroundLayer } from "..";
import { buildBlank } from "../../kits/blank";
import { setTexturePainting } from "../textures";

describe("ground layers", () => {
    it("stack from the land up to the selection rings", () => {
        const order = [
            GROUND_LAYER.ground,
            GROUND_LAYER.land,
            GROUND_LAYER.site,
            GROUND_LAYER.lots,
            GROUND_LAYER.track,
            GROUND_LAYER.decal,
            GROUND_LAYER.field,
            GROUND_LAYER.contact,
            GROUND_LAYER.selection,
        ];
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(new Set(order).size).toBe(order.length);
    });

    it("draws a higher level in front", () => {
        const field = setGroundLayer(
            new MeshBasicMaterial(),
            GROUND_LAYER.field,
        );
        const ring = setGroundLayer(
            new MeshBasicMaterial(),
            GROUND_LAYER.selection,
        );
        expect(ring.polygonOffsetFactor).toBeLessThan(
            field.polygonOffsetFactor,
        );
        expect(ring.polygonOffsetUnits).toBeLessThan(field.polygonOffsetUnits);
    });
});

describe("surroundings", () => {
    it("the blank venue opts out of the land and horizon", () => {
        setTexturePainting(false);
        const kit = buildBlank({
            footprint: { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 },
            params: {
                homeColor: "#6442ff",
                awayColor: "#c23b3b",
                endZoneText: "",
                endZoneColor: "#1f2a5c",
            },
            quality: "high",
        });
        expect(kit.surroundings).toBe(false);
        const env = createEnvironment({ quality: "high" });
        env.setSurroundings(false);
        env.setLighting("day", kit.focus);
        expect(env.land?.mesh.visible).toBe(false);
        expect(env.horizon?.mesh.visible).toBe(false);
        env.setSurroundings(true);
        expect(env.land?.mesh.visible).toBe(true);
        expect(env.horizon?.mesh.visible).toBe(true);
        env.dispose();
        kit.dispose();
    });
});
