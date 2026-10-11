import { describe, expect, it } from "vitest";
import { pickAlong, registerPicker } from "../scenePick";

describe("scene picking", () => {
    it("returns the nearest hit of the registered pickers, and forgets removed ones", () => {
        const a = registerPicker(() => 12);
        const b = registerPicker(() => 7);
        const c = registerPicker(() => null);
        expect(pickAlong([0, 0, 0], [0, 0, -1])).toBe(7);
        b();
        expect(pickAlong([0, 0, 0], [0, 0, -1])).toBe(12);
        a();
        c();
        expect(pickAlong([0, 0, 0], [0, 0, -1])).toBeNull();
    });
});
