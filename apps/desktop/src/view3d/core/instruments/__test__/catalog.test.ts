import { describe, expect, it } from "vitest";
import { carryForSection } from "../catalog";

describe("section to instrument", () => {
    it("maps the brass sections", () => {
        expect(carryForSection("Trumpet")).toEqual({
            model: "trumpet",
            family: "brass",
        });
        expect(carryForSection("Mellophone")).toEqual({
            model: "mellophone",
            family: "brass",
        });
        expect(carryForSection("Baritone")).toEqual({
            model: "baritone",
            family: "brass",
        });
        expect(carryForSection("Euphonium")).toEqual({
            model: "euphonium",
            family: "brass",
        });
        expect(carryForSection("Trombone")).toEqual({
            model: "trombone",
            family: "trombone",
        });
        expect(carryForSection("Bass Trombone")).toEqual({
            model: "bassTrombone",
            family: "trombone",
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
            family: "brass",
        });
    });

    it("carries nothing for every other section", () => {
        for (const s of ["Marimba", "Drum Major", "", "Cornet", "Other"])
            expect(carryForSection(s)).toBeNull();
    });
});
