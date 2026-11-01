import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import { InspectorCollapsible } from "../InspectorCollapsible";
import { useCompactInspector } from "../useCompactInspector";

describe("compact Inspector", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        act(() => {
            useInputModeStore.getState().setPreference("auto");
        });
        localStorage.clear();
    });

    it("is only for the touch layout, never the mouse layout", () => {
        act(() => {
            useInputModeStore.getState().setPreference("mouse");
        });
        expect(renderHook(() => useCompactInspector()).result.current).toBe(
            false,
        );
        act(() => {
            useInputModeStore.getState().setPreference("touch");
        });
        expect(renderHook(() => useCompactInspector()).result.current).toBe(
            true,
        );
    });

    it("keeps typed input while folded when keepMounted", () => {
        const Section = ({ open }: { open: boolean }) => (
            <TolgeeProvider tolgee={tolgee} fallback="">
                <InspectorCollapsible title="Page" open={open} keepMounted>
                    <input aria-label="Counts" />
                </InspectorCollapsible>
            </TolgeeProvider>
        );
        const { rerender } = render(<Section open />);
        fireEvent.change(screen.getByLabelText("Counts"), {
            target: { value: "12" },
        });
        rerender(<Section open={false} />);
        rerender(<Section open />);
        expect(screen.getByLabelText<HTMLInputElement>("Counts").value).toBe(
            "12",
        );
    });
});
