// cspell:ignore parsererror
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    drillChartSvg,
    fieldImagePlacement,
    fieldSvg,
    type DrillChartDot,
} from "../drillChartSvg";

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const theme = fieldProperties.theme;

const parse = (svg: string) => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    return doc;
};

const dot = (overrides: Partial<DrillChartDot> = {}): DrillChartDot => ({
    marcherId: 7,
    label: "T7",
    x: 412.25,
    y: 300.5,
    appearances: [],
    ...overrides,
});

const chart = (
    dots: DrillChartDot[],
    focus?: Parameters<typeof drillChartSvg>[0]["focus"],
) =>
    parse(
        drillChartSvg({
            fieldProperties,
            field: fieldSvg(fieldProperties, {
                gridLines: true,
                halfLines: true,
            }),
            dots,
            focus,
        }),
    );

const marker = (doc: Document) =>
    doc.querySelector('[data-marcher-id="7"]') as SVGElement;

/** Where a marker's origin is moved to */
const translation = (element: Element) =>
    element
        .getAttribute("transform")!
        .match(/translate\(([^ ]+) ([^)]+)\)/)!
        .slice(1)
        .map(Number);

describe("drillChartSvg", () => {
    it("draws a dot exactly on its stored coordinate", () => {
        const circle = marker(chart([dot()]));
        expect(circle.tagName).toBe("circle");
        expect(translation(circle)).toEqual([412.25, 300.5]);
        expect(circle.getAttribute("cx")).toBe("0");
        expect(circle.getAttribute("cy")).toBe("0");
    });

    it("centers the drill number above the dot", () => {
        const doc = chart([dot()]);
        const label = [...doc.querySelectorAll("text")].find(
            (t) => t.textContent === "T7",
        )!;
        expect(label.getAttribute("x")).toBe("412.25");
        expect(label.getAttribute("text-anchor")).toBe("middle");
        expect(Number(label.getAttribute("y"))).toBeLessThan(300.5);
    });

    it("escapes drill numbers and drops characters XML forbids", () => {
        const label = 'A<1> & "B"\u0001\u001f';
        const doc = chart([dot({ label })]);
        const text = [...doc.querySelectorAll("text")].find((t) =>
            t.textContent?.startsWith("A<"),
        )!;
        expect(text.textContent).toBe('A<1> & "B"');
    });

    it("leaves out a hidden marcher and a hidden label", () => {
        const hidden = chart([
            dot({ appearances: [{ visible: false, label_visible: false }] }),
        ]);
        expect(marker(hidden)).toBeNull();
        expect(hidden.documentElement.textContent).not.toContain("T7");

        const noLabel = chart([
            dot({ appearances: [{ visible: true, label_visible: false }] }),
        ]);
        expect(marker(noLabel)).not.toBeNull();
        expect(noLabel.documentElement.textContent).not.toContain("T7");
    });

    it("draws each shape centered on the coordinate", () => {
        const shape = (shape_type: string) =>
            marker(
                chart([
                    dot({
                        appearances: [
                            { visible: true, label_visible: true, shape_type },
                        ],
                    }),
                ]),
            );

        const square = shape("square");
        const side = Number(square.getAttribute("width"));
        expect(translation(square)).toEqual([412.25, 300.5]);
        expect(Number(square.getAttribute("x")) + side / 2).toBeCloseTo(0);
        expect(Number(square.getAttribute("y")) + side / 2).toBeCloseTo(0);

        const triangle = shape("triangle");
        const points = triangle
            .getAttribute("points")!
            .split(" ")
            .map((p) => p.split(",").map(Number));
        expect(translation(triangle)).toEqual([412.25, 300.5]);
        expect(points[1]![0]).toBeCloseTo(0);

        const cross = shape("x");
        expect(cross.querySelectorAll("line")).toHaveLength(2);
    });

    it("uses the first color in the appearance stack, then the theme's", () => {
        const fill = { r: 200, g: 50, b: 75, a: 0.5 };
        const circle = marker(
            chart([
                dot({
                    appearances: [
                        {
                            visible: true,
                            label_visible: true,
                            fill_color: fill,
                        },
                        {
                            visible: true,
                            label_visible: true,
                            fill_color: { r: 1, g: 2, b: 3, a: 1 },
                        },
                    ],
                }),
            ]),
        );
        expect(circle.getAttribute("fill")).toBe("rgb(200,50,75)");
        expect(circle.getAttribute("fill-opacity")).toBe("0.5");
        const outline = theme.defaultMarcher.outline;
        expect(circle.getAttribute("stroke")).toBe(
            `rgb(${outline.r},${outline.g},${outline.b})`,
        );
    });

    it("draws an individual chart's paths between exact coordinates, with the marcher on top", () => {
        const current = dot();
        const doc = chart([current, dot({ marcherId: 8, x: 100, y: 100 })], {
            dot: current,
            path: {
                previous: { x: 400, y: 280 },
                current,
                next: { x: 430, y: 310 },
            },
        });
        const lines = [...doc.querySelectorAll("line")].filter(
            (l) => l.getAttribute("stroke-width") === "2",
        );
        const ends = lines.map((l) =>
            ["x1", "y1", "x2", "y2"].map((a) => l.getAttribute(a)),
        );
        expect(ends).toContainEqual(["400", "280", "412.25", "300.5"]);
        expect(ends).toContainEqual(["412.25", "300.5", "430", "310"]);
        // A box on the previous position, a circle on the next
        expect(
            doc.querySelector('rect[x="390"][y="270"][width="20"]'),
        ).not.toBeNull();
        expect(
            doc.querySelector('circle[cx="430"][cy="310"][r="10"]'),
        ).not.toBeNull();
        // The focused marcher is drawn again last
        const markers = doc.querySelectorAll('[data-marcher-id="7"]');
        expect(markers).toHaveLength(2);
        expect(doc.documentElement.lastElementChild).toBe(markers[1]);
    });
});

describe("fieldSvg", () => {
    const xs = (svg: string) =>
        [
            ...parse(
                `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`,
            ).querySelectorAll("line"),
        ]
            .filter((l) => l.getAttribute("x1") === l.getAttribute("x2"))
            .map((l) => Number(l.getAttribute("x1")));

    it("draws grid lines exactly on the steps from center front", () => {
        const lines = xs(
            fieldSvg(fieldProperties, { gridLines: true, halfLines: false }),
        );
        const { xPixels } = fieldProperties.centerFrontPoint;
        expect(lines).toContain(xPixels);
        expect(lines).toContain(xPixels + fieldProperties.pixelsPerStep);
        expect(lines).toContain(xPixels - fieldProperties.pixelsPerStep);
    });

    it("never draws a grid line outside the field", () => {
        const offField = new FieldProperties({
            ...fieldProperties,
            centerFrontPoint: {
                ...fieldProperties.centerFrontPoint,
                xPixels: -5,
            },
        });
        const lines = xs(
            fieldSvg(offField, { gridLines: true, halfLines: true }),
        );
        const yardLines = new Set(
            offField.xCheckpoints
                .filter((c) => c.visible)
                .map(
                    (c) =>
                        offField.centerFrontPoint.xPixels +
                        c.stepsFromCenterFront * offField.pixelsPerStep,
                ),
        );
        for (const x of lines.filter((x) => !yardLines.has(x))) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(offField.width);
        }
    });

    it("leaves out grid and half lines when they're off", () => {
        const all = fieldSvg(fieldProperties, {
            gridLines: true,
            halfLines: true,
        });
        const none = fieldSvg(fieldProperties, {
            gridLines: false,
            halfLines: false,
        });
        const visibleYardLines = fieldProperties.xCheckpoints.filter(
            (c) => c.visible,
        ).length;
        expect(xs(none)).toHaveLength(visibleYardLines);
        expect(xs(all).length).toBeGreaterThan(xs(none).length);
    });

    it("draws the field image only when the field shows it", () => {
        const image = { href: "data:x", width: 100, height: 100 };
        const shown = fieldSvg(fieldProperties, {
            gridLines: false,
            halfLines: false,
            image,
        });
        expect(shown).toContain("<image");
        const hidden = fieldSvg(
            new FieldProperties({ ...fieldProperties, showFieldImage: false }),
            { gridLines: false, halfLines: false, image },
        );
        expect(hidden).not.toContain("<image");
    });

    it("stretches an image of unknown size over the field", () => {
        const svg = fieldSvg(fieldProperties, {
            gridLines: false,
            halfLines: false,
            image: { href: "data:x", width: 0, height: 0 },
        });
        const image = parse(
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${svg}</svg>`,
        ).querySelector("image")!;
        expect(
            ["x", "y", "width", "height"].map((a) =>
                Number(image.getAttribute(a)),
            ),
        ).toEqual([
            0,
            0,
            expect.closeTo(fieldProperties.width, 2),
            expect.closeTo(fieldProperties.height, 2),
        ]);
    });
});

describe("fieldImagePlacement", () => {
    const field = { width: 200, height: 100 };

    it("fits a tall image inside the field, centered", () => {
        expect(
            fieldImagePlacement(
                { ...field, imageFillOrFit: "fit" },
                { width: 50, height: 100 },
            ),
        ).toEqual({ x: 75, y: 0, width: 50, height: 100 });
    });

    it("fills the field with a tall image, centered", () => {
        expect(
            fieldImagePlacement(
                { ...field, imageFillOrFit: "fill" },
                { width: 50, height: 100 },
            ),
        ).toEqual({ x: 0, y: -150, width: 200, height: 400 });
    });
});
