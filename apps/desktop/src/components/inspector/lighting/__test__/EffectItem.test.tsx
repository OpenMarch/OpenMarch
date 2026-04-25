import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EffectItem from "../EffectItem";

vi.mock("@tolgee/react", () => ({
    T: ({ defaultValue }: { defaultValue: string }) => <>{defaultValue}</>,
    useTolgee: () => ({
        t: () => undefined,
    }),
}));

vi.mock("@/components/ui/ColorPicker", () => ({
    default: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("EffectItem type selector", () => {
    it("keeps fade/strobe visible but disabled", () => {
        const typeChangeFn = vi.fn();

        render(
            <EffectItem
                effectId={7}
                name=""
                type="solid"
                args={JSON.stringify({ durationMs: 1000, color: "#112233" })}
                nameChangeFn={vi.fn()}
                typeChangeFn={typeChangeFn}
                argsChangeFn={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Effect type" }));

        const fadeOption = screen.getByText("Fade").closest("[role='option']");
        const strobeOption = screen
            .getByText("Strobe")
            .closest("[role='option']");

        expect(fadeOption?.getAttribute("data-disabled")).not.toBeNull();
        expect(strobeOption?.getAttribute("data-disabled")).not.toBeNull();

        fireEvent.click(screen.getByText("Fade"));
        fireEvent.click(screen.getByText("Strobe"));
        expect(typeChangeFn).not.toHaveBeenCalled();
    });
});
