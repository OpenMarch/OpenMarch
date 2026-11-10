import { describe, expect, it } from "vitest";
import { siteUrlFor } from "../siteUrl";

describe("siteUrlFor", () => {
    it("sends released versions to openmarch.com", () => {
        expect(siteUrlFor("0.1.7")).toBe("https://openmarch.com");
        expect(siteUrlFor("1.0.0")).toBe("https://openmarch.com");
    });

    it("sends pre-release versions to the preview site", () => {
        expect(siteUrlFor("0.2.0-beta.1")).toBe(
            "https://preview.openmarch.com",
        );
        expect(siteUrlFor("0.2.0-alpha")).toBe("https://preview.openmarch.com");
        expect(siteUrlFor("0.2.0-beta.1-nightly.20261106.12")).toBe(
            "https://preview.openmarch.com",
        );
    });
});
