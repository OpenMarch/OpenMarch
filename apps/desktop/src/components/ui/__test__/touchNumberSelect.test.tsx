import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Input, UnitInput } from "@openmarch/ui";

const setLayout = (mode: "touch" | "pointer") => {
    document.documentElement.dataset.input = mode;
};

describe("number fields in touch mode", () => {
    afterEach(() => {
        cleanup();
        setLayout("pointer");
    });

    it("select their whole value on focus, so typing replaces it", () => {
        setLayout("touch");
        render(
            <UnitInput
                aria-label="Counts"
                unit="counts"
                type="text"
                inputMode="numeric"
                defaultValue="16"
            />,
        );
        const input = screen.getByLabelText<HTMLInputElement>("Counts");
        input.focus();
        fireEvent.focus(input);
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe(2);
    });

    it("leave the caret alone with a mouse and in text fields", () => {
        setLayout("pointer");
        render(
            <Input aria-label="Tempo" inputMode="numeric" defaultValue="120" />,
        );
        const tempo = screen.getByLabelText<HTMLInputElement>("Tempo");
        tempo.setSelectionRange(3, 3);
        fireEvent.focus(tempo);
        expect(tempo.selectionStart).toBe(3);

        setLayout("touch");
        render(<Input aria-label="Name" defaultValue="Alex" />);
        const name = screen.getByLabelText<HTMLInputElement>("Name");
        name.setSelectionRange(4, 4);
        fireEvent.focus(name);
        expect(name.selectionStart).toBe(4);
    });
});
