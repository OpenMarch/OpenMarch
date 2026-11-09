import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { HOLD_TERM_KEYS, holdTerm, holdTerms } from "../holdTerms";

const en = JSON.parse(
    readFileSync(resolve(__dirname, "../../../i18n/en.json"), "utf8"),
) as Record<string, unknown>;
const lookup = (key: string): unknown =>
    key
        .split(".")
        .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            en,
        );

describe("holdTerms", () => {
    beforeAll(async () => {
        await tolgee.run();
    });

    it("reads every word from the timeline.terms block, whose English matches the defaults", () => {
        for (const [key, defaultValue] of Object.values(HOLD_TERM_KEYS)) {
            expect(key).toMatch(/^timeline\.terms\./);
            expect(lookup(key), key).toBe(defaultValue);
        }
    });

    it("gives the working words (owner, 2026-11-02)", () => {
        expect(holdTerms()).toEqual({
            defined: "Defined",
            definedLower: "defined",
            held: "Held",
            heldLower: "held",
            notDefined: "Not defined",
            notDefinedLower: "not defined",
            defineAsShown: "Define as shown",
            holdFromPrevious: "Hold from last keyframe",
            holdOverWindow: "Hold from start flag to playhead",
            clearThisPage: "Clear this page",
            removeKeyframe: "Remove keyframe",
            splitHold: "Split hold here",
        });
    });

    it("fills a string that names a state", () => {
        expect(
            tolgee.t("timeline.heldBar.title", "", {
                ...holdTerms(),
                page: "3",
            }),
        ).toBe("Held · Page 3");
        expect(holdTerm("notDefined")).toBe("Not defined");
    });
});
