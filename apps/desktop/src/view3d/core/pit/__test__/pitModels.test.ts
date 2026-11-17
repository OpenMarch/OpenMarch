import { describe, expect, it } from "vitest";
import {
    PIT_MANIFEST,
    PIT_NEAR_M,
    PIT_FAR_M,
    hidesVenuePodium,
    isNearPitItem,
    isPodiumModel,
    modelsByMarcher,
    pitAssetFile,
    pitModelName,
    podiumHeading,
    podiumStandAt,
    podiumStandTop,
    writePitModelMatrix,
    type PitManifest,
} from "../pitModels";

const entry = (height: number, more: object = {}) => ({
    high: { sizeM: { width: 1, depth: 1, height } },
    low: { sizeM: { width: 1, depth: 1, height } },
    ...more,
});

const MANIFEST: PitManifest = {
    "marimba-5.0": entry(0.9),
    "conductor-podium": entry(1.386, { standTopM: 0.426, standAtM: [0, 0] }),
    "conductor-tower": entry(3, { standTopM: 2.4 }),
    "stepladder-6ft": entry(1.829, { standTopM: 1.2192, standAtM: [0, 0.2] }),
    "broken-podium": entry(1.5),
};

describe("pitModelName", () => {
    it("is the asset name of a built-in pit model id", () => {
        expect(pitModelName("pit/marimba-5.0", MANIFEST)).toBe("marimba-5.0");
    });

    it("is null for no model, another library, or a model the manifest doesn't list", () => {
        expect(pitModelName(null, MANIFEST)).toBeNull();
        expect(pitModelName(undefined, MANIFEST)).toBeNull();
        expect(pitModelName("", MANIFEST)).toBeNull();
        expect(pitModelName("marimba-5.0", MANIFEST)).toBeNull();
        expect(pitModelName("lib/marimba-5.0", MANIFEST)).toBeNull();
        expect(pitModelName("pit/marimba-9.9", MANIFEST)).toBeNull();
        expect(pitModelName("pit/../marimba-5.0", MANIFEST)).toBeNull();
    });

    it("knows every model the shipped manifest lists", () => {
        expect(Object.keys(PIT_MANIFEST).length).toBeGreaterThanOrEqual(44);
        expect(pitModelName("pit/marimba-5.0")).toBe("marimba-5.0");
        expect(pitModelName("pit/conductor-podium")).toBe("conductor-podium");
    });
});

describe("pitAssetFile", () => {
    it("is the model's file, with -low for the distant version", () => {
        expect(pitAssetFile("marimba-5.0", "high")).toBe("marimba-5.0.glb");
        expect(pitAssetFile("marimba-5.0", "low")).toBe("marimba-5.0-low.glb");
    });
});

describe("isPodiumModel", () => {
    it("is a model whose id names a podium, tower, scaffold or stepladder", () => {
        expect(isPodiumModel("pit/conductor-podium")).toBe(true);
        expect(isPodiumModel("pit/conductor-podium-tall")).toBe(true);
        expect(isPodiumModel("pit/director-tower")).toBe(true);
        expect(isPodiumModel("pit/scaffold-6ft")).toBe(true);
        expect(isPodiumModel("pit/stepladder")).toBe(true);
        expect(isPodiumModel("pit/marimba-5.0")).toBe(false);
        expect(isPodiumModel("pit/speaker-tall")).toBe(false);
        expect(isPodiumModel(null)).toBe(false);
    });
});

describe("podiumStandTop", () => {
    it("reads standTopM, the deck, not the model's full height", () => {
        expect(podiumStandTop("pit/conductor-tower", MANIFEST)).toBe(2.4);
        expect(podiumStandTop("pit/conductor-podium", MANIFEST)).toBe(0.426);
    });

    it("is null for a podium the manifest gives no standTopM: never the model's height", () => {
        expect(podiumStandTop("pit/broken-podium", MANIFEST)).toBeNull();
    });

    it("is null for a model that isn't a podium or isn't listed", () => {
        expect(podiumStandTop("pit/marimba-5.0", MANIFEST)).toBeNull();
        expect(podiumStandTop("pit/missing-podium", MANIFEST)).toBeNull();
        expect(podiumStandTop(null, MANIFEST)).toBeNull();
    });

    it("works for the shipped podiums", () => {
        expect(podiumStandTop("pit/conductor-podium")).toBe(0.426);
        expect(podiumStandTop("pit/conductor-podium-tall")).toBe(1.506);
    });

    it("has a standTopM and standAtM for every podium in the shipped manifest", () => {
        const podiums = Object.keys(PIT_MANIFEST).filter((name) =>
            isPodiumModel(`pit/${name}`),
        );
        expect(podiums.length).toBeGreaterThanOrEqual(14);
        for (const name of podiums) {
            const e = PIT_MANIFEST[name];
            expect(e.standTopM, name).toBeGreaterThan(0);
            expect(e.standTopM!, name).toBeLessThan(e.high.sizeM.height + 1e-6);
            expect(e.standAtM, name).toHaveLength(2);
            expect(Math.abs(e.standAtM![0]), name).toBeLessThan(
                e.high.sizeM.width / 2,
            );
            expect(Math.abs(e.standAtM![1]), name).toBeLessThan(
                e.high.sizeM.depth / 2,
            );
        }
    });
});

describe("podiumStandAt", () => {
    it("is the manifest's standAtM as x, z in the model's axes", () => {
        expect(podiumStandAt("pit/stepladder-6ft", MANIFEST)).toEqual({
            x: 0,
            z: 0.2,
        });
        expect(podiumStandAt("pit/conductor-podium", MANIFEST)).toEqual({
            x: 0,
            z: 0,
        });
    });

    it("is the middle for a podium with none, and null for a model that isn't a podium", () => {
        expect(podiumStandAt("pit/conductor-tower", MANIFEST)).toEqual({
            x: 0,
            z: 0,
        });
        expect(podiumStandAt("pit/marimba-5.0", MANIFEST)).toBeNull();
        expect(podiumStandAt("pit/missing-podium", MANIFEST)).toBeNull();
    });

    it("puts the shipped stepladder's step toward the audience", () => {
        expect(podiumStandAt("pit/stepladder-6ft")!.z).toBeGreaterThan(0);
    });
});

describe("hidesVenuePodium", () => {
    /** The field's front-to-back midpoint: front sideline at z = 0, back at z = -42.67 */
    const CENTER = -21.3;
    const item = (id: number, model: string | null, z: number | null = 5) => ({
        id,
        model,
        z,
    });

    it("is true when the show has a podium item in front of the field", () => {
        expect(
            hidesVenuePodium(
                [item(1, "pit/marimba-5.0"), item(2, "pit/conductor-podium")],
                new Set(),
                CENTER,
                MANIFEST,
            ),
        ).toBe(true);
    });

    it("is false with no podium, or only one hidden on the field", () => {
        expect(hidesVenuePodium([], new Set(), CENTER, MANIFEST)).toBe(false);
        expect(
            hidesVenuePodium(
                [item(1, "pit/marimba-5.0"), item(2, null)],
                new Set(),
                CENTER,
                MANIFEST,
            ),
        ).toBe(false);
        expect(
            hidesVenuePodium(
                [item(2, "pit/conductor-podium")],
                new Set([2]),
                CENTER,
                MANIFEST,
            ),
        ).toBe(false);
    });

    it("keeps the venue's podium, which stands in front, for a podium behind the field", () => {
        expect(
            hidesVenuePodium(
                [item(2, "pit/conductor-podium", -48)],
                new Set(),
                CENTER,
                MANIFEST,
            ),
        ).toBe(false);
        expect(
            hidesVenuePodium(
                [item(2, "pit/conductor-podium", null)],
                new Set(),
                CENTER,
                MANIFEST,
            ),
        ).toBe(false);
    });

    it("ignores a podium model id the manifest doesn't know: it draws as a block", () => {
        expect(
            hidesVenuePodium(
                [item(2, "pit/missing-podium")],
                new Set(),
                CENTER,
                MANIFEST,
            ),
        ).toBe(false);
    });
});

describe("podiumHeading", () => {
    const CENTER = -21.3;

    it("faces a podium in front of the field toward the back sideline", () => {
        expect(podiumHeading(5, CENTER)).toBeCloseTo(Math.PI);
        expect(podiumHeading(-20, CENTER)).toBeCloseTo(Math.PI);
    });

    it("faces a podium behind the field toward the audience", () => {
        expect(podiumHeading(-48, CENTER)).toBe(0);
        expect(podiumHeading(-22, CENTER)).toBe(0);
    });
});

describe("isNearPitItem", () => {
    const camera: [number, number, number] = [0, 1, 0];

    it("is near inside the near distance and far beyond the far one", () => {
        expect(isNearPitItem(PIT_NEAR_M - 1, 0, camera, undefined)).toBe(true);
        expect(isNearPitItem(PIT_FAR_M + 1, 0, camera, undefined)).toBe(false);
    });

    it("keeps its last detail between the two distances", () => {
        const between = (PIT_NEAR_M + PIT_FAR_M) / 2;
        expect(isNearPitItem(between, 0, camera, true)).toBe(true);
        expect(isNearPitItem(between, 0, camera, false)).toBe(false);
    });
});

describe("writePitModelMatrix", () => {
    it("stands the model at real size at the center, turned as the 2D field turns it", () => {
        const out = new Float32Array(32);
        writePitModelMatrix(out, 1, 90, { x: 3, z: -2 }, 0.5);
        const m = Array.from(out.subarray(16, 32)).map((v) =>
            Math.abs(v) < 1e-9 ? 0 : v,
        );
        // Model +X (the player's left) turns toward +Z, as the 2D turn does
        expect(m.slice(0, 3)).toEqual([0, 0, 1]);
        expect(m.slice(4, 7)).toEqual([0, 1, 0]);
        expect(m.slice(8, 11)).toEqual([-1, 0, 0]);
        expect(m.slice(12, 16)).toEqual([3, 0.5, -2, 1]);
    });

    it("leaves an unturned model as authored, +Z toward the audience", () => {
        const out = new Float32Array(16);
        writePitModelMatrix(out, 0, 0, { x: 0, z: 0 }, 0);
        expect(Array.from(out, (v) => v + 0)).toEqual([
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ]);
    });
});

describe("modelsByMarcher", () => {
    const item = (marcher_id: number, model: string | null) => ({
        marcher_id,
        model,
    });

    it("is each item drawn as a model, by marchers row, with its model's name", () => {
        expect(
            modelsByMarcher(
                [
                    item(101, "pit/marimba-5.0"),
                    item(102, null),
                    item(103, "pit/marimba-9.9"),
                    item(104, "pit/conductor-podium"),
                ],
                new Set(),
                MANIFEST,
            ),
        ).toEqual(
            new Map([
                [101, "marimba-5.0"],
                [104, "conductor-podium"],
            ]),
        );
    });

    it("leaves out a model that failed to load: its item draws as a block", () => {
        expect(
            modelsByMarcher(
                [item(101, "pit/marimba-5.0")],
                new Set(["marimba-5.0"]),
                MANIFEST,
            ).size,
        ).toBe(0);
    });
});
