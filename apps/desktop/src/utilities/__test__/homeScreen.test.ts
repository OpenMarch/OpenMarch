// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldOfferHomeScreen } from "../homeScreen";

describe("shouldOfferHomeScreen", () => {
    it("offers once, in Safari on an iPad", () => {
        expect(
            shouldOfferHomeScreen({
                appleTouch: true,
                standalone: false,
                alreadyShown: false,
            }),
        ).toBe(true);
        expect(
            shouldOfferHomeScreen({
                appleTouch: true,
                standalone: false,
                alreadyShown: true,
            }),
        ).toBe(false);
    });
    it("not in the Home Screen app, nor on other devices", () => {
        expect(
            shouldOfferHomeScreen({
                appleTouch: true,
                standalone: true,
                alreadyShown: false,
            }),
        ).toBe(false);
        expect(
            shouldOfferHomeScreen({
                appleTouch: false,
                standalone: false,
                alreadyShown: false,
            }),
        ).toBe(false);
    });
});
