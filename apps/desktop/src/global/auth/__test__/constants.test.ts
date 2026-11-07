import { describe, expect, it } from "vitest";
import { canSignInHere, isOnClerkSite } from "../constants";

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

    it("turns down other sites, such as a branch's workers.dev URL", () => {
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

describe("canSignInHere", () => {
    it("lets a development key sign in anywhere, such as localhost", () => {
        // cspell:disable-next-line
        const devKey =
            "pk_test_dHJ1c3R5LW1vbmFyY2gtNjYuY2xlcmsuYWNjb3VudHMuZGV2JA";
        expect(canSignInHere(devKey, "localhost")).toBe(true);
    });

    it("keeps a production key to its own site", () => {
        expect(canSignInHere(PRODUCTION_KEY, "preview.openmarch.com")).toBe(
            true,
        );
        expect(canSignInHere(PRODUCTION_KEY, "localhost")).toBe(false);
    });

    it("can't sign in without a key", () => {
        expect(canSignInHere("", "editor.openmarch.com")).toBe(false);
    });
});
