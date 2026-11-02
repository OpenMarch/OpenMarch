import { useMemo } from "react";
import type { AnyToolKind } from "../tool/toolKind";
import { PREVIEW_VIEW, shapePreview } from "./shapePreview";

/**
 * A shape's picture, drawn from its own spots and outline (#378), in place of an icon. Every
 * place that offers shapes shows this one: the Shapes tab, the ring, the library and the command
 * bar. It's decoration: the button around it carries the shape's name.
 *
 * The outline leads and the dots follow (#382): a full-strength line with a faint fill reads as a
 * shape at tab size, where dots alone read as a pile of dots. Picked, the fill gets stronger; the
 * button around it sets the color. A kind with no outline draws its dots stronger instead.
 */
export default function ShapePreviewIcon({
    kind,
    size = 22,
    picked = false,
    className,
}: {
    kind: AnyToolKind;
    /** Width and height, in pixels */
    size?: number;
    /** The armed or aimed-at shape: a stronger fill */
    picked?: boolean;
    className?: string;
}) {
    const { spots, outline, openOutline } = useMemo(
        () => shapePreview(kind),
        [kind],
    );
    const outlinePoints =
        outline?.map(({ x, y }) => `${x},${y}`).join(" ") ?? "";
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${PREVIEW_VIEW} ${PREVIEW_VIEW}`}
            aria-hidden
            focusable={false}
            className={className}
            data-testid="shape-preview"
            data-spots={spots.length}
            data-picked={picked}
        >
            {outline &&
                (openOutline ? (
                    <polyline
                        points={outlinePoints}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ) : (
                    <polygon
                        points={outlinePoints}
                        fill="currentColor"
                        fillOpacity={picked ? 0.3 : 0.1}
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinejoin="round"
                    />
                ))}
            {spots.map(({ x, y }, i) => (
                <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={outline ? 1 : 1.5}
                    fill="currentColor"
                    fillOpacity={outline ? 0.55 : 0.9}
                />
            ))}
        </svg>
    );
}
