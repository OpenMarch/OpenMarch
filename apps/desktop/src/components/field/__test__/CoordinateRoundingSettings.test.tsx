import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { defaultSettings, useUiSettingsStore } from "@/stores/UiSettingsStore";
import CoordinateRoundingSettings from "../CoordinateRoundingSettings";

afterEach(() => {
    localStorage.clear();
    useUiSettingsStore.getState().setUiSettings(defaultSettings);
});

describe("CoordinateRoundingSettings", () => {
    it("clears both reference points when the offset is turned off", async () => {
        localStorage.setItem("coordinateRounding.offsetEnabled", "false");
        useUiSettingsStore.getState().setUiSettings({
            ...defaultSettings,
            coordinateRounding: {
                ...defaultSettings.coordinateRounding,
                referencePointX: 3,
                referencePointY: 2,
            },
        });

        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <CoordinateRoundingSettings />
            </TolgeeProvider>,
        );

        // Cleared rather than 0, so Y rounding falls back to the drawn grid lines
        await waitFor(() => {
            const { coordinateRounding } =
                useUiSettingsStore.getState().uiSettings;
            expect(coordinateRounding?.referencePointX).toBeUndefined();
            expect(coordinateRounding?.referencePointY).toBeUndefined();
        });
    });
});
