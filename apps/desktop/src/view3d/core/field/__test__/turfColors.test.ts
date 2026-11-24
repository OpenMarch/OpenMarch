import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "../../../../global/classes/FieldProperties.templates";
import { planField, type TurfColors } from "..";
import { TURF } from "../turfPlan";

const params = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const colorsOf = (turf?: TurfColors) => {
    const plan = planField({
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        style: "turf",
        params,
        turf,
    });
    const of = (role: string) => [
        ...new Set(
            plan.items
                .filter((i) => i.role === role && "color" in i)
                .map((i) => (i as { color: string }).color),
        ),
    ];
    return {
        background: of("background"),
        stripe: of("stripe").sort(),
        line: of("yardLine"),
    };
};

describe("venue turf colors", () => {
    it("paints the shared grass when a venue gives none", () => {
        const c = colorsOf();
        expect(c.background).toEqual([TURF.base]);
        expect(c.stripe).toEqual([TURF.stripeDark, TURF.stripeLight].sort());
    });

    it("paints a venue's grass and keeps the paint white", () => {
        const c = colorsOf({
            base: "#111111",
            stripeDark: "#222222",
            stripeLight: "#333333",
        });
        expect(c.background).toEqual(["#111111"]);
        expect(c.stripe).toEqual(["#222222", "#333333"]);
        expect(c.line).toEqual([TURF.paint]);
    });
});
