import { describe, expect, it } from "vitest";
import { panelInsets } from "../touchPanelInsets";

// The workspace column from x 8 to 1264: the sidebar, then the field from 104
const column = { left: 8, right: 1264 };
const field = { left: 104, right: 1264 };

describe("panelInsets", () => {
    it("covers the field only, short of the display bar with a gap", () => {
        const bar = { left: 1200, right: 1258 };
        expect(panelInsets(column, field, bar)).toEqual({
            left: 96,
            right: 1264 - 1192,
        });
    });

    it("runs to the field's right edge with no display bar", () => {
        expect(panelInsets(column, field, null)).toEqual({
            left: 96,
            right: 0,
        });
    });

    it("spans the whole column with no field", () => {
        expect(panelInsets(column, null, null)).toEqual({ left: 0, right: 0 });
    });

    it("never insets past the column's own edges", () => {
        expect(panelInsets(column, { left: 0, right: 1300 }, null)).toEqual({
            left: 0,
            right: 0,
        });
    });
});
