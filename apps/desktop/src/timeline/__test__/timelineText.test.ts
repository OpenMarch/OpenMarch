import { describe, expect, it, vi } from "vitest";
import {
    isTimelineText,
    joinListIn,
    resolveTimelineText,
    text,
    textList,
} from "../timelineText";

describe("timeline text: keys and arguments, translated when shown", () => {
    it("builds a key with its arguments, and translates nothing", () => {
        expect(text.t("timeline.where.theseCounts")).toEqual({
            key: "timeline.where.theseCounts",
        });
        expect(text.t("timeline.where.page", { page: "2" })).toEqual({
            key: "timeline.where.page",
            params: { page: "2" },
        });
        expect(isTimelineText(text.t("timeline.where.home"))).toBe(true);
        expect(isTimelineText("home")).toBe(false);
    });

    it("translates nested pieces first, then the text, keeping numbers as numbers", () => {
        const translate = vi.fn(
            (key: string, params: Record<string, string | number>) =>
                `${key}(${Object.entries(params)
                    .map(([k, v]) => `${k}=${typeof v}:${v}`)
                    .join(",")})`,
        );
        const value = text.t("outer", {
            count: 3,
            move: text.t("inner", { page: "2" }),
            names: textList(["A", text.t("more", { count: 4 })]),
        });
        expect(resolveTimelineText(value, translate, "en")).toBe(
            "outer(count=number:3,move=string:inner(page=string:2),names=string:A and more(count=number:4))",
        );
    });

    it("joins a list the way the language does", () => {
        expect(joinListIn([], "en")).toBe("");
        expect(joinListIn(["A"], "en")).toBe("A");
        expect(joinListIn(["A", "B"], "en")).toBe("A and B");
        // The app's English has no comma before "and"
        expect(joinListIn(["A", "B", "C"], "en")).toBe("A, B and C");
        expect(joinListIn(["A", "B", "C"], "es")).toBe("A, B y C");
        expect(joinListIn(["A", "B", "C"], "fr")).toBe("A, B et C");
    });
});
