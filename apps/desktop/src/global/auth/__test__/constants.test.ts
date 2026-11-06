import { describe, expect, it } from "vitest";
import { isOnClerkSite } from "../constants";

// cspell:disable-next-line
const PRODUCTION_KEY = "pk_live_Y2xlcmsub3Blbm1hcmNoLmNvbSQ"; // clerk.openmarch.com

describe("isOnClerkSite", () => {
    it("allows the instance's site and its subdomains", () => {
        expect(isOnClerkSite(PRODUCTION_KEY, "editor.openmarch.com")).toBe(
            true,
        );
        expect(isOnClerkSite(PRODUCTION_KEY, "lab.openmarch.com")).toBe(true);
        expect(isOnClerkSite(PRODUCTION_KEY, "openmarch.com")).toBe(true);
    });

    it("turns down other sites, such as workers.dev preview URLs", () => {
        expect(
            isOnClerkSite(
                PRODUCTION_KEY,
                "abc123-openmarch-editor-nightly.example.workers.dev",
            ),
        ).toBe(false);
        expect(isOnClerkSite(PRODUCTION_KEY, "localhost")).toBe(false);
        expect(isOnClerkSite(PRODUCTION_KEY, "other-openmarch.com")).toBe(
            false,
        );
        expect(isOnClerkSite("pk_live_!!!", "editor.openmarch.com")).toBe(
            false,
        );
    });
});
