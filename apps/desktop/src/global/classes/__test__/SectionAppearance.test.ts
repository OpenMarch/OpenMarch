import { beforeEach, describe, expect, it } from "vitest";
import { SectionAppearance } from "../SectionAppearance";
import { setupTestSqlProxy } from "@/__mocks__/TestSqlProxy";

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
});
