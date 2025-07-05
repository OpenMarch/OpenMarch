import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionAppearance } from "../SectionAppearance";
import { TestSqlProxy } from "@/__mocks__/TestSqlProxy";

// Mock database responses
const mockDatabaseSectionAppearance = {
    id: 1,
    section: "Trumpet",
    fill_color: "rgba(255, 0, 0, 1)",
    outline_color: "rgba(0, 0, 0, 1)",
    shape_type: "circle",
    created_at: "2021-01-01T00:00:00Z",
    updated_at: "2021-01-01T00:00:00Z",
};

describe("SectionAppearance", () => {
    describe("constructor and color parsing", () => {
        it("should create a SectionAppearance object with correct properties", () => {
            const sectionAppearance = new SectionAppearance(
                mockDatabaseSectionAppearance,
            );

            expect(sectionAppearance).toBeInstanceOf(SectionAppearance);
            expect(sectionAppearance.id).toBe(1);
            expect(sectionAppearance.section).toBe("Trumpet");
            expect(sectionAppearance.fill_color).toEqual({
                r: 255,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(sectionAppearance.outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(sectionAppearance.shape_type).toBe("circle");
            expect(sectionAppearance.created_at).toBe("2021-01-01T00:00:00Z");
            expect(sectionAppearance.updated_at).toBe("2021-01-01T00:00:00Z");
        });

        it("should parse rgba colors with alpha correctly", () => {
            const testData = {
                ...mockDatabaseSectionAppearance,
                fill_color: "rgba(100, 150, 200, 0.5)",
                outline_color: "rgba(255, 165, 0, 0.8)",
            };

            const sectionAppearance = new SectionAppearance(testData);

            expect(sectionAppearance.fill_color).toEqual({
                r: 100,
                g: 150,
                b: 200,
                a: 0.5,
            });
            expect(sectionAppearance.outline_color).toEqual({
                r: 255,
                g: 165,
                b: 0,
                a: 0.8,
            });
        });

        it("should parse rgb colors without alpha (defaults to 1)", () => {
            const testData = {
                ...mockDatabaseSectionAppearance,
                fill_color: "rgb(100, 150, 200)",
                outline_color: "rgb(255, 165, 0)",
            };

            const sectionAppearance = new SectionAppearance(testData);

            expect(sectionAppearance.fill_color).toEqual({
                r: 100,
                g: 150,
                b: 200,
                a: 1,
            });
            expect(sectionAppearance.outline_color).toEqual({
                r: 255,
                g: 165,
                b: 0,
                a: 1,
            });
        });

        it("should default to black when color parsing fails", () => {
            const testData = {
                ...mockDatabaseSectionAppearance,
                fill_color: "not-a-color",
                outline_color: "also-not-a-color",
            };

            const sectionAppearance = new SectionAppearance(testData);

            expect(sectionAppearance.fill_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(sectionAppearance.outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
        });

        it("should handle malformed rgba values gracefully", () => {
            const testData = {
                ...mockDatabaseSectionAppearance,
                fill_color: "rgba(999, -50, abc, 2.5)",
                outline_color: "rgba()",
            };

            const sectionAppearance = new SectionAppearance(testData);

            // Should fall back to black for invalid colors
            expect(sectionAppearance.fill_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(sectionAppearance.outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
        });
    });

    describe("db", () => {
        beforeEach(async () => {
            const testSqlProxy = new TestSqlProxy();
            await testSqlProxy.initializeSchema();
            window.electron = {
                ...window.electron,
                sqlProxy: testSqlProxy.handleSqlProxy.bind(testSqlProxy),
            };
        });

        it("should create and read section appearances", async () => {
            const sectionAppearance = {
                section: "Trumpet",
                fill_color: { r: 255, g: 0, b: 0, a: 1 },
                outline_color: { r: 0, g: 0, b: 0, a: 1 },
                shape_type: "circle",
            };

            const createdSectionAppearance =
                await SectionAppearance.createSectionAppearances([
                    sectionAppearance,
                ]);

            expect(createdSectionAppearance).toHaveLength(1);
            expect(createdSectionAppearance[0].section).toBe("Trumpet");
            expect(createdSectionAppearance[0].fill_color).toEqual({
                r: 255,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(createdSectionAppearance[0].outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(createdSectionAppearance[0].shape_type).toBe("circle");

            const readSectionAppearance =
                await SectionAppearance.getSectionAppearances("Trumpet");
            expect(readSectionAppearance).toHaveLength(1);
            expect(readSectionAppearance[0].section).toBe("Trumpet");
            expect(readSectionAppearance[0].fill_color).toEqual({
                r: 255,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(readSectionAppearance[0].outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(readSectionAppearance[0].shape_type).toBe("circle");
        });

        it("should update section appearances", async () => {
            const sectionAppearance = {
                section: "Trumpet",
                fill_color: { r: 255, g: 0, b: 0, a: 1 },
                outline_color: { r: 0, g: 0, b: 0, a: 1 },
                shape_type: "circle",
            };

            const createdSectionAppearance =
                await SectionAppearance.createSectionAppearances([
                    sectionAppearance,
                ]);

            const updatedSectionAppearance =
                await SectionAppearance.updateSectionAppearances([
                    {
                        id: createdSectionAppearance[0].id,
                        fill_color: { r: 0, g: 255, b: 0, a: 1 },
                        outline_color: { r: 0, g: 0, b: 255, a: 1 },
                        shape_type: "square",
                    },
                ]);

            expect(updatedSectionAppearance).toHaveLength(1);
            expect(updatedSectionAppearance[0].section).toBe("Trumpet");
            expect(updatedSectionAppearance[0].fill_color).toEqual({
                r: 0,
                g: 255,
                b: 0,
                a: 1,
            });
            expect(updatedSectionAppearance[0].outline_color).toEqual({
                r: 0,
                g: 0,
                b: 255,
                a: 1,
            });
            expect(updatedSectionAppearance[0].shape_type).toBe("square");
        });

        it("should delete section appearances", async () => {
            const sectionAppearance = {
                section: "Trumpet",
                fill_color: { r: 255, g: 0, b: 0, a: 1 },
                outline_color: { r: 0, g: 0, b: 0, a: 1 },
                shape_type: "circle",
            };

            const createdSectionAppearance =
                await SectionAppearance.createSectionAppearances([
                    sectionAppearance,
                ]);

            const readSectionAppearance =
                await SectionAppearance.getSectionAppearances("Trumpet");
            expect(readSectionAppearance).toHaveLength(1);

            const deletedSectionAppearance =
                await SectionAppearance.deleteSectionAppearances([
                    createdSectionAppearance[0].id,
                ]);

            expect(deletedSectionAppearance).toHaveLength(1);
            expect(deletedSectionAppearance[0].section).toBe("Trumpet");
            expect(deletedSectionAppearance[0].fill_color).toEqual({
                r: 255,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(deletedSectionAppearance[0].outline_color).toEqual({
                r: 0,
                g: 0,
                b: 0,
                a: 1,
            });
            expect(deletedSectionAppearance[0].shape_type).toBe("circle");

            const readSectionAppearanceAfterDelete =
                await SectionAppearance.getSectionAppearances("Trumpet");
            expect(readSectionAppearanceAfterDelete).toHaveLength(0);
        });
    });
});
