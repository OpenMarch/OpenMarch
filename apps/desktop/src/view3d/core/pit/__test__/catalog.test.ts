// @vitest-environment node
import { describe, expect, it } from "vitest";
import manifest from "@/view3d/assets/pit/manifest.json";
import {
    PIT_FAMILIES,
    defaultPitVariant,
    isPodiumFamily,
    pitFamily,
    pitFileId,
    pitModelId,
    pitVariant,
    pitVariantsOf,
} from "../catalog";

const manifestIds = Object.keys(manifest);

describe("pit model ids", () => {
    it("names a model by its file id under pit/", () => {
        expect(pitModelId("marimba-5.0")).toBe("pit/marimba-5.0");
        expect(pitFileId("pit/marimba-5.0")).toBe("marimba-5.0");
    });

    it("reads no file id from another model id or a block", () => {
        expect(pitFileId("library/marimba-5.0")).toBeNull();
        expect(pitFileId("pit/")).toBeNull();
        expect(pitFileId(null)).toBeNull();
    });
});

describe("the front ensemble catalog", () => {
    it("has the families of the design, podiums last, in order", () => {
        expect(PIT_FAMILIES.map((f) => f.id)).toEqual([
            "marimba",
            "vibraphone",
            "xylophone",
            "glockenspiel",
            "synth",
            "drumSet",
            "auxRack",
            "timpani",
            "chimes",
            "gong",
            "congas",
            "bongos",
            "concertBassDrum",
            "trapTable",
            "speaker",
            "mixer",
            "podium",
            "podiumStand",
            "podiumTower",
            "rollingPodium",
            "stepladder",
            "scaffold",
        ]);
    });

    it("offers every built model except the amps, each in one family", () => {
        const notOffered = /^amp-/;
        const offered = PIT_FAMILIES.flatMap((f) =>
            pitVariantsOf(f.id).map((v) => v.fileId),
        );
        expect(new Set(offered).size).toBe(offered.length);
        expect([...offered].sort()).toEqual(
            manifestIds.filter((id) => !notOffered.test(id)).sort(),
        );
    });

    it("picks the design's default variants", () => {
        const defaults = Object.fromEntries(
            PIT_FAMILIES.map((f) => [f.id, defaultPitVariant(f.id).fileId]),
        );
        expect(defaults).toMatchObject({
            marimba: "marimba-4.3",
            vibraphone: "vibraphone-3.0",
            synth: "synth-88",
            drumSet: "drum-set",
            speaker: "speaker-tall",
            mixer: "mixer-cart",
            podium: "conductor-podium",
            podiumStand: "podium-stand-2ft",
            podiumTower: "podium-tower-5ft",
            rollingPodium: "podium-rolling-6ft",
            stepladder: "stepladder-6ft",
            scaffold: "scaffold-tower",
        });
        for (const family of PIT_FAMILIES)
            expect(pitVariantsOf(family.id)).toContain(
                defaultPitVariant(family.id),
            );
    });

    it("sizes a footprint in meters from the detailed model", () => {
        const marimba = pitVariant("pit/marimba-5.0")!;
        expect(marimba.footprint).toEqual({
            width: manifest["marimba-5.0"].high.sizeM.width,
            depth: manifest["marimba-5.0"].high.sizeM.depth,
            height: manifest["marimba-5.0"].high.sizeM.height,
        });
        expect(marimba.modelId).toBe("pit/marimba-5.0");
        expect(marimba.family).toBe("marimba");
    });

    it("labels a variant by its size and finish", () => {
        const parts = (fileId: string) => pitVariant(pitModelId(fileId))!.label;
        expect(parts("marimba-5.0")).toEqual([
            { key: "pit.variant.octaves", params: { size: "5.0" } },
            { key: "pit.variant.rosewood" },
        ]);
        expect(parts("marimba-4.3-synthetic-black")).toEqual([
            { key: "pit.variant.octaves", params: { size: "4.3" } },
            { key: "pit.variant.syntheticBlack" },
        ]);
        expect(parts("vibraphone-3.5-gold")).toEqual([
            { key: "pit.variant.octaves", params: { size: "3.5" } },
            { key: "pit.variant.gold" },
        ]);
        expect(parts("synth-61-double")).toEqual([
            { key: "pit.variant.keys", params: { size: "61" } },
            { key: "pit.variant.double" },
        ]);
        expect(parts("timpani-26")).toEqual([
            { key: "pit.variant.inches", params: { size: "26" } },
        ]);
        expect(parts("drum-set")).toEqual([{ key: "pit.variant.plain" }]);
        expect(parts("conductor-podium-tall")).toEqual([
            { key: "pit.variant.tall" },
        ]);
        expect(parts("chimes")).toEqual([]);
        expect(parts("podium-tower-4ft")).toEqual([
            { key: "pit.variant.feet", params: { size: "4" } },
            { key: "pit.variant.aluminum" },
        ]);
        expect(parts("podium-stand-2ft-black")).toEqual([
            { key: "pit.variant.feet", params: { size: "2" } },
            { key: "pit.variant.black" },
        ]);
        expect(parts("stepladder-6ft")).toEqual([
            { key: "pit.variant.feet", params: { size: "6" } },
        ]);
        expect(parts("scaffold-tower")).toEqual([]);
    });

    it("lists a family's variants by size, then finish", () => {
        expect(pitVariantsOf("marimba").map((v) => v.fileId)).toEqual([
            "marimba-4.3",
            "marimba-4.3-synthetic-black",
            "marimba-4.6",
            "marimba-4.6-synthetic-black",
            "marimba-5.0",
            "marimba-5.0-synthetic-black",
        ]);
        expect(pitVariantsOf("timpani").map((v) => v.fileId)).toEqual([
            "timpani-23",
            "timpani-26",
            "timpani-29",
            "timpani-32",
        ]);
        expect(pitVariantsOf("podiumTower").map((v) => v.fileId)).toEqual([
            "podium-tower-4ft",
            "podium-tower-4ft-black",
            "podium-tower-5ft",
            "podium-tower-5ft-black",
            "podium-tower-6ft",
            "podium-tower-6ft-black",
        ]);
    });

    it("groups the podiums on their own, stood on rather than played", () => {
        const podiums = PIT_FAMILIES.filter((f) => f.group === "podiums");
        expect(podiums.map((f) => f.id)).toEqual([
            "podium",
            "podiumStand",
            "podiumTower",
            "rollingPodium",
            "stepladder",
            "scaffold",
        ]);
        for (const family of podiums) {
            expect(family.played).toBe(false);
            expect(isPodiumFamily(family.id)).toBe(true);
        }
        expect(isPodiumFamily("speaker")).toBe(false);
        expect(isPodiumFamily("marimba")).toBe(false);
    });

    it("finds a model's family, and nothing for an unknown or amp model", () => {
        expect(pitFamily("pit/drum-set-cage")?.id).toBe("drumSet");
        expect(pitVariant("pit/amp-bass")).toBeNull();
        expect(pitVariant("pit/tuba")).toBeNull();
        expect(pitVariant(null)).toBeNull();
    });
});
