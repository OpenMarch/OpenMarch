import { useMemo } from "react";
import type { ToolChoicePicture } from "../tool/toolKind";
import { CHOICE_PICTURE, fitChoicePicture } from "../preview/choicePicture";

/**
 * An answer's sketch (#559), beside its name in a shape menu and on the menu's button. Drawn in
 * the text's color, so it follows the theme, the picked answer's accent and a greyed-out answer.
 * It's decoration: the name beside it says what it is.
 */
export function ChoicePicture({
    picture,
    testId,
}: {
    picture: ToolChoicePicture;
    testId?: string;
}) {
    const fitted = useMemo(() => fitChoicePicture(picture), [picture]);
    const { width, height } = CHOICE_PICTURE;
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
            focusable={false}
            className="shrink-0"
            data-testid={testId}
            data-spots={fitted.dots.length}
        >
            {fitted.lines.map((line, i) => {
                const props = {
                    points: line.points
                        .map(({ x, y }) => `${x},${y}`)
                        .join(" "),
                    fill: "none",
                    stroke: "currentColor",
                    strokeOpacity: line.faint ? 0.5 : 0.9,
                    strokeWidth: line.faint ? 1 : 1.25,
                    strokeDasharray: line.dashed ? "1.5 1.5" : undefined,
                    strokeLinejoin: "round" as const,
                    strokeLinecap: "round" as const,
                };
                return line.closed ? (
                    <polygon key={i} {...props} />
                ) : (
                    <polyline key={i} {...props} />
                );
            })}
            {fitted.faintDots?.map(({ x, y }, i) => (
                <circle
                    key={`from-${i}`}
                    cx={x}
                    cy={y}
                    r={1}
                    fill="currentColor"
                    fillOpacity={0.4}
                />
            ))}
            {fitted.dots.map(({ x, y }, i) => (
                <circle key={i} cx={x} cy={y} r={1.1} fill="currentColor" />
            ))}
        </svg>
    );
}
