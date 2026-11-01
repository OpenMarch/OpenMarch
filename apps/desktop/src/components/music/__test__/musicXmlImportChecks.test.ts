// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseMusicXmlWithReport } from "@openmarch/musicxml-parser";
import { importChecks } from "../musicXmlImportChecks";

const score = (measures: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Part</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
const attributes = `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
const tempo = `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>`;
const rest = `<note><rest/><duration>4</duration></note>`;
const fermata = `<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><notations><fermata/></notations></note>`;

describe("importChecks", () => {
    it("lists nothing for a score the importer read without guessing", () => {
        const xml = score(
            `<measure number="1">${attributes}${tempo}${rest}</measure>`,
        );
        expect(importChecks(parseMusicXmlWithReport(xml))).toEqual([]);
    });

    it("lists the same check in several measures once, with its measures", () => {
        const xml = score(
            `<measure number="1">${attributes}${tempo}${fermata}</measure>` +
                `<measure number="2">${rest}</measure>` +
                `<measure number="3">${fermata}</measure>`,
        );
        expect(importChecks(parseMusicXmlWithReport(xml))).toEqual([
            {
                code: "fermata",
                message: "Fermata: its count keeps its length",
                measures: ["1", "3"],
            },
        ]);
    });

    it("leaves out notes that say the importer did the expected thing", () => {
        // A repeat that was played out is a note, not something to check
        const xml = score(
            `<measure number="1">${attributes}${tempo}${rest}<barline location="right"><repeat direction="backward"/></barline></measure>`,
        );
        const result = parseMusicXmlWithReport(xml);
        expect(result.warnings.map((w) => w.code)).toContain("repeat-played");
        expect(importChecks(result)).toEqual([]);
    });

    it("says when the file has no tempo, which changes every count", () => {
        const xml = score(`<measure number="1">${attributes}${rest}</measure>`);
        expect(
            importChecks(parseMusicXmlWithReport(xml)).map((c) => c.code),
        ).toEqual(["no-tempo"]);
    });
});
