import { describe, expect, it } from "vitest";
import { parseDrillLabel } from "../label";

describe("parseDrillLabel", () => {
    it("splits simple labels", () => {
        expect(parseDrillLabel("T3")).toEqual({
            drill_number: "T3",
            drill_prefix: "T",
            drill_order: 3,
        });
    });

    it("prefers longer prefixes so TS1 is tenor sax, not trumpet + S1", () => {
        expect(parseDrillLabel("TS1")).toEqual({
            drill_number: "TS1",
            drill_prefix: "TS",
            drill_order: 1,
        });
    });

    it("prefers longer prefixes so BS1 is not baritone + S1", () => {
        expect(parseDrillLabel("BS1")).toEqual({
            drill_number: "BS1",
            drill_prefix: "BS",
            drill_order: 1,
        });
    });

    it("handles multi-digit orders", () => {
        expect(parseDrillLabel("G10")).toEqual({
            drill_number: "G10",
            drill_prefix: "G",
            drill_order: 10,
        });
    });
});
