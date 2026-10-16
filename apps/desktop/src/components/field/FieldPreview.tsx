import { useMemo } from "react";
import { FieldProperties } from "@openmarch/core";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { fieldSvg } from "@/components/exporting/utils/drillChartSvg";

interface FieldPreviewProps {
    fieldProperties: FieldProperties;
    className?: string;
}

/**
 * Space around the field, as a fraction of its size on each side: the field fills 80% of the
 * preview's width or height, whichever fits first.
 */
const MARGIN = 0.125;

/**
 * A picture of a field template, drawn as SVG from its properties with the drill charts'
 * field (`fieldSvg`), with no canvas (#207). It has no field image: a template has none yet.
 */
export default function FieldPreview({
    fieldProperties,
    className = "",
}: FieldPreviewProps) {
    const src = useMemo(() => {
        const { width, height } = fieldProperties;
        const field = fieldSvg(fieldProperties, {
            gridLines: defaultSettings.gridLines,
            halfLines: defaultSettings.halfLines,
        });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-width * MARGIN} ${-height * MARGIN} ${width * (1 + 2 * MARGIN)} ${height * (1 + 2 * MARGIN)}" preserveAspectRatio="xMidYMid meet">${field}</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }, [fieldProperties]);

    return (
        <div
            className={`rounded-12 border-stroke bg-bg-1 pointer-events-none relative overflow-hidden border ${className}`}
            style={{ maxHeight: "400px" }}
        >
            <img
                src={src}
                alt=""
                data-testid="fieldPreview"
                className="block h-full w-full"
            />
        </div>
    );
}
