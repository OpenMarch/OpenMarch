import { describe, expect, it } from "vitest";
import { compactMeasureRange } from "../compactMeasureRange";

describe("compactMeasureRange", () => {
    it("keeps the end measure when only the start has a beat", () => {
        expect(compactMeasureRange("49(3) - 53")).toBe("49-53");
    });

    it("keeps the end measure when only the end has a beat", () => {
        expect(compactMeasureRange("49 - 53(2)")).toBe("49-53");
    });

    it("drops the beats when both ends have one", () => {
        expect(compactMeasureRange("6(4) - 10(2)")).toBe("6-10");
    });

    it("shows a single measure when the page starts and ends in it", () => {
        expect(compactMeasureRange("106(2) - 106(4)")).toBe("106");
    });

    it("compacts whole-measure ranges", () => {
        expect(compactMeasureRange("1 - 2")).toBe("1-2");
    });

    it("accepts the arrow separator and lettered measures", () => {
        expect(compactMeasureRange("12A(9) → 14(16)")).toBe("12A-14");
    });

    it("never cuts a long range short", () => {
        expect(compactMeasureRange("123456(2) - 123460")).toBe("123456-123460");
        expect(compactMeasureRange("123456(2) - 123460(1)")).toBe(
            "123456-123460",
        );
    });

    it("passes through values with no measures", () => {
        expect(compactMeasureRange("7")).toBe("7");
        expect(compactMeasureRange("-")).toBe("-");
    });
});
