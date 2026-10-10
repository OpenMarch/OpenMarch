import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";
import { editSurpriseToastId } from "@/utilities/moveThemToo";
import Toaster from "../Toaster";

/**
 * A toast's action stays on one line beside its text (defined-coordinates 08: "Start from Page 4"
 * wrapped into a column). With two buttons the text takes the first line and the buttons go
 * underneath, right-aligned (wp14: the combined Move them too toast squeezed its text into a
 * 70 px column). jsdom doesn't lay out, so these check the classes that do it.
 */

/** Classes of the toast (`li`) a button is in, and of its text */
const toastOf = (button: HTMLElement) => {
    const li = button.closest("[data-sonner-toast]") as HTMLElement;
    const content = li.querySelector("[data-content]") as HTMLElement;
    return { li, content };
};

afterEach(() => {
    toast.dismiss();
    cleanup();
});

describe("Toaster", () => {
    it("keeps an action's label on one line, with a focus ring", async () => {
        render(<Toaster />);
        act(() => {
            toast.info("Pages 3–4 are no longer stops", {
                action: { label: "Keep Pages 3–4 as stops", onClick: () => {} },
            });
        });
        const button = await screen.findByRole("button", {
            name: "Keep Pages 3–4 as stops",
        });
        expect(button.className).toMatch(/\bwhitespace-nowrap\b/);
        expect(button.className).toMatch(/\bshrink-0\b/);
        expect(button.className).toMatch(/focus-visible:ring/);
    });

    it("with one button, keeps it beside the text on one row", async () => {
        render(<Toaster />);
        act(() => {
            toast.info("Page 3 is no longer a stop", {
                action: { label: "Keep Page 3 as a stop", onClick: () => {} },
            });
        });
        const button = await screen.findByRole("button", {
            name: "Keep Page 3 as a stop",
        });
        const { li, content } = toastOf(button);
        expect(li.querySelector("[data-cancel]")).toBeNull();
        // The two-button layout only applies with a cancel
        expect(li.className).toContain("[&:has([data-cancel])]:flex-wrap");
        expect(li.className).not.toMatch(/(^| )flex-wrap( |$)/);
        expect(content.className).toMatch(/(^| )flex-1( |$)/);
        expect(button.className).not.toMatch(/\bml-auto\b/);
    });

    it("with two buttons, wraps them onto their own row under the text, right-aligned", async () => {
        render(<Toaster />);
        act(() => {
            toast.info("OT1 and OT8 kept their spot", {
                action: { label: "Move them too", onClick: () => {} },
                cancel: { label: "Only Page 2", onClick: () => {} },
            });
        });
        const action = await screen.findByRole("button", {
            name: "Move them too",
        });
        const cancel = await screen.findByRole("button", {
            name: "Only Page 2",
        });
        expect(cancel.parentElement).toBe(action.parentElement);
        const { li, content } = toastOf(action);
        expect(li.matches(":has([data-cancel])")).toBe(true);
        expect(li.className).toContain("[&:has([data-cancel])]:flex-wrap");
        // The text fills the first row beside the icon, so the buttons wrap below it
        expect(li.querySelector("[data-icon]")).not.toBeNull();
        expect(content.className).toContain(
            "[[data-sonner-toast]:has([data-cancel])_&]:basis-[calc(100%-40px)]",
        );
        // Cancel comes first and pushes both buttons right
        expect(
            cancel.compareDocumentPosition(action) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(cancel.className).toMatch(/\bml-auto\b/);
        for (const button of [action, cancel]) {
            expect(button.className).toMatch(/\bwhitespace-nowrap\b/);
            expect(button.className).toMatch(/\bshrink-0\b/);
        }
    });

    it("an edit toast replaces the one before, and keeps none of its buttons or icon", async () => {
        render(<Toaster />);
        const first = editSurpriseToastId();
        act(() => {
            toast.info("OT1 and OT8 kept their spot", {
                id: first,
                action: { label: "Move them too", onClick: () => {} },
                cancel: { label: "Only Page 2", onClick: () => {} },
            });
        });
        await screen.findByRole("button", { name: "Move them too" });
        const second = editSurpriseToastId();
        expect(second).not.toBe(first);
        act(() => {
            toast.message("Pages 3–4 followed (they were copies)", {
                id: second,
                action: { label: "Only Page 3", onClick: () => {} },
            });
        });
        const action = await screen.findByRole("button", {
            name: "Only Page 3",
        });
        const { li } = toastOf(action);
        expect(li.querySelectorAll("button[data-button]")).toHaveLength(1);
        expect(li.querySelector("[data-cancel]")).toBeNull();
        // A plain message has no icon, though the toast before was an info
        expect(li.querySelector("[data-icon]")).toBeNull();
        expect(li.getAttribute("data-type")).not.toBe("info");
        // The earlier toast goes rather than stacking
        await waitFor(() =>
            expect(
                screen.queryByRole("button", { name: "Move them too" }),
            ).toBeNull(),
        );
    });
});
