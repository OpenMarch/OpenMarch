import { beforeAll, describe, expect, it } from "vitest";
import { setTexturePainting } from "../../environment";
import type { FieldFootprint } from "../../types";
import {
    DEFAULT_VENUE_PARAMS,
    KIT_LIGHTING,
    VENUE_KIT_IDS,
} from "../../venueSettings";
import { KIT_BUILDERS, KIT_FIELD_STYLE } from "..";

beforeAll(() => setTexturePainting(false));

const FOOTBALL: FieldFootprint = {
    minX: -54.86,
    maxX: 54.86,
    minZ: -48.77,
    maxZ: 0,
};

describe("kit registry", () => {
    it("has a builder and a field style for every kit id", () => {
        expect(Object.keys(KIT_BUILDERS).sort()).toEqual(
            [...VENUE_KIT_IDS].sort(),
        );
        expect(Object.keys(KIT_FIELD_STYLE).sort()).toEqual(
            [...VENUE_KIT_IDS].sort(),
        );
    });

    it("uses turf for the stadiums, tarp for the gym and theme for blank", () => {
        expect(KIT_FIELD_STYLE).toEqual({
            hs: "turf",
            bighs: "turf",
            college: "turf",
            pro: "turf",
            gym: "tarp",
            blank: "theme",
        });
    });

    it.each(VENUE_KIT_IDS)(
        "%s builds with the lighting the venue settings expect",
        (id) => {
            const kit = KIT_BUILDERS[id]({
                footprint: FOOTBALL,
                params: { ...DEFAULT_VENUE_PARAMS },
                quality: "high",
            });
            try {
                expect(kit.cameras.length).toBeGreaterThan(0);
                expect([...kit.lightingPresets].sort()).toEqual(
                    [...KIT_LIGHTING[id].presets].sort(),
                );
                expect(kit.defaultLighting).toBe(
                    KIT_LIGHTING[id].defaultLighting,
                );
            } finally {
                kit.dispose();
            }
        },
    );
});
