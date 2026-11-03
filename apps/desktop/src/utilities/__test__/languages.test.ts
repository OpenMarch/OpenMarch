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

    it("picks the Chinese script by region or script tag", () => {
        expect(matchAppLanguage(["zh-CN"])).toBe("zh-Hans");
        expect(matchAppLanguage(["zh-SG"])).toBe("zh-Hans");
        expect(matchAppLanguage(["zh"])).toBe("zh-Hans");
        expect(matchAppLanguage(["zh-TW"])).toBe("zh-Hant");
        expect(matchAppLanguage(["zh-HK"])).toBe("zh-Hant");
        expect(matchAppLanguage(["zh-Hant-TW"])).toBe("zh-Hant");
        expect(matchAppLanguage(["zh-Hans-HK"])).toBe("zh-Hans");
    });

    it("reads Tagalog as Filipino and the old Indonesian code", () => {
        expect(matchAppLanguage(["tl-PH"])).toBe("fil");
        expect(matchAppLanguage(["fil-PH"])).toBe("fil");
        expect(matchAppLanguage(["in"])).toBe("id");
        expect(matchAppLanguage(["ms-MY"])).toBe("ms");
        expect(matchAppLanguage(["th-TH"])).toBe("th");
    });

    it("takes the first preferred language the app has", () => {
        expect(matchAppLanguage(["de-DE", "fr-FR", "en-US"])).toBe("fr");
    });

    it("returns null when none match", () => {
        expect(matchAppLanguage(["de", "ko-KR"])).toBeNull();
        expect(matchAppLanguage([])).toBeNull();
    });
});
