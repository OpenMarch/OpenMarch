import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLICK_FOCUS_ATTRIBUTE, installClickFocusMarker } from "../clickFocus";

describe("installClickFocusMarker", () => {
    let uninstall: () => void;
    let keyboardFocus: boolean;
    let first: HTMLButtonElement;
    let second: HTMLButtonElement;
    const marked = (element: Element) =>
        element.hasAttribute(CLICK_FOCUS_ATTRIBUTE);
    const press = (key: string) =>
        document.activeElement!.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
        );

    beforeEach(() => {
        vi.useFakeTimers();
        keyboardFocus = false;
        // jsdom has no focus modality, so the test says where focus came from
        const matches = Element.prototype.matches;
        vi.spyOn(Element.prototype, "matches").mockImplementation(function (
            this: Element,
            selector: string,
        ) {
            if (selector === ":focus-visible") return keyboardFocus;
            return matches.call(this, selector);
        });
        // jsdom's window never has focus; the app's does
        vi.spyOn(document, "hasFocus").mockReturnValue(true);
        first = document.createElement("button");
        second = document.createElement("button");
        document.body.append(first, second);
        uninstall = installClickFocusMarker();
    });

    afterEach(() => {
        uninstall();
        first.remove();
        second.remove();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("marks focus that came from a click, and keeps focus there", () => {
        first.focus();
        expect(marked(first)).toBe(true);
        expect(document.activeElement).toBe(first);
    });

    it("leaves focus that came from the keyboard unmarked", () => {
        keyboardFocus = true;
        first.focus();
        expect(marked(first)).toBe(false);
    });

    it("moves the mark with focus", () => {
        first.focus();
        keyboardFocus = true;
        second.focus();
        expect(marked(first)).toBe(false);
        expect(marked(second)).toBe(false);
    });

    it("keeps the mark for a shortcut that reaches the window", () => {
        first.focus();
        press(" ");
        vi.runAllTimers();
        expect(marked(first)).toBe(true);
    });

    it("drops the mark for a key the control keeps", () => {
        first.focus();
        first.addEventListener("keydown", (event) => event.stopPropagation());
        press("ArrowRight");
        vi.runAllTimers();
        expect(marked(first)).toBe(false);
    });

    it("drops the mark for Enter and Tab", () => {
        first.focus();
        press("Enter");
        expect(marked(first)).toBe(false);
        keyboardFocus = false;
        second.focus();
        press("Tab");
        expect(marked(second)).toBe(false);
    });

    it("keeps the mark when focus leaves with the window and comes back", () => {
        first.focus();
        vi.mocked(document.hasFocus).mockReturnValue(false);
        first.blur();
        vi.runAllTimers();
        vi.mocked(document.hasFocus).mockReturnValue(true);
        keyboardFocus = true;
        first.focus();
        expect(marked(first)).toBe(true);
    });

    it("drops the mark when focus goes to the page, so Tab back rings", () => {
        first.focus();
        first.blur();
        vi.runAllTimers();
        expect(marked(first)).toBe(false);
        keyboardFocus = true;
        first.focus();
        expect(marked(first)).toBe(false);
    });

    it("never marks a control whose keys act on it natively", () => {
        second.setAttribute("role", "switch");
        second.focus();
        expect(marked(second)).toBe(false);
    });

    it("decides on the first press of a held key", () => {
        first.focus();
        first.addEventListener("keydown", (event) => event.stopPropagation());
        first.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: " ",
                repeat: true,
                bubbles: true,
            }),
        );
        vi.runAllTimers();
        expect(marked(first)).toBe(true);
    });

    it("stops marking once uninstalled", () => {
        first.focus();
        uninstall();
        expect(marked(first)).toBe(false);
        second.focus();
        expect(marked(second)).toBe(false);
        uninstall = () => {};
    });
});
