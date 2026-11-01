import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useTouchModifierStore } from "@/stores/TouchModifierStore";
import ChipSelector from "../ChipSelector";

/** The Select tab adds with Shift, or with the touch pill's Add, which stands in for it */

function renderChips(
    onSelect: (item: string, o: { shiftKey: boolean }) => void,
) {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="loading">
            <ChipSelector
                items={["Trumpet", "Tuba"]}
                getId={(item) => item}
                getLabel={(item) => item}
                getSearchText={(item) => item}
                onSelect={onSelect}
                ariaLabel="Sections"
            />
        </TolgeeProvider>,
    );
}

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    useTouchModifierStore.getState().clear();
});

describe("ChipSelector and Add", () => {
    it("a chip click replaces, with Shift or with Add on the pill it adds", () => {
        const onSelect = vi.fn();
        renderChips(onSelect);
        fireEvent.click(screen.getByText("Tuba"));
        expect(onSelect).toHaveBeenLastCalledWith("Tuba", { shiftKey: false });
        fireEvent.click(screen.getByText("Tuba"), { shiftKey: true });
        expect(onSelect).toHaveBeenLastCalledWith("Tuba", { shiftKey: true });
        useTouchModifierStore.getState().toggleLatched("add");
        fireEvent.click(screen.getByText("Trumpet"));
        expect(onSelect).toHaveBeenLastCalledWith("Trumpet", {
            shiftKey: true,
        });
    });

    it("a role toggle on the pill doesn't add", () => {
        const onSelect = vi.fn();
        renderChips(onSelect);
        useTouchModifierStore.getState().toggleLatched("fine");
        fireEvent.click(screen.getByText("Tuba"));
        expect(onSelect).toHaveBeenLastCalledWith("Tuba", { shiftKey: false });
    });
});
