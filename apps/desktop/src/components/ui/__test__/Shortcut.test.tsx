import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Shortcut from "../Shortcut";

/** What a sighted person sees, and what a screen reader hears */
const read = (container: HTMLElement) => ({
    shown: container.querySelector(".shortcut-keys")?.textContent,
    spoken: container.querySelector(".sr-only")?.textContent,
});

describe("Shortcut", () => {
    it("writes a Mac shortcut as macOS does: symbols in order, run together", () => {
        const { container } = render(<Shortcut binding="$mod+Shift+Z" isMac />);
        expect(read(container)).toEqual({
            shown: "⇧⌘Z",
            spoken: "Shift Command Z",
        });
        expect(container.querySelectorAll(".shortcut-key")).toHaveLength(3);
        expect(container.querySelector(".shortcut-plus")).toBeNull();
    });

    it("joins keys with + elsewhere, the + its own (lighter) element", () => {
        const { container } = render(
            <Shortcut binding="$mod+Shift+Z" isMac={false} />,
        );
        expect(read(container)).toEqual({
            shown: "Ctrl+Shift+Z",
            spoken: "Control Shift Z",
        });
        expect(container.querySelectorAll(".shortcut-plus")).toHaveLength(2);
    });

    it("is one cap, in the size asked for", () => {
        const { container } = render(
            <Shortcut binding="Escape" size="md" isMac={false} />,
        );
        const caps = container.querySelectorAll(".shortcut");
        expect(caps).toHaveLength(1);
        expect(caps[0]).toHaveClass("shortcut-md");
        expect(read(container).shown).toBe("Esc");
    });

    it("shows display keys as given", () => {
        const { container } = render(<Shortcut keys={["1–9"]} />);
        expect(read(container).shown).toBe("1–9");
    });

    it("ends with a gesture as a word, not a key", () => {
        const mac = render(<Shortcut binding="Shift + Drag" isMac />);
        expect(mac.container.querySelector(".shortcut-gesture")).not.toBeNull();
        expect(mac.container.querySelectorAll(".shortcut-key")).toHaveLength(1);
        const other = render(<Shortcut binding="Mod+scroll" isMac={false} />);
        expect(
            other.container.querySelector(".shortcut-key")?.textContent,
        ).toBe("Ctrl");
    });

    it("shows an action's own binding, and nothing for an unbound one", () => {
        const bound = render(<Shortcut action="performUndo" isMac />);
        expect(read(bound.container).shown).toBe("⌘Z");
    });
});

describe("Shortcut for screen readers", () => {
    it("names a punctuation key in words, as voices may skip it", () => {
        const { container } = render(<Shortcut binding="BracketRight" />);
        expect(read(container)).toEqual({
            shown: "]",
            spoken: "Right Bracket",
        });
    });
});
