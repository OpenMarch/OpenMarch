import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { useTapToDismiss } from "../Toaster";

describe("useTapToDismiss (touch toasts)", () => {
    let toastEl: HTMLElement;
    let button: HTMLButtonElement;
    let dismiss: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // A toast with an action button; jsdom lays everything out at 0,0,
        // so a press at 0,0 counts as on the toast
        toastEl = document.createElement("li");
        toastEl.setAttribute("data-sonner-toast", "");
        button = document.createElement("button");
        button.textContent = "Undo";
        toastEl.appendChild(button);
        document.body.appendChild(toastEl);
        dismiss = vi.spyOn(toast, "dismiss");
        renderHook(() => useTapToDismiss(true));
    });

    afterEach(() => {
        cleanup();
        toastEl.remove();
        dismiss.mockRestore();
    });

    it("doesn't dismiss on press, so a long press on a button keeps its click", () => {
        fireEvent.pointerDown(button, { clientX: 0, clientY: 0 });
        fireEvent.pointerDown(document.body, { clientX: 0, clientY: 0 });
        expect(dismiss).not.toHaveBeenCalled();
    });

    it("leaves a click on the toast's own button to the button", () => {
        fireEvent.click(button, { clientX: 0, clientY: 0 });
        expect(dismiss).not.toHaveBeenCalled();
    });

    it("dismisses on a tap (click) elsewhere on the toast", () => {
        fireEvent.click(document.body, { clientX: 0, clientY: 0 });
        expect(dismiss).toHaveBeenCalled();
    });

    it("does nothing when off", () => {
        cleanup();
        renderHook(() => useTapToDismiss(false));
        fireEvent.click(document.body, { clientX: 0, clientY: 0 });
        expect(dismiss).not.toHaveBeenCalled();
    });
});
