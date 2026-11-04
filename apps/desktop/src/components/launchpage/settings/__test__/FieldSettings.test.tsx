import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import {
    UI_SETTINGS_STORAGE_KEY,
    useUiSettingsStore,
} from "@/stores/UiSettingsStore";
import FieldSettings from "../FieldSettings";

const initial = useUiSettingsStore.getState().uiSettings;

beforeEach(() => useUiSettingsStore.setState({ uiSettings: initial }));
afterEach(() => localStorage.clear());

const renderSettings = async () => {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="loading">
            <FieldSettings />
        </TolgeeProvider>,
    );
    await screen.findByRole("switch", { name: "Grid lines" });
};

const settings = () => useUiSettingsStore.getState().uiSettings;

describe("FieldSettings", () => {
    it("shows the stored values, defaulting like the View tab did", async () => {
        await renderSettings();
        expect(
            screen.getByRole("switch", { name: "Grid lines" }),
        ).toBeChecked();
        expect(
            screen.getByRole("switch", { name: "Half lines" }),
        ).toBeChecked();
        expect(
            screen.getByRole("switch", { name: "Step size warnings" }),
        ).not.toBeChecked();
        expect(screen.getByRole("radio", { name: "Normal" })).toBeChecked();
        expect(
            screen.getByRole("radio", { name: "Above the dot" }),
        ).toBeChecked();
        expect(
            screen.queryByRole("radio", { name: "Fade the rest" }),
        ).toBeNull();
    });

    it("saves each toggle to the UI settings", async () => {
        await renderSettings();
        const user = userEvent.setup();
        await user.click(screen.getByRole("switch", { name: "Grid lines" }));
        await user.click(screen.getByRole("switch", { name: "Half lines" }));
        await user.click(
            screen.getByRole("switch", { name: "Step size warnings" }),
        );
        expect(settings()).toMatchObject({
            gridLines: false,
            halfLines: false,
            stepSizeWarnings: true,
        });
        expect(
            JSON.parse(localStorage.getItem(UI_SETTINGS_STORAGE_KEY)!),
        ).toMatchObject({ gridLines: false });
    });

    it("saves label size and label position", async () => {
        await renderSettings();
        const user = userEvent.setup();
        await user.click(screen.getByRole("radio", { name: "Large" }));
        await user.click(screen.getByRole("radio", { name: "Beside the dot" }));
        expect(settings()).toMatchObject({
            marcherLabelSize: "large",
            marcherLabelPosition: "beside",
        });
    });

    it("shows a change made elsewhere, such as the main window", async () => {
        await renderSettings();
        useUiSettingsStore.setState({
            uiSettings: { ...settings(), gridLines: false },
        });
        expect(
            await screen.findByRole("switch", { name: "Grid lines" }),
        ).not.toBeChecked();
    });
});
