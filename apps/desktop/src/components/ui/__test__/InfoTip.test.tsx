import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import InfoTip from "../InfoTip";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

const setMode = (preference: "touch" | "mouse") => {
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });
};

describe("InfoTip", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        cleanup();
        setMode("mouse");
        localStorage.clear();
    });

    it("gives the default button an accessible name", () => {
        setMode("mouse");
        render(<InfoTip content="Explained" />, { wrapper: Providers });
        expect(
            screen.getByRole("button", { name: "More info" }),
        ).toBeInTheDocument();
    });

    it("with a mouse, a click does not open it (hover/focus does)", () => {
        setMode("mouse");
        render(<InfoTip content="Explained" label="About this" />, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "About this" });
        expect(button).not.toHaveAttribute("aria-haspopup");
        fireEvent.click(button);
        expect(screen.queryByTestId("info-tip-content")).toBeNull();
    });

    it("in touch mode, a tap opens it and another tap closes it", () => {
        setMode("touch");
        render(<InfoTip content="Explained" label="About this" />, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "About this" });
        expect(button).toHaveAttribute("aria-haspopup", "dialog");

        fireEvent.click(button);
        expect(screen.getByTestId("info-tip-content")).toHaveTextContent(
            "Explained",
        );
        expect(button).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(button);
        expect(screen.queryByTestId("info-tip-content")).toBeNull();
    });

    it("switches from tooltip to popover when the mode changes", () => {
        setMode("mouse");
        render(<InfoTip content="Explained" label="About this" />, {
            wrapper: Providers,
        });
        expect(
            screen.getByRole("button", { name: "About this" }),
        ).not.toHaveAttribute("aria-haspopup");
        setMode("touch");
        expect(
            screen.getByRole("button", { name: "About this" }),
        ).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("uses a custom trigger", () => {
        setMode("touch");
        render(
            <InfoTip content="Too far">
                <button type="button" aria-label="Warning" />
            </InfoTip>,
            { wrapper: Providers },
        );
        fireEvent.click(screen.getByRole("button", { name: "Warning" }));
        expect(screen.getByTestId("info-tip-content")).toHaveTextContent(
            "Too far",
        );
    });
});
