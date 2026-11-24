import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScrubNumber } from "../ScrubNumber";

/**
 * A number opened for typing and left as it opened applies nothing when it closes, so a − or +
 * pressed meanwhile isn't undone by the old number (simulated users on #1190: a copies count went
 * back to 1 when its box lost focus)
 */

afterEach(cleanup);

function number(display: string, onType: (text: string) => boolean) {
    return (
        <ScrubNumber
            display={display}
            axis="x"
            label="Copies to the right"
            testId="n"
            onScrubStart={() => {}}
            onScrub={() => {}}
            onScrubEnd={() => {}}
            onType={onType}
        />
    );
}

describe("a number opened for typing", () => {
    it("applies nothing when it closes untouched, though the number changed meanwhile", () => {
        const onType = vi.fn(() => true);
        const { rerender } = render(number("1", onType));
        fireEvent.click(screen.getByTestId("n"));
        const input = screen.getByTestId("n-input");
        // The + beside it made it 2 while it was open
        rerender(number("2", onType));
        fireEvent.blur(input);
        expect(onType).not.toHaveBeenCalled();
        expect(screen.queryByTestId("n-input")).toBeNull();
    });

    it("applies what was typed", () => {
        const onType = vi.fn(() => true);
        render(number("1", onType));
        fireEvent.click(screen.getByTestId("n"));
        const input = screen.getByTestId("n-input");
        fireEvent.change(input, { target: { value: "3" } });
        fireEvent.blur(input);
        expect(onType).toHaveBeenCalledWith("3");
    });
});
