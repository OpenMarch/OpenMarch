import { describe, expect, it } from "vitest";
import { isProp, isNotProp, PROP_MARCHER_TYPE } from "../Prop";

describe("isProp / isNotProp", () => {
    it("identifies prop-type marchers", () => {
        expect(isProp({ type: PROP_MARCHER_TYPE })).toBe(true);
        expect(isProp({ type: "marcher" })).toBe(false);
    });

    it("isNotProp is the complement", () => {
        expect(isNotProp({ type: "marcher" })).toBe(true);
        expect(isNotProp({ type: PROP_MARCHER_TYPE })).toBe(false);
    });
});
