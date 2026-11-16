import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Toaster, { LAB_FEEDBACK_CLEARANCE } from "../Toaster";

vi.mock("@/utilities/webBuild", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utilities/webBuild")>()),
    webChannel: "lab",
}));

afterEach(() => {
    toast.dismiss();
    cleanup();
});

describe("Toaster in a lab build", () => {
    it("starts above the lab's feedback buttons in the bottom-right corner, on any window width", async () => {
        render(<Toaster />);
        act(() => {
            toast.info("Now walks straight through the end of Page 3");
        });
        const list = (
            await screen.findByText(
                "Now walks straight through the end of Page 3",
            )
        ).closest("[data-sonner-toaster]") as HTMLElement;
        expect(list.dataset.yPosition).toBe("bottom");
        expect(list.dataset.xPosition).toBe("right");
        // The feedback buttons: 20px from the bottom, 48px tall, then a 12px gap
        expect(LAB_FEEDBACK_CLEARANCE).toBe(80);
        for (const prefix of ["--offset", "--mobile-offset"]) {
            expect(list.style.getPropertyValue(`${prefix}-bottom`)).toBe(
                "80px",
            );
            expect(list.style.getPropertyValue(`${prefix}-right`)).toBe("12px");
        }
    });
});
