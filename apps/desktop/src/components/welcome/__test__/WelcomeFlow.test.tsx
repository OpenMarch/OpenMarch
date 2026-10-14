import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import WelcomeFlow from "../WelcomeFlow";

/** Stands in for the preload's settings bridge (the IPC boundary). */
function stubElectron(optOutAnalytics: unknown) {
    const electron = {
        invoke: vi.fn(async (_channel: string, key: string) =>
            key === "optOutAnalytics" ? optOutAnalytics : undefined,
        ),
        send: vi.fn(),
    };
    Object.assign(window, { electron });
    return electron;
}

function renderFlow() {
    const onFinish = vi.fn();
    const reload = vi.fn();
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <WelcomeFlow open onFinish={onFinish} reload={reload} />
        </TolgeeProvider>,
    );
    return { onFinish, reload };
}

const continueButton = () => screen.getByTestId("welcome-continue");

beforeEach(() => {
    useEditorModeStore.setState({ mode: null, loaded: true });
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("WelcomeFlow", () => {
    it("needs a mode before Continue, then asks about analytics", async () => {
        const electron = stubElectron(undefined);
        const { onFinish, reload } = renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        const basic = await screen.findByTestId("editor-mode-card-basic");
        expect(basic).toHaveAttribute("aria-checked", "false");
        expect(screen.getByTestId("editor-mode-card-expert")).toHaveAttribute(
            "aria-checked",
            "false",
        );
        expect(continueButton()).toBeDisabled();

        fireEvent.click(basic);
        expect(basic).toHaveAttribute("aria-checked", "true");
        expect(continueButton()).toBeEnabled();
        fireEvent.click(continueButton());

        fireEvent.click(await screen.findByTestId("welcome-analytics-opt-out"));
        expect(useEditorModeStore.getState().mode).toBe("basic");
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            editorMode: "basic",
        });
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            optOutAnalytics: true,
        });
        expect(onFinish).toHaveBeenCalledWith({ willReload: true });
        expect(reload).toHaveBeenCalled();
    });

    it("skips the analytics step when it was already answered", async () => {
        const electron = stubElectron(false);
        const { onFinish, reload } = renderFlow();
        await waitFor(() => expect(electron.invoke).toHaveBeenCalled());

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        fireEvent.click(await screen.findByTestId("editor-mode-card-expert"));
        await waitFor(() => expect(continueButton()).toBeEnabled());
        fireEvent.click(continueButton());

        expect(screen.queryByTestId("welcome-analytics-opt-in")).toBeNull();
        expect(useEditorModeStore.getState().mode).toBe("expert");
        expect(electron.send).toHaveBeenCalledTimes(1);
        expect(onFinish).toHaveBeenCalledWith({ willReload: false });
        expect(reload).not.toHaveBeenCalled();
    });
});
