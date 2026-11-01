// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
    BUILTIN_ASSET_ROOTS,
    checkBuiltinLicenses,
    FOLDER_LICENSES,
    THIRD_PARTY_LICENSES,
    type BuiltinLicenses,
    type ThirdPartyEntry,
} from "../builtinLicenses";
import manifest from "../../assets/licenses.json";

const DESKTOP = path.resolve(__dirname, "../../../..");

const trumpet: ThirdPartyEntry = {
    name: "Trumpet",
    files: ["src/view3d/assets/instruments/trumpet.json"],
    license: "CC-BY-4.0",
    author: "Kagelok",
    sourceUrl:
        "https://sketchfab.com/3d-models/trumpet-1dc9efd37bf14d1b9d1e3de0ca90435c",
    attribution: '"Trumpet" by Kagelok, CC BY 4.0',
    retrieved: "2026-10-09",
    modified: true,
};

const BODY = "src/view3d/assets/om-pose/bodies/neutral-average.glb";
const TEMPLATE = "starter-kit/templates/silk.blend";

/** A tree with the trumpet listed and two folders under their LICENSE. */
const files = [
    "src/view3d/assets/instruments/trumpet.json",
    "src/view3d/assets/instruments/CREDITS.md",
    "src/view3d/assets/om-pose/LICENSE",
    BODY,
    "starter-kit/templates/LICENSE",
    TEMPLATE,
];
const texts: Record<string, string> = {
    "src/view3d/assets/om-pose/LICENSE":
        "These assets are in the counsel gate.",
    "starter-kit/templates/LICENSE": "Creative Commons\n\nCC0 1.0 Universal\n",
};
const licenseText = (p: string) => texts[p] ?? null;

const good: BuiltinLicenses = {
    folders: [
        {
            path: "src/view3d/assets/om-pose",
            license: "LicenseRef-Counsel-Gate",
        },
        { path: "starter-kit/templates", license: "CC0-1.0" },
    ],
    entries: [trumpet],
};

const check = (manifest: BuiltinLicenses, tree = files) =>
    checkBuiltinLicenses({ manifest, files: tree, licenseText });

describe("checkBuiltinLicenses", () => {
    it("passes a listed CC-BY item and folders whose LICENSE says their license", () => {
        expect(check(good)).toEqual([]);
    });

    it.each(["CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-ND-4.0", "MIT", ""])(
        "fails a third-party entry licensed %s, outside the allow-list",
        (license) => {
            expect(
                check({ ...good, entries: [{ ...trumpet, license }] }),
            ).toEqual([
                `Trumpet: license "${license}" isn't allowed (${THIRD_PARTY_LICENSES.join(", ")})`,
            ]);
        },
    );

    it.each(["author", "sourceUrl", "attribution", "retrieved"] as const)(
        "fails an entry without its %s",
        (field) => {
            expect(
                check({ ...good, entries: [{ ...trumpet, [field]: " " }] }),
            ).toEqual([`Trumpet: ${field} is missing`]);
        },
    );

    it("fails a source that isn't an https URL and a date that isn't YYYY-MM-DD", () => {
        expect(
            check({
                ...good,
                entries: [
                    {
                        ...trumpet,
                        sourceUrl: "sketchfab.com/x",
                        retrieved: "Oct 9",
                    },
                ],
            }),
        ).toEqual([
            "Trumpet: sourceUrl isn't an https URL",
            "Trumpet: retrieved isn't a YYYY-MM-DD date",
        ]);
    });

    it("fails a listed file that isn't a tracked built-in", () => {
        const extra = "src/view3d/assets/x.json";
        expect(
            check({
                ...good,
                entries: [{ ...trumpet, files: [...trumpet.files, extra] }],
            }),
        ).toEqual([`Trumpet: ${extra} isn't a tracked built-in`]);
    });

    it("fails a file two entries list", () => {
        expect(
            check({
                ...good,
                entries: [trumpet, { ...trumpet, name: "Again" }],
            }),
        ).toEqual([
            "src/view3d/assets/instruments/trumpet.json is listed by both Trumpet and Again",
        ]);
    });

    it("fails a built-in that nothing declares", () => {
        expect(check({ ...good, entries: [] })).toEqual([
            "src/view3d/assets/instruments/trumpet.json has no license: list it in licenses.json, or put its folder there with a LICENSE",
        ]);
    });

    it("fails a folder license outside the allow-list, or a LICENSE that doesn't say it", () => {
        expect(
            check({
                ...good,
                folders: [
                    { path: "src/view3d/assets/om-pose", license: "MIT" },
                    {
                        path: "starter-kit/templates",
                        license: "GPL-3.0-or-later",
                    },
                ],
            }),
        ).toEqual([
            `src/view3d/assets/om-pose: license "MIT" isn't allowed (${Object.keys(FOLDER_LICENSES).join(", ")})`,
            "starter-kit/templates: LICENSE doesn't say GPL-3.0-or-later",
        ]);
    });

    it("fails a declared folder without its LICENSE", () => {
        expect(
            check(
                good,
                files.filter((f) => f !== "starter-kit/templates/LICENSE"),
            ).filter((p) => p.startsWith("starter-kit")),
        ).toEqual(["starter-kit/templates: LICENSE is missing"]);
    });

    it("refuses one license for a whole asset root", () => {
        expect(
            check({
                folders: [{ path: "src/view3d/assets", license: "CC0-1.0" }],
                entries: [],
            })[0],
        ).toBe("src/view3d/assets: a whole asset root can't take one license");
    });
});

/** Every tracked file under the built-in asset roots, relative to apps/desktop. */
function trackedAssetFiles(): string[] {
    return execFileSync("git", ["ls-files", "--", ...BUILTIN_ASSET_ROOTS], {
        cwd: DESKTOP,
        encoding: "utf8",
    })
        .split("\n")
        .filter(Boolean)
        .sort();
}

describe("the built-ins in the repository", () => {
    it("carry their license fields, inside the allow-lists", () => {
        expect(
            checkBuiltinLicenses({
                manifest,
                files: trackedAssetFiles(),
                licenseText: (p) => {
                    const file = path.join(DESKTOP, p);
                    return fs.existsSync(file)
                        ? fs.readFileSync(file, "utf8")
                        : null;
                },
            }),
        ).toEqual([]);
    });
});
