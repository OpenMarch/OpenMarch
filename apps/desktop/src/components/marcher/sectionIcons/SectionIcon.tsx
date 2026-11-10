import { forwardRef, useContext } from "react";
import {
    IconContext,
    type Icon,
    type IconProps,
    type IconWeight,
} from "@phosphor-icons/react";
import { SECTIONS, getSectionObjectByName } from "@/global/classes/Sections";
import {
    ALTERNATE_SECTION_ICON_GLYPHS,
    SECTION_ICON_GLYPHS,
    type SectionIconGlyph,
} from "./sectionIconGlyphs";

/** A key of {@link SECTIONS}, e.g. "BassDrum". */
export type SectionKey = keyof typeof SECTION_ICON_GLYPHS;

/**
 * Stroke widths on the 256 grid for the outline and for the finer detail lines
 * (valves, keys, tension rods). "regular" matches Phosphor's 16 unit stroke.
 * The glyphs are stroke-drawn, so "fill" and "duotone" fall back to "regular".
 */
const STROKE_WIDTHS: Record<IconWeight, { main: number; detail: number }> = {
    thin: { main: 8, detail: 6 },
    light: { main: 12, detail: 8 },
    regular: { main: 16, detail: 10 },
    bold: { main: 20, detail: 12 },
    fill: { main: 16, detail: 10 },
    duotone: { main: 16, detail: 10 },
};

function createSectionIcon(displayName: string, glyph: SectionIconGlyph): Icon {
    const SectionGlyphIcon = forwardRef<SVGSVGElement, IconProps>(
        (props, ref) => {
            const { alt, color, size, weight, mirrored, children, ...rest } =
                props;
            const {
                color: contextColor = "currentColor",
                size: contextSize,
                weight: contextWeight = "regular",
                mirrored: contextMirrored = false,
                ...contextRest
            } = useContext(IconContext);
            const strokeColor = color ?? contextColor;
            const widths = STROKE_WIDTHS[weight ?? contextWeight];

            return (
                <svg
                    ref={ref}
                    xmlns="http://www.w3.org/2000/svg"
                    width={size ?? contextSize}
                    height={size ?? contextSize}
                    viewBox="0 0 256 256"
                    fill="none"
                    transform={
                        mirrored || contextMirrored ? "scale(-1, 1)" : undefined
                    }
                    {...contextRest}
                    {...rest}
                >
                    {!!alt && <title>{alt}</title>}
                    {children}
                    <g
                        transform={
                            glyph.diagonal ? "rotate(-45 128 128)" : undefined
                        }
                        stroke={strokeColor}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <g strokeWidth={widths.main}>{glyph.main}</g>
                        {glyph.detail && (
                            <g strokeWidth={widths.detail}>{glyph.detail}</g>
                        )}
                        {glyph.solid && (
                            <g fill={strokeColor} stroke="none">
                                {glyph.solid}
                            </g>
                        )}
                    </g>
                </svg>
            );
        },
    );
    SectionGlyphIcon.displayName = `${displayName}SectionIcon`;
    return SectionGlyphIcon;
}

/**
 * One icon per section, keyed like {@link SECTIONS}. Each is a Phosphor-compatible
 * icon component: it takes `size`, `color`, `weight`, `mirrored` and honors `IconContext`.
 */
export const SECTION_ICONS = Object.fromEntries(
    Object.entries(SECTION_ICON_GLYPHS).map(([key, glyph]) => [
        key,
        createSectionIcon(key, glyph),
    ]),
) as Record<SectionKey, Icon>;

/** Drawn as a marching (bell-front, shoulder-carried) tuba. SECTION_ICONS.Tuba is the sousaphone. */
export const MarchingTubaIcon = createSectionIcon(
    "MarchingTuba",
    ALTERNATE_SECTION_ICON_GLYPHS.MarchingTuba,
);

/**
 * Gets the icon for a section by the name stored on a marcher, e.g. "Bass Drum".
 * Unknown names get the "Other" icon, the same fallback as {@link getSectionObjectByName}.
 */
export function getSectionIcon(sectionName: string): Icon {
    const section = getSectionObjectByName(sectionName);
    const key = Object.keys(SECTIONS).find((k) => SECTIONS[k] === section);
    return SECTION_ICONS[key as SectionKey] ?? SECTION_ICONS.Other;
}

/** Renders the icon for a section by the name stored on a marcher. */
export default function SectionIcon({
    section,
    ...props
}: IconProps & { section: string }) {
    const IconForSection = getSectionIcon(section);
    return <IconForSection {...props} />;
}
