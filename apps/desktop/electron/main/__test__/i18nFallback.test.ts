// @vitest-environment node
// cspell:words Dans deux
import { afterEach, describe, expect, it, vi } from "vitest";
import { setMainLanguage, t } from "../i18n";

// Language files of the test's own, so a translation pull can't change what it checks
vi.mock("../../../i18n/en.json", () => ({
    default: {
        test: { both: "In both", englishOnly: "Only in English" },
    },
}));
vi.mock("../../../i18n/fr.json", () => ({
    default: { test: { both: "Dans les deux" } },
}));

afterEach(() => {
    setMainLanguage("en");
});

describe("main-process translations", () => {
    it("falls back to English for a key the language lacks", () => {
        setMainLanguage("fr");
        expect(t("test.both")).toBe("Dans les deux");
        expect(t("test.englishOnly")).toBe("Only in English");
    });
});
