/**
 * The built-in catalog's licenses (props-spec.md section 10, ADR 0002 D-21,
 * package C5.8). `assets/licenses.json` declares every built-in one of two
 * ways: a folder with its license, whose `LICENSE` file must say so (the
 * om-pose assets), or a third-party
 * entry with its SPDX license, author, source, attribution and retrieval
 * date. Third-party built-ins are CC0 or CC-BY 4.0 only. A desktop test runs
 * the check over the repository's tracked files, so CI fails on an entry
 * outside the allow-list or a built-in nothing declares.
 */

/** The folders, relative to `apps/desktop`, whose files ship as built-ins. */
export const BUILTIN_ASSET_ROOTS = ["src/view3d/assets"];

/** The manifest itself, relative to `apps/desktop`. */
export const LICENSES_MANIFEST = "src/view3d/assets/licenses.json";

/** The licenses a third-party built-in may carry: no BY-SA, NC, ND or store licenses. */
export const THIRD_PARTY_LICENSES = ["CC0-1.0", "CC-BY-4.0"] as const;

/**
 * The licenses an OpenMarch folder may declare, each with text its `LICENSE`
 * must contain: CC0 for OpenMarch-made content, GPL for the Blender add-on,
 * and the counsel gate for the om-pose assets (ADR 0002 D-7 correction).
 */
export const FOLDER_LICENSES: Readonly<Record<string, string>> = {
    "CC0-1.0": "CC0 1.0 Universal",
    "GPL-3.0-or-later": "GNU GENERAL PUBLIC LICENSE",
    "LicenseRef-Counsel-Gate": "counsel gate",
};

/** A folder of built-ins under one license. */
export interface LicensedFolder {
    /** Relative to `apps/desktop`. */
    path: string;
    license: string;
}

/** One third-party built-in. */
export interface ThirdPartyEntry {
    name: string;
    /** Its files, relative to `apps/desktop`. */
    files: readonly string[];
    /** An SPDX license id. */
    license: string;
    author: string;
    sourceUrl: string;
    /** The attribution text, as Credits shows it. */
    attribution: string;
    /** When it was retrieved, `YYYY-MM-DD`. */
    retrieved: string;
    /** Whether the built-in changes the source. */
    modified: boolean;
}

export interface BuiltinLicenses {
    folders: readonly LicensedFolder[];
    entries: readonly ThirdPartyEntry[];
}

/** Files that describe a folder rather than ship in it. */
const NOT_ASSETS = new Set(["LICENSE", "CREDITS.md", "README.md"]);

const REQUIRED = ["author", "sourceUrl", "attribution", "retrieved"] as const;

const baseOf = (file: string) => file.slice(file.lastIndexOf("/") + 1);
const within = (file: string, dir: string) => file.startsWith(`${dir}/`);

function folderProblems(
    folder: LicensedFolder,
    present: ReadonlySet<string>,
    licenseText: (path: string) => string | null,
): string[] {
    if (BUILTIN_ASSET_ROOTS.includes(folder.path))
        return [`${folder.path}: a whole asset root can't take one license`];
    const marker = FOLDER_LICENSES[folder.license];
    if (marker === undefined)
        return [
            `${folder.path}: license "${folder.license}" isn't allowed (${Object.keys(FOLDER_LICENSES).join(", ")})`,
        ];
    const licensePath = `${folder.path}/LICENSE`;
    const text = present.has(licensePath) ? licenseText(licensePath) : null;
    if (text === null) return [`${folder.path}: LICENSE is missing`];
    if (!text.includes(marker))
        return [`${folder.path}: LICENSE doesn't say ${folder.license}`];
    return [];
}

function entryProblems(
    entry: ThirdPartyEntry,
    present: ReadonlySet<string>,
): string[] {
    const out: string[] = [];
    if (!(THIRD_PARTY_LICENSES as readonly string[]).includes(entry.license))
        out.push(
            `${entry.name}: license "${entry.license}" isn't allowed (${THIRD_PARTY_LICENSES.join(", ")})`,
        );
    for (const field of REQUIRED)
        if (!entry[field]?.trim())
            out.push(`${entry.name}: ${field} is missing`);
    if (entry.sourceUrl?.trim() && !/^https:\/\/\S+$/.test(entry.sourceUrl))
        out.push(`${entry.name}: sourceUrl isn't an https URL`);
    if (entry.retrieved?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(entry.retrieved))
        out.push(`${entry.name}: retrieved isn't a YYYY-MM-DD date`);
    for (const file of entry.files)
        if (!present.has(file))
            out.push(`${entry.name}: ${file} isn't a tracked built-in`);
    return out;
}

/**
 * The problems with the built-ins' licenses, empty when every built-in
 * carries its license fields inside the allow-lists.
 */
export function checkBuiltinLicenses({
    manifest,
    files,
    licenseText,
}: {
    manifest: BuiltinLicenses;
    /** Every tracked file under the asset roots, relative to `apps/desktop`. */
    files: readonly string[];
    /** A file's text, or null when it isn't there. */
    licenseText: (path: string) => string | null;
}): string[] {
    const present = new Set(files);
    const problems = [
        ...manifest.folders.flatMap((f) =>
            folderProblems(f, present, licenseText),
        ),
        ...manifest.entries.flatMap((e) => entryProblems(e, present)),
    ];
    const listedBy = new Map<string, string>();
    for (const entry of manifest.entries)
        for (const file of entry.files) {
            const other = listedBy.get(file);
            if (other !== undefined)
                problems.push(
                    `${file} is listed by both ${other} and ${entry.name}`,
                );
            else listedBy.set(file, entry.name);
        }
    for (const file of files) {
        if (file === LICENSES_MANIFEST || NOT_ASSETS.has(baseOf(file)))
            continue;
        if (listedBy.has(file)) continue;
        if (manifest.folders.some((f) => within(file, f.path))) continue;
        problems.push(
            `${file} has no license: list it in licenses.json, or put its folder there with a LICENSE`,
        );
    }
    return problems;
}
