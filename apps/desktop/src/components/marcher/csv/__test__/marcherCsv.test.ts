import { describe, expect, it } from "vitest";
import {
    exampleMarcherCsv,
    parseCsv,
    planMarcherCsv,
    sectionPrefixTable,
    splitDrillNumber,
} from "../marcherCsv";

const ok = (plan: ReturnType<typeof planMarcherCsv>) =>
    plan.rows.map((r) => r.marcher);
const errors = (plan: ReturnType<typeof planMarcherCsv>) =>
    plan.rows.map((r) => r.error?.code);

describe("parseCsv", () => {
    it("handles quotes, doubled quotes, embedded newlines, CRLF and a BOM", () => {
        const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"l1\nl2",z\n');
        expect(rows.map((r) => r.cells)).toEqual([
            ["a", "b"],
            ["x, y", 'say "hi"'],
            ["l1\nl2", "z"],
        ]);
        expect(rows.map((r) => r.line)).toEqual([1, 2, 3]);
    });

    it("skips blank lines", () => {
        expect(parseCsv("a\n\n,\nb")).toHaveLength(2);
    });
});

describe("splitDrillNumber", () => {
    it("splits prefix and number", () => {
        expect(splitDrillNumber("B12")).toEqual({ prefix: "B", order: 12 });
        expect(splitDrillNumber("bc 03")).toEqual({ prefix: "bc", order: 3 });
        expect(splitDrillNumber("12")).toBeUndefined();
        expect(splitDrillNumber("B0")).toBeUndefined();
        expect(splitDrillNumber("B")).toBeUndefined();
    });
});

describe("planMarcherCsv by section", () => {
    it("numbers automatically per prefix, after existing marchers", () => {
        const plan = planMarcherCsv(
            "section,name\nFlute,Ada\nflute,\nTrumpet,Lou\n",
            "section",
            [{ drill_prefix: "F", drill_order: 1 }],
        );
        expect(ok(plan)).toMatchObject([
            {
                section: "Flute",
                drill_prefix: "F",
                drill_order: 2,
                name: "Ada",
            },
            { drill_order: 3, name: null },
            { section: "Trumpet", drill_order: 1 },
        ]);
    });

    it("accepts a unique prefix in place of the name, and optional columns", () => {
        const plan = planMarcherCsv(
            "Section,Year,Notes\nF,12,lead\n",
            "section",
            [],
        );
        expect(ok(plan)).toMatchObject([
            { section: "Flute", year: "12", notes: "lead" },
        ]);
    });

    it("reports unknown and missing sections per row and keeps the rest", () => {
        const plan = planMarcherCsv(
            'section\nKazoo\n" "\nFlute\n',
            "section",
            [],
        );
        expect(errors(plan)).toEqual(["unknownSection", undefined]);
        expect(ok(plan)[1]?.section).toBe("Flute");
    });

    it("reports a missing section column", () => {
        const plan = planMarcherCsv("name\nAda\n", "section", []);
        expect(plan.missingColumns).toEqual(["section"]);
        expect(plan.rows).toEqual([]);
    });

    it("lists unused columns", () => {
        const plan = planMarcherCsv(
            "section,drill_number,height\nFlute,F1,5\n",
            "section",
            [],
        );
        expect(plan.ignoredColumns).toEqual(["drill_number", "height"]);
    });
});

describe("planMarcherCsv by drill number", () => {
    it("uses the number as given and derives the section from the prefix", () => {
        const plan = planMarcherCsv(
            "drill_number,name\nF7,Ada\nBC2,\n",
            "drillNumber",
            [],
        );
        expect(ok(plan)).toMatchObject([
            {
                section: "Flute",
                drill_prefix: "F",
                drill_order: 7,
                name: "Ada",
            },
            { section: "Bass Clarinet", drill_prefix: "BC", drill_order: 2 },
        ]);
    });

    it("requires a section for the shared prefix C, and honours an explicit section", () => {
        const plan = planMarcherCsv(
            "drill_number,section\nC1,\nC2,Cymbals\n",
            "drillNumber",
            [],
        );
        expect(errors(plan)).toEqual(["ambiguousPrefix", undefined]);
        expect(ok(plan)[1]?.section).toBe("Cymbals");
    });

    it("rejects unknown prefixes, bad numbers and duplicates", () => {
        const plan = planMarcherCsv(
            "drill_number\nZZ1\nF\nF1\nF1\nT3\n",
            "drillNumber",
            [{ drill_prefix: "T", drill_order: 3 }],
        );
        expect(errors(plan)).toEqual([
            "unknownPrefix",
            "invalidDrillNumber",
            undefined,
            "duplicateInFile",
            "duplicateInShow",
        ]);
    });

    it("accepts header aliases", () => {
        const plan = planMarcherCsv(
            "Drill Number,Instrument\nF1,Flute\n",
            "drillNumber",
            [],
        );
        expect(ok(plan)).toHaveLength(1);
    });
});

describe("examples and reference", () => {
    it("both example files import cleanly", () => {
        for (const mode of ["section", "drillNumber"] as const) {
            const plan = planMarcherCsv(exampleMarcherCsv(mode), mode, []);
            expect(plan.missingColumns).toEqual([]);
            expect(errors(plan).filter(Boolean)).toEqual([]);
            expect(plan.rows.length).toBeGreaterThan(0);
        }
    });

    it("flags the shared prefix in the reference table", () => {
        const shared = sectionPrefixTable().filter((s) => s.shared);
        expect(shared.map((s) => s.name).sort()).toEqual([
            "Clarinet",
            "Cymbals",
        ]);
    });
});
