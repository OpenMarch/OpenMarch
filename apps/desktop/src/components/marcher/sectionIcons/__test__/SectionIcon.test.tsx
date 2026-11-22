import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SECTIONS } from "@/global/classes/Sections";
import SectionIcon, {
    MarchingTubaIcon,
    SECTION_ICONS,
    getSectionIcon,
} from "../SectionIcon";

describe("section icons", () => {
    it("has exactly one icon for every section", () => {
        expect(Object.keys(SECTION_ICONS).sort()).toEqual(
            Object.keys(SECTIONS).sort(),
        );
    });

    it.each(Object.entries(SECTIONS))(
        "renders the %s icon from its section name",
        (key, section) => {
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
                svg?.querySelectorAll("path, circle, line, ellipse, rect")
                    .length,
            ).toBeGreaterThan(0);
        },
    );

    it("falls back to the Other icon for an unknown section", () => {
        expect(getSectionIcon("Kazoo")).toBe(SECTION_ICONS.Other);
    });

    it("offers the marching tuba alongside the sousaphone", () => {
        const { container } = render(<MarchingTubaIcon size={24} />);
        expect(container.querySelector("svg")).not.toBeNull();
        expect(MarchingTubaIcon).not.toBe(SECTION_ICONS.Tuba);
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
