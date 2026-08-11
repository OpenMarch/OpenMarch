import { describe, expect, it } from "vitest";
import { createFieldTheme } from "@openmarch/core";
import {
    appearanceIsHidden,
    resolveAppearanceFromStack,
    rgbaToSchemaString,
} from "../appearance";

describe("appearance", () => {
    describe("should be hidden", () => {
        it.for([
            {
                description: "if the first appearance is not visible",
                appearances: [
                    { visible: false },
                    { visible: true },
                    { visible: true },
                    { visible: true },
                    { visible: true },
                    { visible: true },
                ],
                expected: true,
            },
            {
                description: "if one appearance that is not visible",
                appearances: [{ visible: false }],
                expected: true,
            },
            {
                description: "if the second appearance is not visible",
                appearances: [
                    { visible: true },
                    { visible: false },
                    { visible: true },
                    { visible: true },
                    { visible: true },
                    { visible: true },
                ],
                expected: true,
            },
            {
                description:
                    "if only two appearances are present and the first is not visible",
                appearances: [{ visible: false }, { visible: true }],
                expected: true,
            },
            {
                description:
                    "if only two appearances are present and the second is not visible",
                appearances: [{ visible: true }, { visible: false }],
                expected: true,
            },
            {
                description: "if the third appearance is not visible",
                appearances: [
                    { visible: true },
                    { visible: true },
                    { visible: false },
                ],
                expected: false,
            },
            {
                description: "if all three appearances are visible",
                appearances: [
                    { visible: true },
                    { visible: true },
                    { visible: true },
                ],
                expected: false,
            },
            {
                description:
                    "if four appearances are present and the fourth is not visible",
                appearances: [
                    { visible: true },
                    { visible: true },
                    { visible: true },
                    { visible: false },
                    { visible: true },
                    { visible: true },
                ],
                expected: false,
            },
        ])("%# - $description", ({ appearances, expected, description }) => {
            expect(appearanceIsHidden(appearances), description).toBe(expected);
        });
    });

    describe("resolveAppearanceFromStack", () => {
        const fieldTheme = createFieldTheme({
            defaultMarcher: {
                fill: { r: 255, g: 0, b: 0, a: 1 },
                outline: { r: 0, g: 0, b: 0, a: 0.5 },
                label: { r: 0, g: 0, b: 0, a: 1 },
            },
            shapeType: "square",
        });

        it("uses theme defaults when stack has no color overrides", () => {
            const resolved = resolveAppearanceFromStack(
                [{ visible: true, label_visible: true }],
                fieldTheme,
            );
            expect(resolved.fillRgba).toBe(
                rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
            );
            expect(resolved.strokeRgba).toBe(
                rgbaToSchemaString(fieldTheme.defaultMarcher.outline),
            );
            expect(resolved.shape).toBe("circle");
            expect(resolved.strokeWidth).toBe(1);
        });

        it("cascades fill from lower-priority layer when higher layers omit color", () => {
            const resolved = resolveAppearanceFromStack(
                [
                    {
                        visible: true,
                        label_visible: true,
                        shape_type: "triangle",
                    },
                    {
                        visible: true,
                        label_visible: true,
                        fill_color: { r: 10, g: 20, b: 30, a: 1 },
                    },
                ],
                fieldTheme,
            );
            expect(resolved.fillRgba).toBe("rgba(10,20,30,1)");
            expect(resolved.shape).toBe("triangle");
        });

        it("maps shape_type x to cross", () => {
            const resolved = resolveAppearanceFromStack(
                [
                    {
                        visible: true,
                        label_visible: true,
                        shape_type: "x",
                    },
                ],
                fieldTheme,
            );
            expect(resolved.shape).toBe("cross");
        });

        it("uses second layer visible when first is visible marcher page placeholder", () => {
            const resolved = resolveAppearanceFromStack(
                [
                    { visible: true, label_visible: true },
                    { visible: false, label_visible: true },
                ],
                fieldTheme,
            );
            expect(resolved.visible).toBe(false);
            expect(resolved.textVisible).toBe(false);
        });
    });
});
