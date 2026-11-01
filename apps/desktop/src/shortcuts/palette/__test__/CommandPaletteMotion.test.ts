// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Less motion in the command bar's stylesheet. The test run stubs CSS imports to nothing, so the
 * file is read from disk.
 */
const css = fs.readFileSync(
    path.resolve(__dirname, "../CommandPalette.css"),
    "utf8",
);

/** The rules inside the stylesheet's `prefers-reduced-motion: reduce` block */
const lessMotion = () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start);
};

describe("the command bar with less motion", () => {
    it("the docked bar fades in rather than sliding", () => {
        expect(lessMotion()).toMatch(
            /\.docked-bar\s*\{[^}]*animation-name: palette-fade-in;/,
        );
    });
});
