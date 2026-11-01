// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    familyHint,
    hintText,
    layoutCatalogue,
    layoutOrientations,
    nearestVersion,
    resolveLayout,
    shapeKey,
    turnedKey,
    type LayoutVersion,
} from "../layouts";
import { distribute } from "../distribute";
import { rectRegion } from "../region";
import type { FilesLayout } from "../distribution";

/**
 * The box's layout catalogue (#387, spec #385): every layout is a full block minus a pattern, its
 * versions run wide to deep, a shape two layouts can make lists under the more specific one, and
 * a version that is a quarter turn of one listed before it isn't listed (owner lab feedback,
 * 2026-10-23: the chip's turn button makes it).
 */

const labelsOf = (n: number, family: string) =>
    layoutCatalogue(n)
        .find((r) => r.family === family)!
        .versions.map((v) => v.label);

const versionsOf = (n: number) => layoutCatalogue(n).flatMap((r) => r.versions);

/** The spots a version lays out, at one interval both ways */
const spotsOf = (v: LayoutVersion, n: number) =>
    distribute({
        region: rectRegion(0, 0),
        n,
        distribution: { mode: "files", layout: v.layout, stagger: [0, 1] },
        across: 1,
        deep: 1,
    });

describe("the layout catalogue", () => {
    it("lists the rows in the fixed order Full · Stagger · Rounded · Short back · Notched", () => {
        expect(layoutCatalogue(24).map((r) => r.label)).toEqual([
            "Full",
            "Stagger",
            "Rounded",
            "Short back",
            "Notched",
        ]);
    });

    it("for 23: Stagger offers 8 × 3, 5 × 5 and 3 × 9, no quarter turns; Full is greyed with what it needs", () => {
        expect(labelsOf(23, "stagger")).toEqual(["8 × 3", "5 × 5", "3 × 9"]);
        const stagger = layoutCatalogue(23).find(
            (r) => r.family === "stagger",
        )!;
        expect(stagger.versions[1]!.lines).toEqual([5, 4, 5, 4, 5]);
        expect(stagger.versions.every((v) => !v.layout.byFile)).toBe(true);
        const full = layoutCatalogue(23).find((r) => r.family === "full")!;
        expect(full.versions).toEqual([]);
        expect(full.hint).toEqual({ more: 1, fewer: 2 });
        expect(hintText(full.hint!)).toBe("add 1 / remove 2");
        // A picture of the layout at the nearest count it makes: 24 as 6 × 4
        expect(full.preview).toMatchObject({ count: 24 });
        expect(full.preview!.version.label).toBe("6 × 4");
    });

    it("for 24: Full offers 8 × 3 and 6 × 4, first; 4 × 6 and 3 × 8 are their quarter turns", () => {
        const rows = layoutCatalogue(24);
        expect(rows[0]!.family).toBe("full");
        expect(rows[0]!.versions.map((v) => v.label)).toEqual([
            "8 × 3",
            "6 × 4",
        ]);
        // Drawn deep or stepped, the turns are still there
        expect(layoutOrientations(24, "full").map((v) => v.label)).toEqual([
            "8 × 3",
            "6 × 4",
            "4 × 6",
            "3 × 8",
        ]);
    });

    it("counts exactly 3:1 as within 3:1 of square: Full offers 6 × 2 for 12 and 9 × 3 for 27", () => {
        expect(labelsOf(12, "full")).toEqual(["6 × 2", "4 × 3"]);
        expect(labelsOf(27, "full")).toEqual(["9 × 3"]);
    });

    it("labels Short back with how many short, Rounded and Notched with staggered or straight", () => {
        expect(labelsOf(23, "shortBack")).toEqual([
            "9 × 3, 4 short",
            "8 × 3, 1 short",
            "6 × 4, 1 short",
            "5 × 5, 2 short",
            "4 × 6, 1 short",
            "3 × 8, 1 short",
        ]);
        expect(labelsOf(23, "rounded")).toEqual([
            "9 × 3 straight",
            "5 × 5 staggered",
        ]);
        expect(labelsOf(23, "notched")).toEqual(["5 × 5 straight"]);
        expect(labelsOf(24, "notched")).toEqual(["5 × 5 staggered"]);
    });

    it("never says files, ranks, by file or ends in a label; the counts go in the tooltip", () => {
        for (let n = 1; n <= 60; n++)
            for (const v of versionsOf(n)) {
                expect(v.label).not.toMatch(/file|rank|ends|turn/i);
                // Front to back (the lines run back first), or left to right turned
                const counts = v.layout.byFile
                    ? v.lines
                    : [...v.lines].reverse();
                expect(v.tooltip).toContain(counts.join(" / "));
            }
        expect(
            layoutOrientations(23, "stagger").find((v) => v.layout.byFile)!
                .tooltip,
        ).toMatch(/left to right/);
    });

    it("keeps a row the count can't make in its place, with how many would make it and a picture", () => {
        const rows = layoutCatalogue(26);
        expect(rows.map((r) => r.family)).toEqual([
            "full",
            "stagger",
            "rounded",
            "shortBack",
            "notched",
        ]);
        // 27 is 9 × 3 (exactly 3:1) and 25 is 5 × 5
        const full = rows.find((r) => r.family === "full")!;
        expect(full.hint).toEqual({ more: 1, fewer: 1 });
        expect(full.preview!.count).toBe(27);
        expect(hintText({ more: 3, fewer: null })).toBe("add 3");
        expect(hintText({ more: null, fewer: 2 })).toBe("remove 2");
        for (const row of layoutCatalogue(24))
            expect(row.preview).toBeUndefined();
    });

    it("places exactly n for every version from 1 to 120 marchers, with no short rank under 2", () => {
        for (let n = 1; n <= 120; n++)
            for (const v of versionsOf(n)) {
                expect(v.lines.reduce((a, b) => a + b, 0)).toBe(n);
                expect(spotsOf(v, n)).toHaveLength(n);
                const width = Math.max(...v.lines);
                for (const line of v.lines)
                    if (line < width) expect(line).toBeGreaterThanOrEqual(2);
            }
    });

    it("keeps every version within 3:1 of square, wide to deep", () => {
        for (let n = 1; n <= 120; n++)
            for (const row of layoutCatalogue(n)) {
                for (const v of row.versions)
                    expect(Math.max(v.across, v.deep)).toBeLessThanOrEqual(
                        3 * Math.min(v.across, v.deep),
                    );
                const aspects = row.versions.map((v) => v.across / v.deep);
                expect([...aspects].sort((a, b) => b - a)).toEqual(aspects);
            }
    });

    it("cuts every version from a full block: each line centered, only the family's pattern removed", () => {
        for (let n = 1; n <= 120; n++)
            for (const row of layoutCatalogue(n))
                for (const v of row.versions) {
                    const width = Math.max(...v.lines);
                    const short = v.lines.map((l) => width - l);
                    const R = v.lines.length;
                    const mid = (R - 1) / 2;
                    switch (row.family) {
                        case "full":
                            expect(short.every((s) => s === 0)).toBe(true);
                            break;
                        case "stagger":
                            expect(R % 2).toBe(1);
                            short.forEach((s, i) =>
                                expect(s).toBe(
                                    (i % 2 === 0) === (short[0] === 0) ? 0 : 1,
                                ),
                            );
                            break;
                        case "rounded":
                            expect(short[0]).toBe(short[R - 1]);
                            expect([1, 2]).toContain(short[0]);
                            short
                                .slice(1, -1)
                                .forEach((s) => expect(s).toBe(0));
                            break;
                        case "notched":
                            expect(R % 2).toBe(1);
                            expect([1, 2]).toContain(short[mid]);
                            short.forEach(
                                (s, i) => i !== mid && expect(s).toBe(0),
                            );
                            break;
                        case "shortBack":
                            // the back line (first) short, the rest full
                            expect(short[0]).toBeGreaterThan(0);
                            short.slice(1).forEach((s) => expect(s).toBe(0));
                            break;
                    }
                }
    });

    it("lists a shape two layouts can make under the more specific one, and never twice", () => {
        for (let n = 1; n <= 120; n++) {
            const keys = versionsOf(n).map((v) =>
                JSON.stringify(
                    spotsOf(v, n)
                        .map((s) => [s.x, s.y])
                        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
                ),
            );
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it("never lists a quarter turn of a version listed before it", () => {
        for (let n = 1; n <= 120; n++) {
            const seen = new Set<string>();
            for (const v of versionsOf(n)) {
                expect(seen.has(turnedKey(v.lines, v.layout.byFile))).toBe(
                    false,
                );
                expect(v.layout.byFile).toBe(false);
                seen.add(shapeKey(v.lines, v.layout.byFile));
            }
        }
        // A block with its corners off, 7 × 4, and its turn 4 × 7: one listed
        expect(labelsOf(24, "rounded")).toEqual(["7 × 4 straight"]);
    });
});

describe("resolving a layout for a count", () => {
    const stagger55: FilesLayout = {
        family: "stagger",
        files: 5,
        byFile: false,
    };

    it("keeps a version that makes the count", () => {
        const r = resolveLayout(stagger55, 23);
        expect(r.layout).toEqual(stagger55);
        expect(r.lines).toEqual([5, 4, 5, 4, 5]);
        expect(r.fellBack).toBeNull();
    });

    it("moves to the family's version nearest in proportion when the count changes", () => {
        // 22 as a stagger: 4 / 5 / 4 / 5 / 4, the same 5 × 5 block
        const r = resolveLayout(stagger55, 22);
        expect(r.layout.family).toBe("stagger");
        expect(r.lines).toEqual([4, 5, 4, 5, 4]);
        expect(r.fellBack).toBeNull();
    });

    it("falls back to Short back, as wide, when the family can't make the count", () => {
        const full64: FilesLayout = { family: "full", files: 6, byFile: false };
        const r = resolveLayout(full64, 23);
        expect(r.layout).toEqual({
            family: "shortBack",
            files: 6,
            byFile: false,
        });
        expect(r.lines).toEqual([5, 6, 6, 6]);
        expect(r.fellBack).toBe("full");
        expect(familyHint("full", 23)).toEqual({ more: 1, fewer: 2 });
    });

    it("finds the version nearest a drawn proportion", () => {
        expect(nearestVersion("full", 24, 1)!.label).toBe("6 × 4");
        expect(nearestVersion("full", 24, 3)!.label).toBe("8 × 3");
        // Deep: a quarter turn of a listed version
        expect(nearestVersion("full", 24, 0.6)!.label).toBe("4 × 6");
        expect(nearestVersion("stagger", 23, 0.4)!.layout).toMatchObject({
            family: "stagger",
            files: 8,
            byFile: true,
        });
        expect(nearestVersion("full", 23, 1)).toBeNull();
    });
});
