import Canvas from "../Canvas";
import { render, waitFor } from "@testing-library/react";
import { describeDbTests } from "@/test/base";
import { expect } from "vitest";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";

const createCanvas = () =>
    new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });

describeDbTests("Canvas", (it) => {
    it("renders", async ({ wrapper, db, marchers }) => {
        const canvas = createCanvas();
        expect(canvas.getCanvasMarchers()).toHaveLength(0);
        const screen = render(<Canvas testCanvas={canvas} />, { wrapper });

        // Wait for the timingObjects query to load and the canvas element to appear
        await waitFor(() => {
            expect(screen.getByTestId("fieldCanvas")).toBeDefined();
        });

        // TODO - get the marchers to show up
        // expect(canvas.currentPage).toBeDefined();
        // // expect(canvas.currentPage.id).toBe(FIRST_PAGE_ID);
        // await waitFor(() => {
        //     expect(canvas.getCanvasMarchers()).toHaveLength(
        //         marchers.expectedMarchers.length,
        //     );
        // });
    });
});
