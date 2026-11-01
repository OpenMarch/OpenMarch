import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Keycaps from "../Keycaps";

describe("Keycaps", () => {
    it("renders one cap per key", () => {
        render(<Keycaps keys={["⌘", "⇧", "Z"]} />);
        expect(screen.getAllByText(/^(⌘|⇧|Z)$/)).toHaveLength(3);
    });

    it("joins the caps with a + inside one shortcut", () => {
        const { container } = render(<Keycaps keys={["Ctrl", "-"]} />);
        const shortcut = container.querySelector(".keycaps");
        expect(shortcut?.textContent).toBe("Ctrl+-");
        expect(shortcut?.querySelectorAll(".keycap")).toHaveLength(2);
    });

    it("writes no + for a single key", () => {
        const { container } = render(<Keycaps keys={["Esc"]} />);
        expect(container.textContent).toBe("Esc");
    });
});
