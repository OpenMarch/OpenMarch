import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paintCreditsCard } from "../environment/signage";

/** A 2D context that records the text it draws. */
function textRecorder() {
    const drawn: string[] = [];
    const gradient = { addColorStop: () => {} };
    const target: Record<string, unknown> = {
        font: "10px sans-serif",
        measureText: (text: string) => ({
            width:
                text.length *
                0.6 *
                parseFloat(/([\d.]+)px/.exec(String(target.font))?.[1] ?? "10"),
        }),
        createLinearGradient: () => gradient,
        fillText: (text: string) => drawn.push(text),
    };
    const g = new Proxy(target, {
        get(obj, key: string) {
            if (key in obj) return obj[key];
            return () => undefined;
        },
        set(obj, key: string, value) {
            obj[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { g, drawn };
}

describe("paintCreditsCard", () => {
    // The logo is painted with Path2D, which the test DOM lacks.
    const holder = globalThis as { Path2D?: unknown };
    const original = holder.Path2D;
    beforeAll(() => {
        holder.Path2D = class {};
    });
    afterAll(() => {
        holder.Path2D = original;
    });

    it("draws the window's translated words", () => {
        const { g, drawn } = textRecorder();
        paintCreditsCard(g, 1024, 512, {
            title: "",
            designer: "Sam",
            client: "CHS",
            text: {
                heading: "On the field",
                untitled: "Nameless show",
                designer: "Drill by Sam",
                client: "Band: CHS",
            },
        });
        expect(drawn).toEqual([
            "ON THE FIELD",
            "Nameless show",
            "Drill by Sam",
            "Band: CHS",
        ]);
    });

    it("falls back to English without translations", () => {
        const { g, drawn } = textRecorder();
        paintCreditsCard(g, 1024, 512, { title: "Fall", designer: "Sam" });
        expect(drawn).toEqual(["NOW PERFORMING", "Fall", "Designed by Sam"]);
    });
});
