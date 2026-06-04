import { describe, it, expect } from "vitest";
import { tokenize, meaningful, type Token } from "../tokenizer";

const types = (tokens: Token[]) => tokens.map((t) => t.type);
const values = (tokens: Token[]) => tokens.map((t) => t.value);

describe("tokenizer", () => {
    describe("basic tokens", () => {
        it("tokenizes a number", () => {
            const t = tokenize("4.0");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({ type: "NUMBER", value: "4.0" });
        });

        it("tokenizes integers", () => {
            expect(tokenize("50")[0].type).toBe("NUMBER");
        });

        it("tokenizes On keyword", () => {
            expect(tokenize("On")[0].type).toBe("ON");
        });

        it("tokenizes Inside/Outside", () => {
            expect(tokenize("Inside")[0].type).toBe("INSIDE");
            expect(tokenize("Outside")[0].type).toBe("OUTSIDE");
        });

        it("tokenizes Behind / In Front Of", () => {
            expect(tokenize("Behind")[0].type).toBe("BEHIND");
            const inFront = tokenize("In Front Of");
            expect(inFront).toHaveLength(1);
            expect(inFront[0].type).toBe("INFRONT");
        });

        it("tokenizes STEPS variants", () => {
            expect(tokenize("steps")[0].type).toBe("STEPS");
            expect(tokenize("step")[0].type).toBe("STEPS");
            expect(tokenize("stps")[0].type).toBe("STEPS");
            expect(tokenize("stp")[0].type).toBe("STEPS");
        });
    });

    describe("multi-word phrases", () => {
        it("tokenizes yd ln", () => {
            const t = tokenize("yd ln");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({ type: "YARDLINE", value: "yd ln" });
        });

        it("tokenizes yard line", () => {
            const t = tokenize("yard line");
            expect(t).toHaveLength(1);
            expect(t[0].type).toBe("YARDLINE");
        });

        it("tokenizes Front Hash", () => {
            const t = tokenize("Front Hash");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({ type: "HASH", value: "Front Hash" });
        });

        it("tokenizes Back Hash", () => {
            const t = tokenize("Back Hash");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({ type: "HASH", value: "Back Hash" });
        });

        it("tokenizes Front Sideline", () => {
            const t = tokenize("Front Sideline");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({
                type: "SIDELINE",
                value: "Front Sideline",
            });
        });

        it("tokenizes Back Side Line (3 words)", () => {
            const t = tokenize("Back Side Line");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({
                type: "SIDELINE",
                value: "Back Sideline",
            });
        });

        it("tokenizes Side 1 and Side 2", () => {
            expect(tokenize("Side 1")).toHaveLength(1);
            expect(tokenize("Side 1")[0]).toMatchObject({
                type: "SIDE",
                value: "1",
            });
            expect(tokenize("Side 2")[0]).toMatchObject({
                type: "SIDE",
                value: "2",
            });
        });

        it("tokenizes Side A and Side B", () => {
            expect(tokenize("Side A")[0]).toMatchObject({
                type: "SIDE",
                value: "1",
            });
            expect(tokenize("Side B")[0]).toMatchObject({
                type: "SIDE",
                value: "2",
            });
        });
    });

    describe("side synonyms", () => {
        it("tokenizes Left/Right as SIDE 1/2", () => {
            expect(tokenize("Left")[0]).toMatchObject({
                type: "SIDE",
                value: "1",
            });
            expect(tokenize("Right")[0]).toMatchObject({
                type: "SIDE",
                value: "2",
            });
        });

        it("tokenizes S1/S2 abbreviations", () => {
            expect(tokenize("S1")[0]).toMatchObject({
                type: "SIDE",
                value: "1",
            });
            expect(tokenize("S2")[0]).toMatchObject({
                type: "SIDE",
                value: "2",
            });
        });

        it("tokenizes Side1: (embedded number)", () => {
            expect(tokenize("Side1:")[0]).toMatchObject({
                type: "SIDE",
                value: "1",
            });
        });
    });

    describe("tags", () => {
        it("tokenizes (HS)", () => {
            const t = tokenize("(HS)");
            expect(t).toHaveLength(1);
            expect(t[0]).toMatchObject({ type: "TAG", value: "HS" });
        });

        it("tokenizes (College)", () => {
            const t = tokenize("(College)");
            expect(t[0]).toMatchObject({ type: "TAG", value: "CH" });
        });

        it("tokenizes (Pro)", () => {
            const t = tokenize("(Pro)");
            expect(t[0]).toMatchObject({ type: "TAG", value: "PH" });
        });
    });

    describe("noise handling", () => {
        it("marks punctuation as noise", () => {
            const t = tokenize(": , .");
            expect(t.every((tk) => tk.type === "NOISE")).toBe(true);
        });

        it("marks unknown words as noise", () => {
            const t = tokenize("banana");
            expect(t[0].type).toBe("NOISE");
        });

        it("meaningful() filters noise", () => {
            const all = tokenize("Side 1: 4.0 steps Inside 25 yd ln");
            const m = meaningful(all);
            expect(m.every((t) => t.type !== "NOISE")).toBe(true);
        });
    });

    describe("full coordinate strings", () => {
        it("tokenizes 'Side 1: 4.0 steps Inside 25 yd ln'", () => {
            const m = meaningful(tokenize("Side 1: 4.0 steps Inside 25 yd ln"));
            expect(types(m)).toEqual([
                "SIDE",
                "NUMBER",
                "STEPS",
                "INSIDE",
                "NUMBER",
                "YARDLINE",
            ]);
        });

        it("tokenizes 'On 50 yd ln'", () => {
            const m = meaningful(tokenize("On 50 yd ln"));
            expect(types(m)).toEqual(["ON", "NUMBER", "YARDLINE"]);
        });

        it("tokenizes '4.0 steps Behind Front Hash (HS)'", () => {
            const m = meaningful(tokenize("4.0 steps Behind Front Hash (HS)"));
            expect(types(m)).toEqual([
                "NUMBER",
                "STEPS",
                "BEHIND",
                "HASH",
                "TAG",
            ]);
        });

        it("tokenizes 'On Front Hash (HS)'", () => {
            const m = meaningful(tokenize("On Front Hash (HS)"));
            expect(types(m)).toEqual(["ON", "HASH", "TAG"]);
        });

        it("tokenizes '2.0 steps In Front Of Back Hash (HS)'", () => {
            const m = meaningful(
                tokenize("2.0 steps In Front Of Back Hash (HS)"),
            );
            expect(types(m)).toEqual([
                "NUMBER",
                "STEPS",
                "INFRONT",
                "HASH",
                "TAG",
            ]);
        });

        it("handles empty string", () => {
            expect(tokenize("")).toEqual([]);
            expect(tokenize("  ")).toEqual([]);
        });

        it("handles leading/trailing colons", () => {
            const m = meaningful(tokenize(": On 50 yd ln :"));
            expect(types(m)).toEqual(["ON", "NUMBER", "YARDLINE"]);
        });
    });
});
