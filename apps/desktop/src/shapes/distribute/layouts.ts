import tolgee from "@/global/singletons/Tolgee";
import {
    LAYOUT_FAMILIES,
    LAYOUT_LABELS,
    type FilesLayout,
    type LayoutFamily,
} from "./distribution";

/**
 * The box's layout catalogue (#387, spec #385): which versions of each layout make a count, how
 * they are labelled, and what a layout does when the count changes. Every layout is a full block
 * minus a pattern, every line centered. Everything here is pure.
 *
 * A layout is laid out as lines, back first (the left file first when turned), the same lines
 * `distribute.ts` centers and spaces.
 */

/** A shape two layouts can make is listed under the more specific one, in this order */
const SPECIFICITY: readonly LayoutFamily[] = [
    "full",
    "stagger",
    "rounded",
    "notched",
    "shortBack",
];

/** Short back's lines: full lines of `width`, the back one short (all in one under `width`) */
export function shortBackLines(width: number, n: number): number[] {
    const w = Math.max(1, Math.round(width));
    const count = Math.max(1, n);
    const lines = Math.ceil(count / w);
    return Array.from({ length: lines }, (_, i) =>
        i === 0 ? count - (lines - 1) * w : w,
    );
}

/**
 * The lines of `family` with full lines of `width` making exactly `n`, back first; null when it
 * can't. With the width and count fixed there is at most one: the number of lines follows.
 * Short back here is a strict one (its back line short), as the catalogue lists it.
 */
export function familyLines(
    family: LayoutFamily,
    width: number,
    n: number,
): number[] | null {
    const F = Math.round(width);
    if (F < 1 || n < 1) return null;
    const block = (R: number, cut: (i: number) => number) =>
        Array.from({ length: R }, (_, i) => F - cut(i));
    switch (family) {
        case "full":
            return n % F === 0 ? block(n / F, () => 0) : null;
        case "shortBack": {
            const R = Math.ceil(n / F);
            return R >= 2 && n % F !== 0 ? shortBackLines(F, n) : null;
        }
        case "stagger":
            // Ends out (5/4/5/4/5) or ends in (4/5/4/5/4)
            for (let R = 3; R * (F - 1) <= n; R += 2) {
                if (F < 2) break;
                if (R * F - (R - 1) / 2 === n) return block(R, (i) => i % 2);
                if (R * F - (R + 1) / 2 === n)
                    return block(R, (i) => 1 - (i % 2));
            }
            return null;
        case "rounded":
            for (let R = 3; F * (R - 2) <= n; R++)
                for (const k of [1, 2])
                    if (F - k >= 1 && F * R - 2 * k === n)
                        return block(R, (i) =>
                            i === 0 || i === R - 1 ? k : 0,
                        );
            return null;
        case "notched":
            for (let R = 3; F * (R - 1) <= n; R += 2)
                for (const k of [1, 2])
                    if (F - k >= 1 && F * R - k === n)
                        return block(R, (i) => (i === (R - 1) / 2 ? k : 0));
            return null;
    }
}

/** One version of a layout as the picker shows it */
export interface LayoutVersion {
    readonly layout: FilesLayout;
    /** Marchers in each line, back first (the left file first when turned) */
    readonly lines: readonly number[];
    /** The full block it is cut from, on the box's own axes: side to side, front to back */
    readonly across: number;
    readonly deep: number;
    /** "5 × 5", "6 × 4, 1 short", "5 × 5 staggered" */
    readonly label: string;
    /** The counts: "5 / 4 / 5 / 4 / 5, front to back" */
    readonly tooltip: string;
}

/** How many more or fewer marchers would make a layout; null where none near does */
export interface LayoutHint {
    readonly more: number | null;
    readonly fewer: number | null;
}

/** A row of the picker: its versions wide to deep, or a hint when the count can't make it */
export interface LayoutRow {
    readonly family: LayoutFamily;
    readonly label: string;
    readonly versions: readonly LayoutVersion[];
    /** Present when `versions` is empty */
    readonly hint?: LayoutHint;
    /**
     * When `versions` is empty: the layout at the nearest count it makes (more first), its
     * version nearest square, for a greyed picture
     */
    readonly preview?: {
        readonly version: LayoutVersion;
        readonly count: number;
    };
}

/** The block's size on the box's axes */
function blockOf(lines: readonly number[], byFile: boolean) {
    const width = Math.max(...lines);
    return byFile
        ? { across: lines.length, deep: width }
        : { across: width, deep: lines.length };
}

/** A line short by an odd count sits half an interval in, between the files */
const between = (width: number, line: number) => (width - line) % 2 === 1;

export function versionOf(
    layout: FilesLayout,
    lines: readonly number[],
): LayoutVersion {
    const { across, deep } = blockOf(lines, layout.byFile);
    const width = Math.max(...lines);
    const n = lines.reduce((a, b) => a + b, 0);
    const short = across * deep - n;
    // The line that says whether a rounded or notched version is staggered or straight
    const marker =
        layout.family === "rounded"
            ? lines[0]!
            : layout.family === "notched"
              ? lines[(lines.length - 1) / 2]!
              : null;
    const counts = layout.byFile
        ? lines.join(" / ")
        : [...lines].reverse().join(" / ");
    // Getters: versions are cached, and the words must follow the current language
    return {
        layout,
        lines,
        across,
        deep,
        get label() {
            if (layout.family === "shortBack")
                return tolgee.t(
                    "shapes.distribute.version.short",
                    "{across} × {deep}, {short} short",
                    { across, deep, short },
                );
            if (marker !== null)
                return between(width, marker)
                    ? tolgee.t(
                          "shapes.distribute.version.staggered",
                          "{across} × {deep} staggered",
                          { across, deep },
                      )
                    : tolgee.t(
                          "shapes.distribute.version.straight",
                          "{across} × {deep} straight",
                          { across, deep },
                      );
            return tolgee.t(
                "shapes.distribute.version.size",
                "{across} × {deep}",
                { across, deep },
            );
        },
        get tooltip() {
            return layout.byFile
                ? tolgee.t(
                      "shapes.distribute.version.leftToRight",
                      "{counts}, left to right",
                      { counts },
                  )
                : tolgee.t(
                      "shapes.distribute.version.frontToBack",
                      "{counts}, front to back",
                      { counts },
                  );
        },
    };
}

/**
 * The spots the lines make, one interval apart both ways, in half intervals from the block's
 * middle: x side to side, y back (−) to front. For thumbnails, and to tell shapes apart.
 */
export function versionDots(
    lines: readonly number[],
    byFile: boolean,
): { x: number; y: number }[] {
    const width = Math.max(...lines);
    const R = lines.length;
    const dots: { x: number; y: number }[] = [];
    lines.forEach((m, i) => {
        for (let j = 0; j < m; j++) {
            const u = 2 * j + width - m - (width - 1);
            const v = 2 * i - (R - 1);
            dots.push(byFile ? { x: v, y: u } : { x: u, y: v });
        }
    });
    return dots;
}

const keyOf = (dots: readonly { x: number; y: number }[]) =>
    dots
        .map((d) => `${d.x},${d.y}`)
        .sort()
        .join(" ");

/** Each lines array's keys, as it is and turned, by file and by rank: the menus ask often (#455) */
const keys = new WeakMap<
    readonly number[],
    Partial<Record<"file" | "rank", { key: string; turned: string }>>
>();

function keysOf(lines: readonly number[], byFile: boolean) {
    let entry = keys.get(lines);
    if (!entry) {
        entry = {};
        keys.set(lines, entry);
    }
    const side = byFile ? "file" : "rank";
    let found = entry[side];
    if (!found) {
        const dots = versionDots(lines, byFile);
        found = {
            key: keyOf(dots),
            turned: keyOf(dots.map((d) => ({ x: -d.y, y: d.x }))),
        };
        entry[side] = found;
    }
    return found;
}

/** Two layouts that make the same key are the same shape */
export function shapeKey(lines: readonly number[], byFile: boolean): string {
    return keysOf(lines, byFile).key;
}

/** The key of the shape turned a quarter: a layout that makes it is the same shape, turned */
export function turnedKey(lines: readonly number[], byFile: boolean): string {
    return keysOf(lines, byFile).turned;
}

/** Whether `lines` make `version`'s shape, as it is or turned a quarter */
export function isVersionAnyTurn(
    version: LayoutVersion,
    lines: readonly number[],
    byFile: boolean,
): boolean {
    const key = shapeKey(version.lines, version.layout.byFile);
    return shapeKey(lines, byFile) === key || turnedKey(lines, byFile) === key;
}

/** Within 3:1 of square: the long side at most three times the short one */
const nearSquare = (v: { across: number; deep: number }) =>
    Math.max(v.across, v.deep) <= 3 * Math.min(v.across, v.deep);

/**
 * No lonely marchers: a short line keeps at least 2, and Short back's at least a third of a full
 * line (7 / 7 / 7 / 2 reads as a box with stragglers), as the prototype the owner chose from had it
 */
const noLonely = (family: LayoutFamily, lines: readonly number[]) => {
    const width = Math.max(...lines);
    return lines.every(
        (l) =>
            l === width ||
            (l >= 2 && (family !== "shortBack" || 3 * l >= width)),
    );
};

const cache = new Map<number, readonly LayoutRow[]>();
const CACHE_LIMIT = 400;

/**
 * Each layout's versions for exactly `n`, before hints. A version that is the same shape as one
 * listed before it, as it is or turned a quarter, isn't listed again: the more specific layout
 * keeps a shape two can make, and the wider version keeps a shape and its turn (the chip's turn
 * button makes the other; owner lab feedback, 2026-10-23).
 */
function versionsFor(n: number): Map<LayoutFamily, LayoutVersion[]> {
    const seen = new Set<string>();
    const by = new Map<LayoutFamily, LayoutVersion[]>();
    for (const family of SPECIFICITY) {
        const versions: LayoutVersion[] = [];
        for (let width = 1; width <= n; width++) {
            const lines = familyLines(family, width, n);
            if (!lines || !noLonely(family, lines)) continue;
            versions.push(
                versionOf({ family, files: width, byFile: false }, lines),
            );
        }
        // Wide to deep, so a shape and its turn keep the wider
        versions.sort((a, b) => b.across / b.deep - a.across / a.deep);
        by.set(
            family,
            versions.filter((v) => {
                if (!nearSquare(v)) return false;
                const key = shapeKey(v.lines, false);
                if (seen.has(key)) return false;
                seen.add(key);
                seen.add(turnedKey(v.lines, false));
                return true;
            }),
        );
    }
    return by;
}

/**
 * `version` turned a quarter, as a layout of its family: a Full block the other way, or the same
 * lines by file (every family but Short back is symmetric, so that is its turn). Null for Short
 * back, whose turn no layout makes, and for a shape its turn leaves the same.
 */
function turnOf(version: LayoutVersion): LayoutVersion | null {
    const { layout, lines } = version;
    if (layout.family === "shortBack") return null;
    if (shapeKey(lines, layout.byFile) === turnedKey(lines, layout.byFile))
        return null;
    if (layout.family === "full") {
        const files = lines.length;
        const n = lines.reduce((a, b) => a + b, 0);
        return versionOf(
            { family: "full", files, byFile: false },
            familyLines("full", files, n)!,
        );
    }
    return versionOf({ ...layout, byFile: !layout.byFile }, lines);
}

/**
 * Every way `family` lays out `n`: its listed versions and their quarter turns, wide to deep. A
 * drawn box, the size number's − and +, and a count change pick from these, so a box drawn deep
 * comes out deep though the picker lists only the wider of a shape and its turn.
 */
export function layoutOrientations(
    n: number,
    family: LayoutFamily,
): LayoutVersion[] {
    const row = layoutCatalogue(n).find((r) => r.family === family)!;
    const all = row.versions.flatMap((v) => {
        const turned = turnOf(v);
        return turned ? [v, turned] : [v];
    });
    return all.sort(
        (a, b) =>
            b.across / b.deep - a.across / a.deep ||
            Number(a.layout.byFile) - Number(b.layout.byFile),
    );
}

/** How near a count is that `family` makes: add `more`, or remove `fewer`, within 12 */
export function familyHint(family: LayoutFamily, n: number): LayoutHint {
    let more: number | null = null;
    let fewer: number | null = null;
    for (let k = 1; k <= 12 && (more === null || fewer === null); k++) {
        if (more === null && versionsFor(n + k).get(family)!.length > 0)
            more = k;
        if (
            fewer === null &&
            n - k >= 1 &&
            versionsFor(n - k).get(family)!.length > 0
        )
            fewer = k;
    }
    return { more, fewer };
}

/** A version's full name, its layout then its version, as the picker reads it: "Short back 6 × 4, 1 short" */
export function layoutVersionName(layout: string, version: string): string {
    return tolgee.t("shapes.distribute.versionName", "{layout} {version}", {
        layout,
        version,
    });
}

/**
 * The layout picker for `n` marchers: every layout in the fixed order Full · Stagger · Rounded ·
 * Short back · Notched, each with its versions wide to deep, or the nearest counts it makes
 */
export function layoutCatalogue(n: number): readonly LayoutRow[] {
    const count = Math.max(1, Math.round(n));
    const hit = cache.get(count);
    if (hit) return hit;
    const by = versionsFor(count);
    const rows = LAYOUT_FAMILIES.map((family): LayoutRow => {
        const versions = by.get(family)!;
        if (versions.length > 0)
            return {
                family,
                get label() {
                    return LAYOUT_LABELS[family];
                },
                versions,
            };
        const hint = familyHint(family, count);
        const near =
            hint.more !== null
                ? count + hint.more
                : hint.fewer !== null
                  ? count - hint.fewer
                  : null;
        const version =
            near === null ? undefined : nearestOf(by4(near, family), 1);
        return {
            family,
            get label() {
                return LAYOUT_LABELS[family];
            },
            versions,
            hint,
            ...(near !== null && version
                ? { preview: { version, count: near } }
                : {}),
        };
    });
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(count, rows);
    return rows;
}

/** "add 1 / remove 2": one message for each case, so a language can word it whole */
export function hintText(hint: LayoutHint): string {
    const { more, fewer } = hint;
    if (more !== null && fewer !== null)
        return tolgee.t(
            "shapes.distribute.hint.addOrRemove",
            "{more, plural, one {add #} other {add #}} / {fewer, plural, one {remove #} other {remove #}}",
            { more, fewer },
        );
    if (more !== null)
        return tolgee.t(
            "shapes.distribute.hint.add",
            "{count, plural, one {add #} other {add #}}",
            { count: more },
        );
    if (fewer !== null)
        return tolgee.t(
            "shapes.distribute.hint.remove",
            "{count, plural, one {remove #} other {remove #}}",
            { count: fewer },
        );
    return "";
}

/** A count's listed versions of `family`, without its own hint (which would recurse) */
const by4 = (n: number, family: LayoutFamily) => versionsFor(n).get(family)!;

/** Of `versions`, the one nearest `aspect` (across ÷ deep), the first of equals */
function nearestOf(
    versions: readonly LayoutVersion[],
    aspect: number,
): LayoutVersion | undefined {
    let best: LayoutVersion | undefined;
    let bestScore = Infinity;
    for (const v of versions) {
        const score = Math.abs(Math.log(v.across / v.deep / aspect));
        if (score < bestScore - 1e-9) {
            best = v;
            bestScore = score;
        }
    }
    return best;
}

/**
 * The version of `family` for `n` nearest `aspect` (across ÷ deep, in spots), quarter turns
 * included, the first of equals; null when the family can't make `n`
 */
export function nearestVersion(
    family: LayoutFamily,
    n: number,
    aspect: number,
): LayoutVersion | null {
    return nearestOf(layoutOrientations(n, family), aspect) ?? null;
}

/** A layout as laid out for a count: the version it is, or Short back when its family can't */
export interface ResolvedLayout {
    readonly layout: FilesLayout;
    /** Marchers in each line, back first (the left file first when turned) */
    readonly lines: readonly number[];
    /** The block's size on the box's axes */
    readonly across: number;
    readonly deep: number;
    /** The layout asked for, when its family can't make the count and Short back stands in */
    readonly fellBack: LayoutFamily | null;
}

function resolved(
    layout: FilesLayout,
    lines: readonly number[],
    fellBack: LayoutFamily | null,
): ResolvedLayout {
    return { layout, lines, ...blockOf(lines, layout.byFile), fellBack };
}

/**
 * How `layout` lays out `n` (spec #385, "Keeping the layout"): as it is when it makes the count;
 * else its family's version nearest its proportions; else Short back as wide, noting the layout
 * it stands in for. Short back makes every count, any width.
 */
export function resolveLayout(layout: FilesLayout, n: number): ResolvedLayout {
    const count = Math.max(1, n);
    const width = Math.max(1, Math.round(layout.files));
    if (layout.family === "shortBack")
        return resolved(
            { ...layout, files: width },
            shortBackLines(width, count),
            null,
        );
    const exact = familyLines(layout.family, width, count);
    if (exact) return resolved({ ...layout, files: width }, exact, null);
    // The block it was, about: `width` along a line, the rest the other way
    const other = Math.max(1, count / width);
    const aspect = layout.byFile ? other / width : width / other;
    const near = nearestVersion(layout.family, count, aspect);
    if (near) return resolved(near.layout, near.lines, null);
    const across = layout.byFile ? Math.max(1, Math.round(other)) : width;
    return resolved(
        { family: "shortBack", files: across, byFile: false },
        shortBackLines(across, count),
        layout.family,
    );
}

/**
 * The layout a box reads as (#437, owner): a Short back with no short line (the width divides the
 * count, or everyone fits on one line) is a whole block, so it shows as Full in the layout menu,
 * the chip and the command bar. Display only: the recipe keeps Short back, so − and + still step
 * one across at a time. The other layouts always leave a spot out, so they read as themselves.
 */
export function shownFamily(r: ResolvedLayout): LayoutFamily {
    return r.layout.family === "shortBack" &&
        r.lines.every((l) => l === r.lines[0])
        ? "full"
        : r.layout.family;
}

/** "Stagger", "short" or "short back" names a layout: the start of its name, spaces ignored */
function familyNamed(words: string): LayoutFamily | null {
    const typed = words.replace(/\s+/g, "").toLowerCase();
    if (typed === "") return null;
    return (
        LAYOUT_FAMILIES.find((f) =>
            LAYOUT_LABELS[f]
                .replace(/\s+/g, "")
                .toLowerCase()
                .startsWith(typed),
        ) ?? null
    );
}

/**
 * The version a typed answer names for `n` (the command bar's layout step): a layout by the start
 * of its name, a block ("5x5", "8 × 3", or just "8" across), or both ("stagger 5x5"). Without a
 * layout it's `family`'s; without a block, the version nearest `aspect` (across ÷ deep). Null when
 * nothing matches.
 */
export function parseLayout(
    text: string,
    n: number,
    family: LayoutFamily,
    aspect: number,
): LayoutVersion | null {
    // As the picker labels versions: "Short back 6 × 4, 1 short", "Rounded 5 × 5 staggered"
    const plain = text
        .replace(/,?\s*\d+\s*short\b/i, " ")
        .replace(/\b(staggered|straight)\b/gi, " ")
        .replace(/,/g, " ");
    const size = /(\d+)\s*(?:(?:×|x|\*|by)\s*(\d+))?/i.exec(plain);
    const words = size ? plain.replace(size[0], " ") : plain;
    const named = familyNamed(words);
    if (words.trim() !== "" && named === null) return null;
    const pick = named ?? family;
    if (!size) return named ? nearestVersion(pick, n, aspect) : null;
    const across = Number(size[1]);
    const deep = size[2] === undefined ? undefined : Number(size[2]);
    // Its turns too: "stagger 3x8" is 8 × 3 turned
    return (
        layoutOrientations(n, pick).find(
            (v) =>
                v.across === across && (deep === undefined || v.deep === deep),
        ) ?? null
    );
}
