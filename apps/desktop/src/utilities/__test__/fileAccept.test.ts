// @vitest-environment node
// cspell:words KHTML
import { describe, expect, it } from "vitest";
import { touchSafeAccept } from "../fileAccept";

const ipad = {
    userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    maxTouchPoints: 5,
};
const mac = { ...ipad, maxTouchPoints: 0 };

describe("touchSafeAccept", () => {
    it("leaves other devices alone", () => {
        expect(touchSafeAccept(".fieldots", mac)).toBe(".fieldots");
    });
    it("offers any file on an iPad, except for images", () => {
        expect(touchSafeAccept(".xml,.musicxml,.mxl", ipad)).toBe("");
        expect(touchSafeAccept("audio/*", ipad)).toBe("");
        expect(touchSafeAccept("image/*", ipad)).toBe("image/*");
    });
});
