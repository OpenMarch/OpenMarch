import { describe, expect, it } from "vitest";
import {
    CURRENT_SEASON_ENDS,
    NEW_ENSEMBLES_FROM,
    PREVIOUS_SEASON_ENDS,
    SEAT_PRICE_LABEL,
    formatSeatDate,
} from "../seats";

describe("seat terms", () => {
    it("formats ISO dates without shifting the day", () => {
        expect(formatSeatDate("2027-06-30")).toBe("June 30, 2027");
        expect(formatSeatDate("2026-12-31")).toBe("December 31, 2026");
        expect(formatSeatDate("2027-01-01")).toBe("January 1, 2027");
    });

    it("rejects malformed dates", () => {
        expect(() => formatSeatDate("June 30")).toThrow();
    });

    it("exposes the labels the site shows", () => {
        expect(CURRENT_SEASON_ENDS).toBe("June 30, 2027");
        expect(PREVIOUS_SEASON_ENDS).toBe("December 31, 2026");
        expect(NEW_ENSEMBLES_FROM).toBe("October 30, 2026");
        expect(SEAT_PRICE_LABEL).toBe("$5");
    });
});
