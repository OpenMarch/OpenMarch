// @vitest-environment node
import { describe, expect, it } from "vitest";
import { carryForSection, finishFor, isTuba, tubaCarry } from "../catalog";

describe("section to instrument", () => {
    it("maps the brass sections", () => {
        expect(carryForSection("Trumpet")).toEqual({
            model: "trumpet",
            family: "trumpet",
        });
        expect(carryForSection("Mellophone")).toEqual({
            model: "mellophone",
            family: "mellophone",
        });
        expect(carryForSection("Baritone")).toEqual({
            model: "baritone",
            family: "baritone",
        });
        expect(carryForSection("Euphonium")).toEqual({
            model: "euphonium",
            family: "euphonium",
        });
        expect(carryForSection("Trombone")).toEqual({
            model: "trombone",
            family: "trombone",
        });
        expect(carryForSection("Bass Trombone")).toEqual({
            model: "bassTrombone",
            family: "bassTrombone",
        });
        expect(carryForSection("Tuba")).toEqual({
            model: "contra",
            family: "contra",
        });
    });

    it("maps the woodwinds", () => {
        expect(carryForSection("Flute")).toEqual({
            model: "flute",
            family: "flute",
        });
        expect(carryForSection("Piccolo")).toEqual({
            model: "piccolo",
            family: "piccolo",
        });
        expect(carryForSection("Clarinet")).toEqual({
            model: "clarinet",
            family: "clarinet",
        });
        expect(carryForSection("Bass Clarinet")).toEqual({
            model: "bassClarinet",
            family: "bassClarinet",
        });
        expect(carryForSection("Soprano Sax")).toEqual({
            model: "sopranoSax",
            family: "clarinet",
        });
        expect(carryForSection("Alto Sax")).toEqual({
            model: "altoSax",
            family: "sax",
        });
        expect(carryForSection("Tenor Sax")).toEqual({
            model: "tenorSax",
            family: "sax",
        });
        expect(carryForSection("Bari Sax")).toEqual({
            model: "bariSax",
            family: "sax",
        });
    });

    it("maps the battery", () => {
        expect(carryForSection("Snare")).toEqual({
            model: "snare",
            family: "snare",
        });
        expect(carryForSection("Tenors")).toEqual({
            model: "tenors",
            family: "tenors",
        });
        expect(carryForSection("Bass Drum")).toEqual({
            model: "bass",
            family: "bass",
        });
        expect(carryForSection("Flub Drum")).toEqual({
            model: "bass",
            family: "bass",
        });
        expect(carryForSection("Cymbals")).toEqual({
            model: "cymbals",
            family: "cymbals",
        });
    });

    it("is case and whitespace insensitive", () => {
        expect(carryForSection("  trumpet ")).toEqual({
            model: "trumpet",
            family: "trumpet",
        });
    });

    it("carries nothing for every other section", () => {
        for (const s of ["Marimba", "Drum Major", "", "Cornet", "Other"])
            expect(carryForSection(s)).toBeNull();
    });
});

describe("the show's choices for its winds", () => {
    it("gives the tubas, and only the tubas, the chosen horn", () => {
        expect(isTuba("Tuba")).toBe(true);
        expect(isTuba(" tuba ")).toBe(true);
        expect(isTuba("Euphonium")).toBe(false);
        expect(isTuba("Unknown")).toBe(false);
        expect(tubaCarry("contra")).toEqual({
            model: "contra",
            family: "contra",
        });
        expect(tubaCarry("sousaphone")).toEqual({
            model: "sousaphone",
            family: "sousaphone",
        });
    });

    it("plates the brass line and leaves the woodwinds as they are made", () => {
        for (const section of ["Trumpet", "Mellophone", "Trombone", "Tuba"]) {
            expect(finishFor(carryForSection(section), "silver")).toBe(
                "silver",
            );
            expect(finishFor(carryForSection(section), "brass")).toBe("brass");
        }
        expect(finishFor(tubaCarry("sousaphone"), "silver")).toBe("silver");
        // flutes and piccolos are silver, saxophones lacquer, whatever the brass wear
        for (const brass of ["brass", "silver"] as const) {
            expect(finishFor(carryForSection("Flute"), brass)).toBe("silver");
            expect(finishFor(carryForSection("Piccolo"), brass)).toBe("silver");
            expect(finishFor(carryForSection("Alto Sax"), brass)).toBe("brass");
            expect(finishFor(carryForSection("Snare"), brass)).toBe("brass");
        }
        expect(finishFor(null, "silver")).toBe("brass");
    });
});
