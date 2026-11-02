import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { boxTool } from "../../box/boxTool";
import { curveTool, lineTool } from "../../line/lineTool";
import { rowTool } from "../../__test__/fakeRowKind";
import { savedShapeItems } from "../../command/useShapePaletteSource";
import { savedShapeRows } from "../../library/savedShapes";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import ShapePreviewIcon from "../ShapePreviewIcon";
import { PREVIEW_SPOTS } from "../shapePreview";

afterEach(cleanup);

const svgOf = (ui: React.ReactElement) =>
    render(ui).container.querySelector("svg")!;

describe("a shape's picture (#378)", () => {
    it("draws the box's spots and its outline", () => {
        const svg = svgOf(<ShapePreviewIcon kind={boxTool} />);
        expect(svg.querySelectorAll("circle")).toHaveLength(PREVIEW_SPOTS);
        expect(svg.querySelector("polygon")).not.toBeNull();
        expect(svg).toHaveAttribute("aria-hidden");
    });

    it("draws a test kind that has no icon from its spots alone", () => {
        const svg = svgOf(<ShapePreviewIcon kind={rowTool} />);
        expect(svg.querySelectorAll("circle")).toHaveLength(PREVIEW_SPOTS);
        expect(svg.querySelector("polygon")).toBeNull();
    });

    it("draws an open line and curve with a polyline, not a closed polygon", () => {
        for (const kind of [lineTool, curveTool]) {
            const svg = svgOf(<ShapePreviewIcon kind={kind} />);
            expect(svg.querySelector("polyline")).not.toBeNull();
            expect(svg.querySelector("polygon")).toBeNull();
            cleanup();
        }
    });

    it("leads with the outline: a full line and a fill, with smaller, lighter dots (#382)", () => {
        const svg = svgOf(<ShapePreviewIcon kind={boxTool} />);
        const outline = svg.querySelector("polygon")!;
        expect(outline).not.toHaveAttribute("stroke-opacity");
        expect(Number(outline.getAttribute("stroke-width"))).toBeGreaterThan(
            1.5,
        );
        expect(outline).toHaveAttribute("fill", "currentColor");
        const dot = svg.querySelector("circle")!;
        expect(Number(dot.getAttribute("fill-opacity"))).toBeLessThan(1);
        expect(Number(dot.getAttribute("r"))).toBeLessThan(
            Number(outline.getAttribute("stroke-width")),
        );
    });

    it("shows the picked shape through its fill, not bigger dots", () => {
        const plain = svgOf(<ShapePreviewIcon kind={boxTool} />);
        const fill = (svg: SVGSVGElement) =>
            Number(svg.querySelector("polygon")!.getAttribute("fill-opacity"));
        const r = (svg: SVGSVGElement) =>
            svg.querySelector("circle")!.getAttribute("r");
        const [plainFill, plainR] = [fill(plain), r(plain)];
        cleanup();
        const picked = svgOf(<ShapePreviewIcon kind={boxTool} picked />);
        expect(fill(picked)).toBeGreaterThan(plainFill * 2);
        expect(r(picked)).toBe(plainR);
        expect(picked).toHaveAttribute("data-picked", "true");
    });

    it("draws a kind's dots stronger when it has no outline to read by", () => {
        const dot = (kind: typeof boxTool | typeof rowTool) => {
            const circle = svgOf(
                <ShapePreviewIcon kind={kind} />,
            ).querySelector("circle")!;
            const found = {
                r: Number(circle.getAttribute("r")),
                opacity: Number(circle.getAttribute("fill-opacity")),
            };
            cleanup();
            return found;
        };
        const box = dot(boxTool);
        const row = dot(rowTool);
        expect(row.r).toBeGreaterThan(box.r);
        expect(row.opacity).toBeGreaterThan(box.opacity);
    });

    it("is the same picture in the command bar as anywhere else, for a saved shape too", () => {
        const [row] = savedShapeRows(
            [
                {
                    id: "wide",
                    name: "Wide box",
                    kind: "block",
                    kindVersion: 1,
                    intervals: { across: 4, deep: 1 },
                },
            ],
            [],
            SHAPE_TOOLS,
        );
        const [item] = savedShapeItems(
            [row],
            true,
            [{ id: 1 }],
            (key) => key,
            async () => {},
        );
        const inBar = svgOf(<>{item.icon}</>).outerHTML;
        cleanup();
        const own = svgOf(
            <ShapePreviewIcon kind={row.kind} size={18} />,
        ).outerHTML;
        expect(inBar).toBe(own);
        // ...and not the plain box's picture: the saved spacing shows
        cleanup();
        expect(
            svgOf(<ShapePreviewIcon kind={boxTool} size={18} />).outerHTML,
        ).not.toBe(own);
    });
});
