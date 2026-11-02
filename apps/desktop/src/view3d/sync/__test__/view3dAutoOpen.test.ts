import { describe, expect, it } from "vitest";
import { view3dAutoOpenOnShow } from "../view3dAutoOpen";

/** What a show opening does about the 3D View, from the auto-open setting. */
describe("view3dAutoOpenOnShow", () => {
    it("opens when the setting is on", () => {
        expect(view3dAutoOpenOnShow(true, { canAutoOpen: true })).toBe("open");
        expect(view3dAutoOpenOnShow(true, { canAutoOpen: false })).toBe("open");
    });

    it("does nothing when the setting is off", () => {
        expect(view3dAutoOpenOnShow(false, { canAutoOpen: true })).toBe("none");
    });

    it("opens while the setting was never answered, where it can", () => {
        expect(view3dAutoOpenOnShow(undefined, { canAutoOpen: true })).toBe(
            "open",
        );
        expect(view3dAutoOpenOnShow(undefined, { canAutoOpen: false })).toBe(
            "none",
        );
    });
});
