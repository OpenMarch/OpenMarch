// cspell:words xmp xmpRights sketchfab
import { describe, expect, it } from "vitest";
import { creditsOf, spdxLicenseOf, titleOf } from "../credits";
import type { RawGltf } from "../files";

/** A glTF whose asset names XMP packet 0 */
const withPacket = (packet: Record<string, unknown>, asset = {}): RawGltf => ({
    asset: {
        ...asset,
        extensions: { KHR_xmp_json_ld: { packet: 0 } },
    },
    extensions: { KHR_xmp_json_ld: { packets: [packet] } },
});

describe("creditsOf", () => {
    it("reads KHR_xmp_json_ld first", () => {
        const json = withPacket(
            {
                "dc:creator": { "@list": ["Ada Lovelace", "Grace Hopper"] },
                "dc:rights": { "rdf:_1": { "@value": "© 2026 Example" } },
                "dc:source": "https://example.com/podium",
                "xmpRights:WebStatement":
                    "https://creativecommons.org/licenses/by-sa/4.0/",
                "dc:title": { en: "Podium" },
            },
            { copyright: "Someone else, CC0" },
        );
        expect(creditsOf(json)).toEqual({
            author: "Ada Lovelace, Grace Hopper",
            sourceUrl: "https://example.com/podium",
            license: "CC-BY-SA-4.0",
            attribution: "© 2026 Example",
        });
        expect(titleOf(json)).toBe("Podium");
    });

    it("falls back to asset.copyright", () => {
        expect(creditsOf({ asset: { copyright: "Jo Smith, CC0" } })).toEqual({
            attribution: "Jo Smith, CC0",
            license: "CC0-1.0",
        });
    });

    it("reads what Sketchfab writes in asset.extras", () => {
        const json: RawGltf = {
            asset: {
                extras: {
                    author: "drumline_fan (https://sketchfab.com/drumline_fan)",
                    license:
                        "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
                    source: "https://sketchfab.com/3d-models/bass-drum-0123",
                    title: "Bass drum",
                },
            },
        };
        expect(creditsOf(json)).toEqual({
            author: "drumline_fan",
            license: "CC-BY-4.0",
            sourceUrl: "https://sketchfab.com/3d-models/bass-drum-0123",
        });
        expect(titleOf(json)).toBe("Bass drum");
    });

    it("leaves out what the file doesn't say", () => {
        expect(creditsOf({ asset: {} })).toEqual({});
        expect(titleOf({ asset: {} })).toBeNull();
    });
});

describe("spdxLicenseOf", () => {
    it.each([
        ["https://creativecommons.org/licenses/by/4.0/", "CC-BY-4.0"],
        [
            "http://creativecommons.org/licenses/by-nc-nd/3.0/legalcode",
            "CC-BY-NC-ND-3.0",
        ],
        ["https://creativecommons.org/publicdomain/zero/1.0/", "CC0-1.0"],
        ["CC BY 4.0", "CC-BY-4.0"],
        ["CC-BY-SA 4.0", "CC-BY-SA-4.0"],
        ["Released under CC0", "CC0-1.0"],
        ["All rights reserved", null],
        ["https://creativecommons.org/publicdomain/mark/1.0/", null],
    ])("%s → %s", (text, spdx) => {
        expect(spdxLicenseOf(text)).toBe(spdx);
    });
});
