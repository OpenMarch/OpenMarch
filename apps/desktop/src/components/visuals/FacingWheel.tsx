/**
 * The facing wheel (performer-behavior.md section 7.2): a top-down dial for
 * a Facing cue's angle, drawn as the 2D field is, the audience at the
 * bottom and side 2 on the right. 0° faces the audience, 90° side 2, 180°
 * the backfield and 270° side 1 (`cueInputs.ts`). Dragging sets the angle
 * in whole degrees, with Shift in 45° steps; it saves on release.
 */
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslate } from "@tolgee/react";

const SIZE = 72;
const R = SIZE / 2 - 6;

/** The angle (°, 0 to 359) toward a point `dx` right and `dy` down of the center. */
export function wheelAngle(dx: number, dy: number, step = 1): number {
    const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
    const stepped = Math.round(degrees / step) * step;
    return ((stepped % 360) + 360) % 360;
}

export default function FacingWheel({
    degrees,
    onCommit,
}: {
    degrees: number;
    onCommit: (degrees: number) => void;
}) {
    const { t } = useTranslate();
    const [dragging, setDragging] = useState<number | null>(null);
    const shown = dragging ?? degrees;
    const angleAt = (e: ReactPointerEvent<SVGSVGElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        return wheelAngle(
            e.clientX - (box.left + box.width / 2),
            e.clientY - (box.top + box.height / 2),
            e.shiftKey ? 45 : 1,
        );
    };
    const rad = (shown * Math.PI) / 180;
    const tip = {
        x: SIZE / 2 + Math.sin(rad) * R,
        y: SIZE / 2 + Math.cos(rad) * R,
    };
    return (
        <svg
            width={SIZE}
            height={SIZE}
            role="slider"
            aria-label={t("visuals.cue.facingWheel")}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={shown}
            tabIndex={0}
            data-testid="visuals-facing-wheel"
            className="text-text cursor-pointer touch-none"
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(angleAt(e));
            }}
            onPointerMove={(e) => {
                if (dragging !== null) setDragging(angleAt(e));
            }}
            onPointerUp={() => {
                if (dragging !== null && dragging !== degrees)
                    onCommit(dragging);
                setDragging(null);
            }}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={(e) => {
                const step = e.shiftKey ? 45 : 5;
                const turn =
                    e.key === "ArrowRight" || e.key === "ArrowUp"
                        ? step
                        : e.key === "ArrowLeft" || e.key === "ArrowDown"
                          ? -step
                          : 0;
                if (!turn) return;
                // the wheel's arrows, not the app's nudge or page step
                e.preventDefault();
                e.stopPropagation();
                onCommit((degrees + turn + 360) % 360);
            }}
        >
            <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.3}
            />
            {/* the audience side */}
            <line
                x1={SIZE / 2 - R}
                y1={SIZE - 2}
                x2={SIZE / 2 + R}
                y2={SIZE - 2}
                stroke="currentColor"
                strokeOpacity={0.5}
                strokeWidth={2}
            />
            <line
                x1={SIZE / 2}
                y1={SIZE / 2}
                x2={tip.x}
                y2={tip.y}
                stroke="var(--color-accent)"
                strokeWidth={3}
                strokeLinecap="round"
            />
            <circle cx={tip.x} cy={tip.y} r={4} fill="var(--color-accent)" />
        </svg>
    );
}
