// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchAppLanguage } from "../languages";

describe("matchAppLanguage", () => {
    it("matches an exact language tag, ignoring case", () => {
        expect(matchAppLanguage(["pt-br"])).toBe("pt-BR");
        expect(matchAppLanguage(["ja"])).toBe("ja");
    });

    it("falls back to the same base language", () => {
        expect(matchAppLanguage(["es-MX"])).toBe("es");
        expect(matchAppLanguage(["fr-CA"])).toBe("fr");
        expect(matchAppLanguage(["pt-PT"])).toBe("pt-BR");
    });

    it("takes the first preferred language the app has", () => {
        expect(matchAppLanguage(["de-DE", "fr-FR", "en-US"])).toBe("fr");
    });

    it("returns null when none match", () => {
        expect(matchAppLanguage(["de", "zh-CN"])).toBeNull();
        expect(matchAppLanguage([])).toBeNull();
    });
});
