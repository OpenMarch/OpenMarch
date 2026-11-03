import { useMemo } from "react";
import type { OrderChoice } from "../assign";
import { ORDER_PICTURE_SIZE, orderPicture } from "./orderPictures";

/** The arrowhead's length, in CSS px */
const HEAD = 3;

/**
 * Who goes where's sketch (#559, design C) beside its name in the menu and on the menu's button:
 * the marchers as numbers where they stand, an arrow, then the new line read as a sequence. Drawn
 * in the text's color, so it follows the theme, the picked answer's accent and a greyed-out
 * answer. It's decoration: the name beside it says what it is.
 */
export function OrderPicture({
    choice,
    testId,
}: {
    choice: OrderChoice;
    testId?: string;
}) {
    const picture = useMemo(() => orderPicture(choice), [choice]);
    const { width, height } = ORDER_PICTURE_SIZE;
    const { arrow, line } = picture;
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
            focusable={false}
            className="shrink-0"
            data-testid={testId}
            data-sequence={picture.after.map((a) => a.n).join("")}
        >
            {picture.before.map(({ x, y, n }) => (
                <text
                    key={`before-${n}`}
                    x={x}
                    y={y}
                    fontSize={8.5}
                    fontWeight={500}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="currentColor"
                    fillOpacity={0.8}
                >
                    {n}
                </text>
            ))}
            <line
                x1={arrow.x1}
                y1={arrow.y}
                x2={arrow.x2 - HEAD + 0.3}
                y2={arrow.y}
                stroke="currentColor"
                strokeOpacity={0.6}
                strokeWidth={1}
                strokeLinecap="round"
            />
            <polygon
                points={`${arrow.x2},${arrow.y} ${arrow.x2 - HEAD},${arrow.y - HEAD * 0.55} ${arrow.x2 - HEAD},${arrow.y + HEAD * 0.55}`}
                fill="currentColor"
                fillOpacity={0.6}
            />
            <line
                x1={line.x1}
                y1={line.y}
                x2={line.x2}
                y2={line.y}
                stroke="currentColor"
                strokeOpacity={0.5}
                strokeWidth={1}
            />
            {picture.after.map(({ x, y, n }) => (
                <text
                    key={`after-${n}`}
                    x={x}
                    y={y}
                    fontSize={9.5}
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="currentColor"
                >
                    {n}
                </text>
            ))}
        </svg>
    );
}
