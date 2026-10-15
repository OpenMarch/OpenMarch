/**
 * The show's Credits (props-spec.md section 10, package C5.7): what the show embeds that needs
 * attribution, and whether to show the Share note.
 *
 * CC-BY and Unknown items are listed as "Name — Author — License — Source (modified)", grouped
 * by license. CC0 and built-in items need no credit and collapse to one count. Any other
 * license is listed too, in its own group, since only CC0 is known to need nothing. The Share
 * note is for Unknown items only.
 */
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import {
    LICENSE_PROPRIETARY,
    LICENSE_UNKNOWN,
} from "@om-electron/main/library/types";

const CC0 = "CC0-1.0";

export interface CreditLine {
    itemId: string;
    name: string;
    author: string | null;
    license: string;
    sourceUrl: string | null;
    attribution: string | null;
    modified: boolean;
}

export interface CreditGroup {
    license: string;
    lines: CreditLine[];
}

export interface ShowCredits {
    /** Listed items, grouped by license: CC-BY first, Unknown last. */
    groups: CreditGroup[];
    /** CC0 and built-in items, which need no credit. */
    uncredited: number;
    /** Some item's license is Unknown: the show may not be shareable. */
    shareNote: boolean;
}

/** The order groups appear in: CC-BY, then other licenses, then Unknown. */
function groupRank(license: string): number {
    if (license.startsWith("CC-BY")) return 0;
    if (license === LICENSE_UNKNOWN) return 2;
    return 1;
}

/**
 * Builds the Credits from the show's embedded items. A Library item embedded in several
 * Versions counts once, with the newest Version's metadata, since a license correction is a
 * metadata-only change.
 */
export function showCredits(items: readonly ShowLibraryItem[]): ShowCredits {
    const newest = new Map<string, ShowLibraryItem>();
    for (const item of items) {
        const seen = newest.get(item.itemId);
        if (!seen || item.embeddedAt > seen.embeddedAt)
            newest.set(item.itemId, item);
    }

    let uncredited = 0;
    const byLicense = new Map<string, CreditLine[]>();
    for (const item of newest.values()) {
        const { license } = item.metadata;
        if (item.builtIn || license === CC0) {
            uncredited++;
            continue;
        }
        const lines = byLicense.get(license) ?? [];
        lines.push({
            itemId: item.itemId,
            name: item.name,
            author: item.metadata.author,
            license,
            sourceUrl: item.metadata.sourceUrl,
            attribution: item.metadata.attribution,
            modified: item.metadata.modified,
        });
        byLicense.set(license, lines);
    }

    const groups = [...byLicense]
        .map(([license, lines]) => ({
            license,
            lines: lines.sort(
                (a, b) =>
                    a.name.localeCompare(b.name) ||
                    a.itemId.localeCompare(b.itemId),
            ),
        }))
        .sort(
            (a, b) =>
                groupRank(a.license) - groupRank(b.license) ||
                a.license.localeCompare(b.license),
        );

    return {
        groups,
        uncredited,
        shareNote: byLicense.has(LICENSE_UNKNOWN),
    };
}

/** How a license reads in Credits: the SPDX id, or words for the `LicenseRef-` ids. */
export function licenseLabel(
    license: string,
    words: { unknown: string; proprietary: string },
): string {
    if (license === LICENSE_UNKNOWN) return words.unknown;
    if (license === LICENSE_PROPRIETARY) return words.proprietary;
    return license;
}

/** "Name — Author — License — Source (modified)", leaving out what's missing. */
export function creditText(line: CreditLine, license: string): string {
    const text = [line.name, line.author, license, line.sourceUrl]
        .filter((part): part is string => !!part)
        .join(" — ");
    return line.modified ? `${text} (modified)` : text;
}
