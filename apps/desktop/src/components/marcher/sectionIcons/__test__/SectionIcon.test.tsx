import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SECTIONS } from "@/global/classes/Sections";
import SectionIcon, {
    MarchingTubaIcon,
    SabreIcon,
    SECTION_ICONS,
    getSectionIcon,
} from "../SectionIcon";

/**
 * The fork's front ensemble sections that upstream's icon set (#1071) doesn't draw yet: they show
 * the Other icon.
 */
const WITHOUT_ICON = ["DrumSet", "Glockenspiel", "Rack", "Timpani"];

describe("section icons", () => {
    it("has exactly one icon for every section, apart from the ones not drawn yet", () => {
        expect(Object.keys(SECTION_ICONS).sort()).toEqual(
            Object.keys(SECTIONS)
                .filter((key) => !WITHOUT_ICON.includes(key))
                .sort(),
        );
    });

    it.each(WITHOUT_ICON)("shows the Other icon for %s", (key) => {
        expect(getSectionIcon(SECTIONS[key]!.name)).toBe(SECTION_ICONS.Other);
    });

    it.each(
        Object.entries(SECTIONS).filter(([key]) => !WITHOUT_ICON.includes(key)),
    )("renders the %s icon from its section name", (key, section) => {
        expect(getSectionIcon(section.name)).toBe(
            SECTION_ICONS[key as keyof typeof SECTION_ICONS],
        );
        const { container } = render(
            <SectionIcon section={section.name} size={24} />,
        );
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("viewBox")).toBe("0 0 256 256");
        expect(svg?.getAttribute("width")).toBe("24");
        expect(
            svg?.querySelectorAll("path, circle, line, ellipse, rect").length,
        ).toBeGreaterThan(0);
    });

    it("falls back to the Other icon for an unknown section", () => {
        expect(getSectionIcon("Kazoo")).toBe(SECTION_ICONS.Other);
    });

    it("offers the marching tuba alongside the sousaphone", () => {
        const { container } = render(<MarchingTubaIcon size={24} />);
        expect(container.querySelector("svg")).not.toBeNull();
        expect(MarchingTubaIcon).not.toBe(SECTION_ICONS.Tuba);
    });

    it("draws the Equipment catalog's sabre, its own icon in the same style (#992)", () => {
        const { container } = render(<SabreIcon size={24} weight="bold" />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("viewBox")).toBe("0 0 256 256");
        expect(svg?.getAttribute("width")).toBe("24");
        // Lying flat, shown at 45 degrees like the Rifle, with bold's strokes
        const drawing = svg?.querySelector("g");
        expect(drawing?.getAttribute("transform")).toBe("rotate(-45 128 128)");
        const [main, detail] = [...(drawing?.children ?? [])];
        expect(main?.getAttribute("stroke-width")).toBe("20");
        expect(detail?.getAttribute("stroke-width")).toBe("12");
        expect(
            main?.querySelectorAll("path, line, circle").length,
        ).toBeGreaterThan(0);
        expect(SabreIcon).not.toBe(SECTION_ICONS.Other);
        expect(SabreIcon).not.toBe(SECTION_ICONS.ColorGuard);
    });

    it("follows the weight prop", () => {
        const { container } = render(
            <SectionIcon section="Trumpet" weight="thin" />,
        );
        expect(
            container.querySelector("g > g")?.getAttribute("stroke-width"),
        ).toBe("8");
    });
});
