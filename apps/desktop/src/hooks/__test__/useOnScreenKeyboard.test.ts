import { describe, expect, it } from "vitest";
import { isHidden, isTextEntry, visibleBand } from "../useOnScreenKeyboard";

describe("isTextEntry", () => {
    const make = (html: string) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        return wrap.firstElementChild;
    };
    it("counts text fields and text areas", () => {
        expect(isTextEntry(make(`<input type="text">`))).toBe(true);
        expect(isTextEntry(make(`<input type="number">`))).toBe(true);
        expect(isTextEntry(make(`<input>`))).toBe(true);
        expect(isTextEntry(make(`<textarea></textarea>`))).toBe(true);
    });
    it("skips buttons, toggles, read-only and disabled fields", () => {
        expect(isTextEntry(make(`<input type="checkbox">`))).toBe(false);
        expect(isTextEntry(make(`<input type="range">`))).toBe(false);
        expect(isTextEntry(make(`<input readonly>`))).toBe(false);
        expect(isTextEntry(make(`<input disabled>`))).toBe(false);
        expect(isTextEntry(make(`<textarea readonly></textarea>`))).toBe(false);
        expect(isTextEntry(make(`<button>Go</button>`))).toBe(false);
        expect(isTextEntry(null)).toBe(false);
    });
});

describe("visibleBand and isHidden", () => {
    it("uses the visual viewport when the keyboard shrinks it", () => {
        const band = visibleBand({ offsetTop: 0, height: 700 }, null);
        expect(band).toEqual({ top: 0, bottom: 700 });
        expect(isHidden({ top: 900, bottom: 930 }, band)).toBe(true);
        expect(isHidden({ top: 300, bottom: 330 }, band)).toBe(false);
    });
    it("cuts off at an overlaying keyboard", () => {
        const band = visibleBand({ offsetTop: 0, height: 1180 }, 800);
        expect(band.bottom).toBe(800);
        expect(isHidden({ top: 790, bottom: 820 }, band)).toBe(true);
    });
    it("follows a panned visual viewport", () => {
        const band = visibleBand({ offsetTop: 200, height: 600 }, null);
        expect(isHidden({ top: 100, bottom: 130 }, band)).toBe(true);
    });
});
