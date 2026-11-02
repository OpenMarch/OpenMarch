import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import { GlyphText } from "../GlyphText";

/**
 * The shape UI's direction marks (owner bug on #417: "↕" drew as a color emoji beside a plain
 * "↔"). They render as Phosphor icons, never as text a font may draw as an emoji.
 */

afterEach(cleanup);

/** Characters a platform may draw as a color emoji */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

describe("direction marks", () => {
    it("draw ↔ and ↕ as icons, with the rest as text", () => {
        const { container } = render(<GlyphText text="↔ 2 ↕ 2½ apart" />);
        expect(container.textContent).not.toMatch(PICTOGRAPHIC);
        expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe(
            "2 2½ apart",
        );
        expect(container.querySelectorAll("svg")).toHaveLength(2);
        expect(container.querySelector('[data-glyph="across"]')).not.toBeNull();
        expect(container.querySelector('[data-glyph="deep"]')).not.toBeNull();
    });

    it("every kind's parameter marks are ones drawn as icons", () => {
        for (const { kind } of SHAPE_TOOLS)
            for (const param of kind.params) {
                // A mark that follows the shape (a Line's Measured) is tested with its kind
                if (typeof param.glyph !== "string") continue;
                const { container } = render(<GlyphText text={param.glyph} />);
                expect(container.textContent).not.toMatch(PICTOGRAPHIC);
                expect(container.querySelectorAll("svg")).toHaveLength(1);
                cleanup();
            }
    });
});
