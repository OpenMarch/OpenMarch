import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tip, TIP_MAX_WIDTH } from "../Tip";

afterEach(cleanup);

describe("a control's tooltip (Tip)", () => {
    it("wraps instead of running across the field: capped at a width, not the window's 80% (owner, 2026-11-17)", async () => {
        render(
            <Tip
                label="Edit path"
                hint="Drag its points, or its head to draw on"
            >
                <button type="button">Edit path</button>
            </Tip>,
        );
        await userEvent.hover(screen.getByRole("button"));
        const tip = await screen.findByRole("tooltip");
        expect(tip.textContent).toContain("Drag its points");
        // Radix puts the role on a hidden copy; the box drawn is its parent
        const box = tip.closest("[data-side]") ?? tip.parentElement!;
        expect(box.className).toContain(TIP_MAX_WIDTH);
        expect(box.className).not.toContain("max-w-[80vw]");
    });
});
