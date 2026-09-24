import { describe, expect, it } from "vitest";
import { shouldShowUpdateNotification } from "../updateNotification";

describe("shouldShowUpdateNotification", () => {
    it("does not notify on the first launch", () => {
        expect(shouldShowUpdateNotification(null, "0.1.8")).toBe(false);
    });

    it("notifies after the installed version changes", () => {
        expect(shouldShowUpdateNotification("0.1.7", "0.1.8")).toBe(true);
    });

    it("does not notify again for the same version", () => {
        expect(shouldShowUpdateNotification("0.1.8", "0.1.8")).toBe(false);
    });
});
