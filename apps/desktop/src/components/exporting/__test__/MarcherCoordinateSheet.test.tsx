import { cleanup, render, screen } from "@testing-library/react";
import { StaticMarcherCoordinateSheet } from "../MarcherCoordinateSheet";
import * as globalMocks from "@/__mocks__/globalMocks";
import { FieldProperties } from "@openmarch/core";
import { Marcher } from "@/global/classes/Marcher";
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { databaseMarcherPagesToMarcherPages } from "@/global/classes/MarcherPage";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider
        tolgee={tolgee}
        fallback="Loading..." // loading fallback
    >
        {children}
    </TolgeeProvider>
);

describe("StaticMarcherCoordinateSheet", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    const mockMarcher = globalMocks.mockMarchers[0];

    const mockFieldProperties = globalMocks.mockNCAAFieldProperties;

    const mockPages = globalMocks.mockPages;

    // Convert DatabaseMarcherPage[] to MarcherPage[] for the component
    const mockMarcherPages = databaseMarcherPagesToMarcherPages(
        globalMocks.mockMarcherPages,
    );

    afterEach(() => {
        cleanup();
    });

    it("renders without error", () => {
        render(
            <Providers>
                <StaticMarcherCoordinateSheet
                    marcher={mockMarcher}
                    fieldProperties={mockFieldProperties}
                    marcherPages={mockMarcherPages}
                    pages={mockPages}
                />
            </Providers>,
        );
    });

    describe("error messages", () => {
        it("displays error message when field properties are not provided", () => {
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={mockMarcher}
                        marcherPages={mockMarcherPages}
                        fieldProperties={
                            undefined as unknown as FieldProperties
                        }
                        pages={mockPages}
                    />
                </Providers>,
            );

            expect(
                screen.findByText("Error exporting coordinate sheet"),
            ).toBeTruthy();
            expect(
                screen.findByText("No field properties provided"),
            ).toBeTruthy();
        });

        it("displays error message when marcher is not provided", () => {
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={undefined as unknown as Marcher}
                        fieldProperties={mockFieldProperties}
                        marcherPages={mockMarcherPages}
                        pages={mockPages}
                    />
                </Providers>,
            );

            expect(
                screen.findByText("Error exporting coordinate sheet"),
            ).toBeTruthy();
            expect(screen.findByText("No marcher provided")).toBeTruthy();
        });

        it("displays error message when no pages are provided", () => {
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={mockMarcher}
                        pages={[]}
                        fieldProperties={mockFieldProperties}
                        marcherPages={mockMarcherPages}
                    />
                </Providers>,
            );

            expect(
                screen.findByText("Error exporting coordinate sheet"),
            ).toBeTruthy();
            expect(screen.findByText("No pages provided")).toBeTruthy();
        });

        it("displays error message when no marcher pages are provided", () => {
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={mockMarcher}
                        fieldProperties={mockFieldProperties}
                        pages={mockPages}
                        marcherPages={[]}
                    />
                </Providers>,
            );

            expect(
                screen.findByText("Error exporting coordinate sheet"),
            ).toBeTruthy();
            expect(screen.findByText("No marcher pages provided")).toBeTruthy();
        });

        it("displays all error messages", () => {
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={undefined as unknown as Marcher}
                        fieldProperties={
                            undefined as unknown as FieldProperties
                        }
                        pages={[]}
                        marcherPages={[]}
                    />
                </Providers>,
            );

            expect(
                screen.findByText("Error exporting coordinate sheet"),
            ).toBeTruthy();
            expect(
                screen.findByText("No field properties provided"),
            ).toBeTruthy();
            expect(screen.findByText("No marcher provided")).toBeTruthy();
            expect(screen.findByText("No pages provided")).toBeTruthy();
            expect(screen.findByText("No marcher pages provided")).toBeTruthy();
        });
    });

    describe("header", () => {
        it("displays the correct header (mockMarcher[0])", async () => {
            const mockMarcher = globalMocks.mockMarchers[0];
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={mockMarcher}
                        fieldProperties={mockFieldProperties}
                        marcherPages={mockMarcherPages}
                        pages={mockPages}
                    />
                </Providers>,
            );

            expect(await screen.findByLabelText("marcher header")).toBeTruthy();
            expect(
                (await screen.findByLabelText("marcher drill number"))
                    .textContent,
            ).toEqual(mockMarcher.drill_number);
            expect(
                (await screen.findByLabelText("marcher name")).textContent,
            ).toEqual(mockMarcher.name);
            expect(
                (await screen.findByLabelText("marcher section")).textContent,
            ).toEqual(mockMarcher.section);
        });

        it("displays the correct header (mockMarcher[0])", async () => {
            const mockMarcher = globalMocks.mockMarchers[1];
            render(
                <Providers>
                    <StaticMarcherCoordinateSheet
                        marcher={mockMarcher}
                        fieldProperties={mockFieldProperties}
                        marcherPages={mockMarcherPages}
                        pages={mockPages}
                    />
                </Providers>,
            );

            expect(await screen.findByLabelText("marcher header")).toBeTruthy();
            expect(
                (await screen.findByLabelText("marcher drill number"))
                    .textContent,
            ).toEqual(mockMarcher.drill_number);
            expect(
                (await screen.findByLabelText("marcher name")).textContent,
            ).toEqual(mockMarcher.name);
            expect(
                (await screen.findByLabelText("marcher section")).textContent,
            ).toEqual(mockMarcher.section);
        });
    });

    /** TODO - Finish these tests */
});
