import { beforeAll, describe, expect, it } from "vitest";
import { Box3 } from "three";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { setTexturePainting } from "../../environment";
import { venueFootprint } from "../../field";
import { KIT_BUILDERS, kitFieldStyle } from "..";
import { DEFAULT_VENUE_PARAMS } from "../../venueSettings";

beforeAll(() => setTexturePainting(false));

describe("Mark Diesel seen from straight above", () => {
    it("keeps finite bounds once the roof and its fixtures are cut away", () => {
        // The 2D venue underlay builds the kit this way and frames the stands
        // from its bounds: a NaN bound left it drawing no stands at all.
        for (const fp of [
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            FieldPropertiesTemplates.INDOOR_50x80_8to5,
        ]) {
            const fieldStyle = kitFieldStyle("markDiesel", fp);
            const kit = KIT_BUILDERS.markDiesel({
                footprint: venueFootprint(fp, fieldStyle),
                params: { ...DEFAULT_VENUE_PARAMS },
                quality: "low",
                venuePodium: true,
                fieldStyle,
            });
            kit.onFrame?.({ cameraPosition: [0, 600, 0], dt: 0 });
            const box = new Box3().setFromObject(kit.root);
            for (const v of [box.min.x, box.min.z, box.max.x, box.max.z])
                expect(Number.isFinite(v)).toBe(true);
            expect(box.max.x - box.min.x).toBeGreaterThan(200);
            kit.dispose();
        }
    });
});
