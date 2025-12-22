import { describe, expect, it } from "vitest";
import { appearanceIsHidden } from "../appearance";

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
});
