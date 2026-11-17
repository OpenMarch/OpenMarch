// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    PIT_AREA_MARGIN_FT,
    fieldViewSize,
    isBehindField,
    pitAreasOf,
} from "../pitStrip";

const fp: FieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const front = fp.centerFrontPoint.yPixels;
const margin = PIT_AREA_MARGIN_FT * 12 * FieldProperties.PIXELS_PER_INCH;

describe("pitAreasOf", () => {
    it("is nothing in a show with no equipment", () => {
        expect(pitAreasOf(fp, [])).toEqual([]);
    });

    it("hugs the equipment in front of the field, from the sideline out", () => {
        const areas = pitAreasOf(fp, [
            { x: 800, y: front + 40, radius: 10 },
            { x: 1000, y: front + 90, radius: 20 },
        ]);
        expect(areas).toEqual([
            {
                left: 790 - margin,
                right: 1020 + margin,
                top: front,
                bottom: front + 110 + margin,
            },
        ]);
        // Narrower than the field: it's the pit, not more field
        expect(areas[0].right - areas[0].left).toBeLessThan(fp.width);
        expect(isBehindField(areas[0])).toBe(false);
    });

    it("adds one behind the back sideline for equipment there (a back podium)", () => {
        const areas = pitAreasOf(fp, [
            { x: 900, y: front + 50, radius: 10 },
            { x: 900, y: -60, radius: 10 },
        ]);
        expect(areas).toHaveLength(2);
        const behind = areas.find(isBehindField)!;
        expect(behind).toEqual({
            left: 890 - margin,
            right: 910 + margin,
            top: -70 - margin,
            bottom: 0,
        });
    });

    it("gives equipment standing on the field no area", () => {
        expect(pitAreasOf(fp, [{ x: 900, y: front / 2, radius: 10 }])).toEqual(
            [],
        );
    });
});

describe("fieldViewSize", () => {
    it("is the field alone without pit areas", () => {
        expect(fieldViewSize(fp, [])).toEqual({
            width: fp.width,
            height: fp.height,
            top: 0,
        });
    });

    it("reaches past the pit areas", () => {
        const [ahead, behind] = pitAreasOf(fp, [
            { x: 900, y: front + 50, radius: 10 },
            { x: 900, y: -60, radius: 10 },
        ]);
        const size = fieldViewSize(fp, [ahead, behind]);
        expect(size.top).toBe(behind.top);
        expect(size.top + size.height).toBe(ahead.bottom);
        expect(size.width).toBe(fp.width);
    });
});
