import { cleanup, render, screen } from "@testing-library/react";
import { StaticMarcherCoordinateSheet } from "../MarcherCoordinateSheet";
import * as globalMocks from "@/__mocks__/globalMocks";
import FieldProperties from "@/global/classes/FieldProperties";
import { Marcher } from "@/global/classes/Marcher";
import { describe, expect, it, afterEach } from "vitest";

describe("StaticMarcherCoordinateSheet", () => {
    const mockMarcher = globalMocks.mockMarchers[0];

    const mockFieldProperties = globalMocks.mockNCAAFieldProperties;

    const mockPages = globalMocks.mockPages;

    const mockMarcherPages = globalMocks.mockMarcherPages;

    afterEach(() => {
        cleanup();
    });

    it("renders without error", () => {
        render(
            <StaticMarcherCoordinateSheet
                marcher={mockMarcher}
                fieldProperties={mockFieldProperties}
                marcherPages={mockMarcherPages}
                pages={mockPages}
            />
        );
    });

    describe("error messages", () => {
        it("displays error message when field properties are not provided", () => {
            render(
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    marcherPages={mockMarcherPages}
                    fieldProperties={undefined as unknown as FieldProperties}
                    pages={mockPages}
                />
            );

            expect(
                screen.findByText("Error exporting coordinate sheet")
            ).toBeTruthy();
            expect(
                screen.findByText("No field properties provided")
            ).toBeTruthy();
        });

        it("displays error message when marcher is not provided", () => {
            render(
                <StaticMarcherCoordinateSheet
                    marcher={undefined as unknown as Marcher}
                    fieldProperties={mockFieldProperties}
                    marcherPages={mockMarcherPages}
                    pages={mockPages}
                />
            );

            expect(
                screen.findByText("Error exporting coordinate sheet")
            ).toBeTruthy();
            expect(screen.findByText("No marcher provided")).toBeTruthy();
        });

        it("displays error message when no pages are provided", () => {
            render(
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    pages={[]}
                    fieldProperties={mockFieldProperties}
                    marcherPages={mockMarcherPages}
                />
            );

            expect(
                screen.findByText("Error exporting coordinate sheet")
            ).toBeTruthy();
            expect(screen.findByText("No pages provided")).toBeTruthy();
        });

        it("displays error message when no marcher pages are provided", () => {
            render(
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    fieldProperties={mockFieldProperties}
                    pages={mockPages}
                    marcherPages={[]}
                />
            );

            expect(
                screen.findByText("Error exporting coordinate sheet")
            ).toBeTruthy();
            expect(screen.findByText("No marcher pages provided")).toBeTruthy();
        });

        it("displays all error messages", () => {
            render(
                <StaticMarcherCoordinateSheet
                    marcher={undefined as unknown as Marcher}
                    fieldProperties={undefined as unknown as FieldProperties}
                    pages={[]}
                    marcherPages={[]}
                />
            );

            expect(
                screen.findByText("Error exporting coordinate sheet")
            ).toBeTruthy();
            expect(
                screen.findByText("No field properties provided")
            ).toBeTruthy();
            expect(screen.findByText("No marcher provided")).toBeTruthy();
            expect(screen.findByText("No pages provided")).toBeTruthy();
            expect(screen.findByText("No marcher pages provided")).toBeTruthy();
        });
    });

    describe("header", () => {
        it("displays the correct header (mockMarcher[0])", () => {
            const mockMarcher = globalMocks.mockMarchers[0];
            render(
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    fieldProperties={mockFieldProperties}
                    marcherPages={mockMarcherPages}
                    pages={mockPages}
                />
            );

            expect(screen.getByLabelText("marcher header")).toBeTruthy();
            expect(
                screen.getByLabelText("marcher drill number").textContent
            ).toEqual(mockMarcher.drill_number);
            expect(screen.getByLabelText("marcher name").textContent).toEqual(
                mockMarcher.name
            );
            expect(
                screen.getByLabelText("marcher section").textContent
            ).toEqual(mockMarcher.section);
        });

        it("displays the correct header (mockMarcher[0])", () => {
            const mockMarcher = globalMocks.mockMarchers[1];
            render(
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    fieldProperties={mockFieldProperties}
                    marcherPages={mockMarcherPages}
                    pages={mockPages}
                />
            );

            expect(screen.getByLabelText("marcher header")).toBeTruthy();
            expect(
                screen.getByLabelText("marcher drill number").textContent
            ).toEqual(mockMarcher.drill_number);
            expect(screen.getByLabelText("marcher name").textContent).toEqual(
                mockMarcher.name
            );
            expect(
                screen.getByLabelText("marcher section").textContent
            ).toEqual(mockMarcher.section);
        });
    });

    /** TODO - Finish these tests */
});
