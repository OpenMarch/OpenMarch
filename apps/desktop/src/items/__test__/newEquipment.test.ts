// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pitVariant } from "@/view3d/core/pit/catalog";
import {
    equipmentRotationAt,
    newEquipment,
    nextEquipmentName,
} from "../newEquipment";

describe("nextEquipmentName", () => {
    it("numbers the first of a kind 1", () => {
        expect(nextEquipmentName("Marimba", [])).toBe("Marimba 1");
        expect(nextEquipmentName("Marimba", [null, "Riser"])).toBe("Marimba 1");
    });

    it("numbers past the highest of that kind, not the count", () => {
        expect(
            nextEquipmentName("Marimba", [
                "Marimba 1",
                "Marimba 3",
                "Vibraphone 7",
            ]),
        ).toBe("Marimba 4");
    });

    it("ignores names that only start the same", () => {
        expect(
            nextEquipmentName("Gong", ["Gong stand 9", "Gong 2b", "gong 5"]),
        ).toBe("Gong 1");
    });

    it("reads a name with pattern characters literally", () => {
        expect(
            nextEquipmentName("Drum set (cage)", ["Drum set (cage) 2"]),
        ).toBe("Drum set (cage) 3");
    });
});

describe("newEquipment", () => {
    it("makes a locked equipment item with the model's footprint, centered where it was placed", () => {
        const marimba = pitVariant("pit/marimba-5.0")!;
        expect(
            newEquipment({
                variant: marimba,
                name: "Marimba 2",
                home: [100, 60],
                beatId: 12,
            }),
        ).toEqual({
            kind: "equipment",
            name: "Marimba 2",
            model: "pit/marimba-5.0",
            locked: true,
            home: [100, 60],
            beatId: 12,
            geometry: {
                outlineType: "rectangle",
                width: marimba.footprint.width,
                depth: marimba.footprint.depth,
                height: marimba.footprint.height,
            },
        });
    });
});

describe("equipmentRotationAt", () => {
    // A field 800 units deep: the back sideline at y 0, the front at 800, the center line at 400
    const field = {
        centerFrontPoint: { xPixels: 600, yPixels: 800 },
        height: 800,
    };
    const podium = pitVariant("pit/conductor-podium")!;
    const tallPodium = pitVariant("pit/conductor-podium-tall")!;
    const marimba = pitVariant("pit/marimba-5.0")!;

    it("turns a podium on the back half to face the field", () => {
        expect(equipmentRotationAt(podium, { x: 600, y: 399 }, field)).toBe(
            180,
        );
        expect(equipmentRotationAt(tallPodium, { x: 0, y: 10 }, field)).toBe(
            180,
        );
    });

    it("turns the drum major's podiums like the conductor's", () => {
        for (const modelId of [
            "pit/podium-stand-2ft",
            "pit/podium-tower-6ft-black",
            "pit/podium-rolling-6ft",
            "pit/stepladder-6ft",
            "pit/scaffold-tower",
        ])
            expect(
                equipmentRotationAt(
                    pitVariant(modelId)!,
                    { x: 600, y: 10 },
                    field,
                ),
            ).toBe(180);
    });

    it("turns a podium behind the back sideline too", () => {
        expect(equipmentRotationAt(podium, { x: 600, y: -60 }, field)).toBe(
            180,
        );
    });

    it("leaves a podium on the front half, on the center line or in front of the field facing the field as built", () => {
        expect(equipmentRotationAt(podium, { x: 600, y: 400 }, field)).toBe(0);
        expect(equipmentRotationAt(podium, { x: 600, y: 700 }, field)).toBe(0);
        expect(equipmentRotationAt(podium, { x: 600, y: 900 }, field)).toBe(0);
    });

    it("never turns other equipment", () => {
        expect(equipmentRotationAt(marimba, { x: 600, y: 10 }, field)).toBe(0);
    });

    it("reads the center line from where the field's front is", () => {
        const shifted = {
            centerFrontPoint: { xPixels: 600, yPixels: 1000 },
            height: 800,
        };
        expect(equipmentRotationAt(podium, { x: 0, y: 599 }, shifted)).toBe(
            180,
        );
        expect(equipmentRotationAt(podium, { x: 0, y: 601 }, shifted)).toBe(0);
    });
});

it("newEquipment keeps a turn it is given", () => {
    const podium = pitVariant("pit/conductor-podium")!;
    expect(
        newEquipment({
            variant: podium,
            name: "Podium 1",
            home: [0, 0],
            beatId: 1,
            rotation: 180,
        }).geometry.rotation,
    ).toBe(180);
});
