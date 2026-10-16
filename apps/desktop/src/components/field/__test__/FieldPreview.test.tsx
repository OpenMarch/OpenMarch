import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import FieldPreview from "../FieldPreview";

/** The SVG the preview shows, from its image's data URL. */
const previewSvg = () => {
    const src = screen.getByTestId("fieldPreview").getAttribute("src")!;
    const prefix = "data:image/svg+xml;charset=utf-8,";
    expect(src.startsWith(prefix)).toBe(true);
    return new DOMParser().parseFromString(
        decodeURIComponent(src.slice(prefix.length)),
        "image/svg+xml",
    );
};

describe("FieldPreview", () => {
    const field =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

    it("draws the template's field with its yard numbers and checkpoint labels", () => {
        render(<FieldPreview fieldProperties={field} />);
        const svg = previewSvg();
        const texts = [...svg.querySelectorAll("text")].map(
            (t) => t.textContent,
        );
        expect(texts).toContain("50");
        expect(texts).toContain("FH");
        expect(svg.querySelectorAll("line").length).toBeGreaterThan(10);
    });

    it("fits the field in 80% of the preview, centered", () => {
        render(<FieldPreview fieldProperties={field} />);
        const root = previewSvg().documentElement;
        const [x, y, width, height] = root
            .getAttribute("viewBox")!
            .split(" ")
            .map(Number);
        expect(width * 0.8).toBeCloseTo(field.width);
        expect(height * 0.8).toBeCloseTo(field.height);
        expect(x).toBeCloseTo(-(width - field.width) / 2);
        expect(y).toBeCloseTo(-(height - field.height) / 2);
        expect(root.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    });
});
